/**
 * The Warden page in Jira (Apps → Warden), built with UI Kit.
 *
 * Four tabs: Approvals (what needs me), Activity (every decision), Mandate (the rules), and
 * Simulator (judge a bulk plan before anything runs). All data comes from the resolver in
 * src/index.js through invoke().
 */
import React, { useEffect, useState } from "react";
import ForgeReconciler, {
  Box,
  Button,
  ButtonGroup,
  DynamicTable,
  EmptyState,
  Heading,
  Inline,
  Lozenge,
  ProgressBar,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  Textfield,
  Label,
  HelperMessage,
  Badge,
  xcss,
} from "@forge/react";
import { invoke } from "@forge/bridge";

// ---------- small presentational pieces ----------

const VERDICT = {
  allow: { label: "Cleared", appearance: "success" },
  hold: { label: "Hold", appearance: "moved" },
  deny: { label: "Refused", appearance: "removed" },
};

const STATUS_TEXT = {
  executed: "Executed",
  pending: "Waiting for a person",
  approved: "Approved and executed",
  declined: "Declined, nothing written",
  refused: "No write",
  failed: "Jira refused the change",
};

const cardStyle = xcss({
  borderColor: "color.border",
  borderStyle: "solid",
  borderWidth: "border.width",
  borderRadius: "border.radius.200",
  padding: "space.200",
  backgroundColor: "elevation.surface",
});

const receiptStyle = xcss({
  borderColor: "color.border",
  borderStyle: "solid",
  borderWidth: "border.width",
  borderRadius: "border.radius.200",
  padding: "space.200",
  backgroundColor: "elevation.surface.sunken",
});

const Verdict = ({ decision }) => <Lozenge appearance={VERDICT[decision]?.appearance || "default"}>{VERDICT[decision]?.label || decision}</Lozenge>;

const when = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const Reasons = ({ reasons }) =>
  (reasons || []).length === 0 ? (
    <Text>Every rule passed.</Text>
  ) : (
    <Stack space="space.050">
      {reasons.map((r) => (
        <Text key={r.code + r.message}>
          <Lozenge>{r.code.toLowerCase().replaceAll("_", "-")}</Lozenge> {r.message}
        </Text>
      ))}
    </Stack>
  );

// ---------- Approvals ----------

function Approvals({ approvals, onDecide, busyId, notice }) {
  if (approvals.length === 0) {
    return (
      <EmptyState
        header="No decisions waiting"
        description="When the agent asks for a change that needs a person, it waits here with the exact change and the rule that held it."
      />
    );
  }
  return (
    <Stack space="space.200">
      {notice && <SectionMessage appearance={notice.ok ? "success" : "warning"}>{notice.message}</SectionMessage>}
      {approvals.map((a) => (
        <Box key={a.id} xcss={receiptStyle}>
          <Stack space="space.150">
            <Inline spread="space-between" alignBlock="center">
              <Inline space="space.100" alignBlock="center">
                <Heading size="small">{a.issueKey}</Heading>
                <Verdict decision="hold" />
              </Inline>
              <Text>Requested {when(a.createdAt)}</Text>
            </Inline>
            <Text>
              <Text weight="bold">{a.change}</Text>
            </Text>
            <Reasons reasons={a.reasons} />
            <Text>Approving runs this one change with your Jira permissions. Warden checks the issue again first.</Text>
            <ButtonGroup>
              <Button appearance="primary" isDisabled={busyId === a.id} onClick={() => onDecide("approve", a.id)}>
                Approve this change
              </Button>
              <Button appearance="subtle" isDisabled={busyId === a.id} onClick={() => onDecide("decline", a.id)}>
                Decline
              </Button>
            </ButtonGroup>
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

// ---------- Activity ----------

function Activity({ ledger }) {
  if (ledger.length === 0) {
    return <EmptyState header="Your first decision starts here" description="Ask the Triage Steward agent in Rovo to change an issue. Every request lands here with its verdict." />;
  }
  const head = {
    cells: [
      { key: "when", content: "When" },
      { key: "issue", content: "Issue" },
      { key: "change", content: "Requested change" },
      { key: "verdict", content: "Verdict" },
      { key: "result", content: "Result" },
      { key: "rule", content: "Rule" },
    ],
  };
  const rows = ledger.map((e) => ({
    key: e.id,
    cells: [
      { key: "when", content: when(e.at) },
      { key: "issue", content: e.issueKey },
      { key: "change", content: e.change || "-" },
      { key: "verdict", content: <Verdict decision={e.verdict?.decision} /> },
      { key: "result", content: STATUS_TEXT[e.status] || e.status },
      { key: "rule", content: (e.verdict?.reasons || []).map((r) => r.code.toLowerCase().replaceAll("_", "-")).join(", ") || "-" },
    ],
  }));
  return <DynamicTable head={head} rows={rows} rowsPerPage={15} />;
}

// ---------- Mandate ----------

const KIND_OPTIONS = [
  { label: "Transition issues", value: "transition" },
  { label: "Set priority", value: "set_priority" },
  { label: "Assign issues", value: "assign" },
  { label: "Comment", value: "comment" },
];

const asList = (v) => (Array.isArray(v) ? v.join(", ") : v);

function MandateEditor({ mandate, usage, onSaved, onStatus }) {
  const [draft, setDraft] = useState({ ...mandate, projects: asList(mandate.projects), blockedLabels: asList(mandate.blockedLabels), holdLabels: asList(mandate.holdLabels), protectedTypes: asList(mandate.protectedTypes), holdPriorities: asList(mandate.holdPriorities), holdStatuses: asList(mandate.holdStatuses || []), protectedGoals: asList(mandate.protectedGoals || []) });
  const [graphKey, setGraphKey] = useState("PAY-1");
  const [graphResult, setGraphResult] = useState(null);
  const checkGraph = async () => setGraphResult(await invoke("checkGraph", { issueKey: graphKey }));
  const [message, setMessage] = useState(null);
  const set = (field) => (e) => setDraft({ ...draft, [field]: e.target.value });
  const setLimit = (field) => (e) => setDraft({ ...draft, limits: { ...draft.limits, [field]: e.target.value } });

  const save = async () => {
    const res = await invoke("saveMandate", { mandate: { ...draft, limits: { perHour: Number(draft.limits.perHour), perDay: Number(draft.limits.perDay), perRun: Number(draft.limits.perRun) }, holdAboveRun: Number(draft.holdAboveRun) } });
    setMessage(res.ok ? { ok: true, message: `Saved. Mandate is now v${res.mandate.version}.` } : res);
    if (res.ok) onSaved();
  };

  const dayShare = mandate.limits.perDay ? usage.day / mandate.limits.perDay : 0;
  const hourShare = mandate.limits.perHour ? usage.hour / mandate.limits.perHour : 0;

  return (
    <Stack space="space.300">
      <Box xcss={cardStyle}>
        <Stack space="space.150">
          <Inline spread="space-between" alignBlock="center">
            <Inline space="space.100" alignBlock="center">
              <Heading size="medium">{mandate.name}</Heading>
              <Lozenge appearance={mandate.status === "active" ? "success" : mandate.status === "paused" ? "moved" : "removed"}>{mandate.status}</Lozenge>
              <Badge>v{mandate.version}</Badge>
            </Inline>
            <ButtonGroup>
              {mandate.status === "active" && <Button onClick={() => onStatus("paused")}>Pause agent writes</Button>}
              {mandate.status === "paused" && <Button onClick={() => onStatus("active")}>Resume</Button>}
              {mandate.status !== "revoked" && (
                <Button appearance="danger" onClick={() => onStatus("revoked")}>
                  Revoke
                </Button>
              )}
              {mandate.status === "revoked" && <Button onClick={() => onStatus("active")}>Reinstate</Button>}
            </ButtonGroup>
          </Inline>
          <Text>
            {usage.hour} of {mandate.limits.perHour} writes used in the last hour
          </Text>
          <ProgressBar value={Math.min(1, hourShare)} appearance={hourShare >= 0.8 ? "warning" : "default"} ariaLabel="Hourly usage" />
          <Text>
            {usage.day} of {mandate.limits.perDay} writes used in the last 24 hours
          </Text>
          <ProgressBar value={Math.min(1, dayShare)} appearance={dayShare >= 0.8 ? "warning" : "default"} ariaLabel="Daily usage" />
        </Stack>
      </Box>

      {message && <SectionMessage appearance={message.ok ? "success" : "error"}>{message.message}</SectionMessage>}

      <Stack space="space.200">
        <Heading size="small">Scope</Heading>
        <Box>
          <Label labelFor="projects">Projects the agent may change</Label>
          <Textfield id="projects" value={draft.projects} onChange={set("projects")} placeholder="PAY, WEB" />
          <HelperMessage>Project keys, comma separated. Nothing outside these projects is ever written.</HelperMessage>
        </Box>
        <Box>
          <Label labelFor="kinds">Allowed actions</Label>
          <Select
            inputId="kinds"
            isMulti
            options={KIND_OPTIONS}
            value={KIND_OPTIONS.filter((o) => draft.kinds.includes(o.value))}
            onChange={(values) => setDraft({ ...draft, kinds: (values || []).map((v) => v.value) })}
          />
        </Box>
        <Heading size="small">Hard rules (always refused)</Heading>
        <Box>
          <Label labelFor="blocked">Blocked labels</Label>
          <Textfield id="blocked" value={draft.blockedLabels} onChange={set("blockedLabels")} />
          <HelperMessage>Issues with these labels are never touched by an agent.</HelperMessage>
        </Box>
        <Box>
          <Label labelFor="types">Protected issue types</Label>
          <Textfield id="types" value={draft.protectedTypes} onChange={set("protectedTypes")} />
        </Box>
        <Heading size="small">Ask a person first</Heading>
        <Box>
          <Label labelFor="holdLabels">Sensitive labels</Label>
          <Textfield id="holdLabels" value={draft.holdLabels} onChange={set("holdLabels")} />
        </Box>
        <Inline space="space.200">
          <Box>
            <Label labelFor="holdPriorities">Sensitive priorities</Label>
            <Textfield id="holdPriorities" value={draft.holdPriorities} onChange={set("holdPriorities")} />
          </Box>
          <Box>
            <Label labelFor="holdStatuses">Sensitive statuses</Label>
            <Textfield id="holdStatuses" value={draft.holdStatuses} onChange={set("holdStatuses")} />
          </Box>
          <Box>
            <Label labelFor="holdAboveRun">Hold after N writes in one run</Label>
            <Textfield id="holdAboveRun" type="number" value={String(draft.holdAboveRun)} onChange={set("holdAboveRun")} />
          </Box>
        </Inline>
        <Heading size="small">Connected context (Teamwork Graph)</Heading>
        <Box>
          <Label labelFor="protectedGoals">Protected goals</Label>
          <Textfield id="protectedGoals" value={draft.protectedGoals} onChange={set("protectedGoals")} placeholder="Q4 checkout launch" />
          <HelperMessage>Goal names from Atlassian Goals. An agent change to any issue linked to one of these goals waits for a person. If the graph cannot be reached, the change waits too.</HelperMessage>
        </Box>
        <Inline space="space.150" alignBlock="end">
          <Box>
            <Label labelFor="graphKey">Check an issue</Label>
            <Textfield id="graphKey" value={graphKey} onChange={(e) => setGraphKey(e.target.value)} />
          </Box>
          <Button onClick={checkGraph}>Show linked goals</Button>
        </Inline>
        {graphResult && <SectionMessage appearance={graphResult.ok ? "information" : "warning"}>{graphResult.message}</SectionMessage>}
        <Heading size="small">Limits</Heading>
        <Inline space="space.200">
          <Box>
            <Label labelFor="perRun">Per run</Label>
            <Textfield id="perRun" type="number" value={String(draft.limits.perRun)} onChange={setLimit("perRun")} />
          </Box>
          <Box>
            <Label labelFor="perHour">Per hour</Label>
            <Textfield id="perHour" type="number" value={String(draft.limits.perHour)} onChange={setLimit("perHour")} />
          </Box>
          <Box>
            <Label labelFor="perDay">Per day</Label>
            <Textfield id="perDay" type="number" value={String(draft.limits.perDay)} onChange={setLimit("perDay")} />
          </Box>
        </Inline>
        <Box>
          <Label labelFor="expires">Expires (YYYY-MM-DD)</Label>
          <Textfield id="expires" value={String(draft.expiresAt).slice(0, 10)} onChange={(e) => setDraft({ ...draft, expiresAt: `${e.target.value}T23:59:00Z` })} />
        </Box>
        <Inline>
          <Button appearance="primary" onClick={save}>
            Save mandate
          </Button>
        </Inline>
      </Stack>
    </Stack>
  );
}

// ---------- Simulator ----------

function Simulator() {
  const [jql, setJql] = useState("project = PAY ORDER BY updated DESC");
  const [toStatus, setToStatus] = useState("Done");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await invoke("simulate", { jql, kind: "transition", toStatus, max: 40 }));
    } catch (e) {
      setError(e.message || "The simulation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack space="space.200">
      <Text>Judge a bulk plan before anything runs. Nothing is written to Jira.</Text>
      <Inline space="space.200" alignBlock="end">
        <Box xcss={xcss({ flexGrow: 1 })}>
          <Label labelFor="jql">Issues (JQL)</Label>
          <Textfield id="jql" value={jql} onChange={(e) => setJql(e.target.value)} />
        </Box>
        <Box>
          <Label labelFor="to">Move them to</Label>
          <Textfield id="to" value={toStatus} onChange={(e) => setToStatus(e.target.value)} />
        </Box>
        <Button appearance="primary" onClick={run} isDisabled={busy}>
          {busy ? "Judging…" : "Simulate this run"}
        </Button>
      </Inline>
      {error && <SectionMessage appearance="error">{error}</SectionMessage>}
      {result && (
        <Stack space="space.150">
          <Inline space="space.200">
            <Text>
              <Verdict decision="allow" /> {result.summary.allow}
            </Text>
            <Text>
              <Verdict decision="hold" /> {result.summary.hold}
            </Text>
            <Text>
              <Verdict decision="deny" /> {result.summary.deny}
            </Text>
          </Inline>
          <DynamicTable
            head={{ cells: [{ key: "i", content: "Issue" }, { key: "v", content: "Verdict" }, { key: "r", content: "Why" }] }}
            rows={result.rows.map((r) => ({
              key: r.issueKey,
              cells: [
                { key: "i", content: r.issueKey },
                { key: "v", content: <Verdict decision={r.decision} /> },
                { key: "r", content: r.reasons.map((x) => x.message).join(" ") || "Every rule passed." },
              ],
            }))}
            rowsPerPage={20}
          />
        </Stack>
      )}
    </Stack>
  );
}

// ---------- First run ----------

function SetupCard({ onDone }) {
  const [projectKey, setProjectKey] = useState("PAY");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const run = async () => {
    setBusy(true);
    const res = await invoke("seedDemo", { projectKey });
    setResult(res);
    setBusy(false);
    if (res.ok) onDone();
  };
  return (
    <Box xcss={cardStyle}>
      <Stack space="space.150">
        <Heading size="small">Give Triage Steward its first project</Heading>
        <Text>Warden writes nothing until a project is in the mandate. Load 24 demo issues into an existing project to see every verdict: issues that clear, issues that wait for you, and issues an agent may never touch.</Text>
        <Inline space="space.150" alignBlock="end">
          <Box>
            <Label labelFor="seed-key">Project key</Label>
            <Textfield id="seed-key" value={projectKey} onChange={(e) => setProjectKey(e.target.value)} />
          </Box>
          <Button appearance="primary" onClick={run} isDisabled={busy}>
            {busy ? "Creating issues…" : "Load demo issues"}
          </Button>
        </Inline>
        {result && <SectionMessage appearance={result.ok ? "success" : "error"}>{result.message}</SectionMessage>}
      </Stack>
    </Box>
  );
}

// ---------- App ----------

function App() {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = () =>
    invoke("getState")
      .then(setState)
      .catch((e) => setError(e.message || "Warden could not load."));

  useEffect(() => {
    load();
  }, []);

  const decide = async (action, id) => {
    setBusyId(id);
    const res = await invoke(action, { id });
    setNotice(res);
    setBusyId(null);
    load();
  };

  const setStatus = async (status) => {
    await invoke("setStatus", { status });
    load();
  };

  if (error) return <SectionMessage appearance="error">{error}</SectionMessage>;
  if (!state) return <Spinner label="Loading Warden" />;

  return (
    <Stack space="space.300">
      <Text>Your Rovo agent proposes. Your mandate decides. Every Jira write by the Triage Steward passes here first.</Text>
      {state.mandate.projects.length === 0 && <SetupCard onDone={load} />}
      <Inline space="space.200">
        <Text>
          <Verdict decision="allow" /> {state.counts.cleared} cleared
        </Text>
        <Text>
          <Verdict decision="hold" /> {state.counts.held} held
        </Text>
        <Text>
          <Verdict decision="deny" /> {state.counts.refused} refused
        </Text>
      </Inline>
      <Tabs id="warden-tabs">
        <TabList>
          <Tab>Approvals {state.approvals.length > 0 ? `(${state.approvals.length})` : ""}</Tab>
          <Tab>Activity</Tab>
          <Tab>Mandate</Tab>
          <Tab>Simulator</Tab>
        </TabList>
        <TabPanel>
          <Box xcss={xcss({ paddingTop: "space.200", width: "100%" })}>
            <Approvals approvals={state.approvals} onDecide={decide} busyId={busyId} notice={notice} />
          </Box>
        </TabPanel>
        <TabPanel>
          <Box xcss={xcss({ paddingTop: "space.200", width: "100%" })}>
            <Activity ledger={state.ledger} />
          </Box>
        </TabPanel>
        <TabPanel>
          <Box xcss={xcss({ paddingTop: "space.200", width: "100%" })}>
            <MandateEditor key={state.mandate.version} mandate={state.mandate} usage={state.usage} onSaved={load} onStatus={setStatus} />
          </Box>
        </TabPanel>
        <TabPanel>
          <Box xcss={xcss({ paddingTop: "space.200", width: "100%" })}>
            <Simulator />
          </Box>
        </TabPanel>
      </Tabs>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
