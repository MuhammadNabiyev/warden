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
  stale: "Issue changed, nothing written",
  failed: "Request failed",
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
  borderColor: "color.border.warning",
  borderStyle: "solid",
  borderWidth: "border.width",
  borderRadius: "border.radius.200",
  padding: "space.300",
  backgroundColor: "elevation.surface",
});

const quoteStyle = xcss({
  borderRadius: "border.radius.100",
  padding: "space.150",
  backgroundColor: "elevation.surface.sunken",
});

const Verdict = ({ decision }) => <Lozenge appearance={VERDICT[decision]?.appearance || "default"}>{VERDICT[decision]?.label || decision}</Lozenge>;

const when = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Cleared / Hold / Refused with a count beside each. */
const VerdictStrip = ({ counts }) => (
  <Inline space="space.300" shouldWrap>
    {["allow", "hold", "deny"].map((d) => (
      <Inline key={d} space="space.100" alignBlock="center">
        <Verdict decision={d} />
        <Text weight="bold">{counts[d] || 0}</Text>
      </Inline>
    ))}
  </Inline>
);

/** Reasons read as explanations; the rule code is secondary evidence. */
const Reasons = ({ reasons }) =>
  (reasons || []).length === 0 ? (
    <Text>No reason was recorded. Review this request before approving.</Text>
  ) : (
    <Stack space="space.100">
      {reasons.map((r) => (
        <Stack key={r.code + r.message} space="space.025">
          <Text>{r.message}</Text>
          <Text size="small" color="color.text.subtle">
            Rule: {r.code}
          </Text>
        </Stack>
      ))}
    </Stack>
  );

// ---------- Approvals ----------

function Approvals({ approvals, onDecide, busyId }) {
  if (approvals.length === 0) {
    return (
      <EmptyState
        header="No changes awaiting approval"
        description="Only requests with a Hold verdict appear here. Check Activity for Cleared and Refused requests, or use Simulator to preview a run without changing Jira."
      />
    );
  }
  return (
    <Stack space="space.200">
      {approvals.map((a) => (
        <Box key={a.id} xcss={receiptStyle}>
          <Stack space="space.200">
            <Inline spread="space-between" alignBlock="center" shouldWrap>
              <Inline space="space.100" alignBlock="center" shouldWrap>
                <Heading size="small">{a.issueKey}</Heading>
                <Verdict decision="hold" />
                <Text size="small">Nothing written</Text>
              </Inline>
              <Text size="small" color="color.text.subtle">
                Requested {when(a.createdAt)}
              </Text>
            </Inline>
            {a.before?.summary && <Text>{a.before.summary}</Text>}
            <Stack space="space.100">
              <Heading size="medium">{a.kind === "comment" ? "Add this comment" : a.change}</Heading>
              {a.kind === "comment" && (
                <Box xcss={quoteStyle}>
                  <Text>{String(a.args?.text ?? "")}</Text>
                </Box>
              )}
            </Stack>
            <Stack space="space.050">
              <Text weight="bold">Why Warden held it</Text>
              <Reasons reasons={a.reasons} />
            </Stack>
            <Text size="small">Approve to apply this single change with your Jira permissions. Warden first re-reads the issue and re-checks it against the current mandate; a rule that now refuses it still wins.</Text>
            <ButtonGroup>
              <Button appearance="primary" isDisabled={busyId !== null} onClick={() => onDecide("approve", a.id)}>
                {busyId === a.id ? "Submitting decision…" : "Approve and apply"}
              </Button>
              <Button appearance="default" isDisabled={busyId !== null} onClick={() => onDecide("decline", a.id)}>
                Decline change
              </Button>
            </ButtonGroup>
            <Text size="small" color="color.text.subtle">
              Decision {a.decisionId} · evaluated under mandate v{a.mandateVersion}
            </Text>
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

// ---------- Activity ----------

/** Request → verdict → outcome. The verdict stays the original policy decision even after a person acts. */
function Activity({ ledger }) {
  if (ledger.length === 0) {
    return (
      <EmptyState
        header="No requests recorded yet"
        description="Add a project in Mandate, then ask Triage Steward in Rovo to propose a change there. Warden records its verdict and the outcome here."
      />
    );
  }
  const head = {
    cells: [
      { key: "request", content: "Requested change", width: 35 },
      { key: "verdict", content: "Warden verdict", width: 35 },
      { key: "result", content: "Outcome", width: 18 },
      { key: "when", content: "Requested", width: 12 },
    ],
  };
  const rows = ledger.map((e) => ({
    key: e.id,
    cells: [
      {
        key: `request:${e.id}`,
        content: (
          <Stack space="space.050">
            <Text weight="bold">{e.issueKey}</Text>
            <Text>{e.change || "Request could not be prepared"}</Text>
          </Stack>
        ),
      },
      {
        key: `verdict:${e.id}`,
        content: (
          <Stack space="space.050">
            <Inline>
              <Verdict decision={e.verdict?.decision} />
            </Inline>
            <Text size="small">{(e.verdict?.reasons || []).map((r) => r.message).join(" ") || (e.verdict?.decision === "allow" ? "Passed every mandate check." : "No policy reason recorded.")}</Text>
          </Stack>
        ),
      },
      {
        key: `result:${e.id}`,
        content: (
          <Stack space="space.050">
            <Text>{STATUS_TEXT[e.status] || e.status}</Text>
            {e.error && <Text size="small">{e.error}</Text>}
          </Stack>
        ),
      },
      { key: `when:${e.id}`, content: when(e.at) },
    ],
  }));
  return (
    <Stack space="space.100">
      <Text size="small" color="color.text.subtle">
        Latest {ledger.length} requests. Verdicts show the original policy decision; outcomes show what happened afterwards.
      </Text>
      <DynamicTable caption="Decision activity" head={head} rows={rows} rowsPerPage={10} />
    </Stack>
  );
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
  const checkGraph = async () => {
    try {
      setGraphResult(await invoke("checkGraph", { issueKey: graphKey }));
    } catch (e) {
      setGraphResult({ ok: false, message: e.message || "The check failed." });
    }
  };
  const [message, setMessage] = useState(null);
  const set = (field) => (e) => setDraft({ ...draft, [field]: e.target.value });
  const setLimit = (field) => (e) => setDraft({ ...draft, limits: { ...draft.limits, [field]: e.target.value } });

  const save = async () => {
    try {
      const res = await invoke("saveMandate", { mandate: { ...draft, limits: { perHour: Number(draft.limits.perHour), perDay: Number(draft.limits.perDay), perRun: Number(draft.limits.perRun) }, holdAboveRun: Number(draft.holdAboveRun) } });
      setMessage(res.ok ? { ok: true, message: `Saved. Mandate is now v${res.mandate.version}.` } : res);
      if (res.ok) onSaved();
    } catch (e) {
      setMessage({ ok: false, message: e.message || "The mandate could not be saved." });
    }
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
              <Text size="small" color="color.text.subtle">
                Version {mandate.version}
              </Text>
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
          <ProgressBar value={Math.min(1, hourShare)} ariaLabel="Hourly usage" />
          <Text>
            {usage.day} of {mandate.limits.perDay} writes used in the last 24 hours
          </Text>
          <ProgressBar value={Math.min(1, dayShare)} ariaLabel="Daily usage" />
          {Math.max(hourShare, dayShare) >= 0.8 && <Text size="small">Close to the limit. Further agent writes will be refused until the window rolls over.</Text>}
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
        <Inline space="space.200" shouldWrap>
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
        <Inline space="space.200" shouldWrap>
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
          <VerdictStrip counts={result.summary} />
          <DynamicTable
            caption="Simulated verdicts"
            head={{ cells: [{ key: "i", content: "Issue", width: 15 }, { key: "v", content: "Verdict", width: 15 }, { key: "r", content: "Why", width: 70 }] }}
            rows={result.rows.map((r) => ({
              key: r.issueKey,
              cells: [
                { key: `i:${r.issueKey}`, content: r.issueKey },
                { key: `v:${r.issueKey}`, content: <Verdict decision={r.decision} /> },
                { key: `r:${r.issueKey}`, content: r.reasons.map((x) => x.message).join(" ") || "Passed every mandate check." },
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
    try {
      const res = await invoke("seedDemo", { projectKey });
      setResult(res);
      if (res.ok) onDone();
    } catch (e) {
      setResult({ ok: false, message: e.message || "The demo issues could not be created." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box xcss={cardStyle}>
      <Stack space="space.150">
        <Heading size="small">Choose where agent writes are allowed</Heading>
        <Text>No projects are allowed yet, so Warden refuses every agent write. Open Mandate to allow a project and work with its existing issues.</Text>
        <Text>For a guided demo, pick an existing test project below. This creates 24 real Jira issues that show every verdict: changes that clear, changes that wait for you, and issues an agent may never touch.</Text>
        <Inline space="space.150" alignBlock="end">
          <Box>
            <Label labelFor="seed-key">Project key</Label>
            <Textfield id="seed-key" value={projectKey} onChange={(e) => setProjectKey(e.target.value)} />
          </Box>
          <Button appearance="primary" onClick={run} isDisabled={busy}>
            {busy ? "Creating demo issues…" : "Create demo issues in Jira"}
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
  const [loadedAt, setLoadedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      setState(await invoke("getState"));
      setLoadedAt(new Date().toISOString());
    } catch (e) {
      setError(e.message || "Warden could not load.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const decide = async (action, id) => {
    setBusyId(id);
    try {
      setNotice(await invoke(action, { id }));
    } catch (e) {
      setNotice({ ok: false, message: e.message || "The decision could not be recorded." });
    } finally {
      setBusyId(null);
      load();
    }
  };

  const setStatus = async (status) => {
    try {
      await invoke("setStatus", { status });
    } catch (e) {
      setNotice({ ok: false, message: e.message || "The mandate status could not be changed." });
    }
    load();
  };

  if (error) return <SectionMessage appearance="error">{error}</SectionMessage>;
  if (!state) return <Spinner label="Loading Warden" />;

  const pending = state.approvals.length;
  const verdictCounts = Object.fromEntries(["allow", "hold", "deny"].map((d) => [d, state.ledger.filter((e) => e.verdict?.decision === d).length]));

  return (
    <Stack space="space.300">
      <Stack space="space.100">
        <Inline spread="space-between" alignBlock="center" shouldWrap>
          <Heading size="large">Agent write control</Heading>
          <Inline space="space.150" alignBlock="center">
            <Text size="small" color="color.text.subtle">
              Mandate v{state.mandate.version} · {state.mandate.status} · expires {when(state.mandate.expiresAt)}
              {loadedAt ? ` · updated ${when(loadedAt)}` : ""}
            </Text>
            <Button appearance="subtle" onClick={load} isDisabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
          </Inline>
        </Inline>
        <Text>Triage Steward proposes Jira changes. Warden checks each one against your rules before anything is written.</Text>
        <Heading size="medium">{pending === 0 ? "No changes awaiting your decision" : `${pending} ${pending === 1 ? "change needs" : "changes need"} your decision`}</Heading>
      </Stack>
      {state.mandate.projects.length === 0 && <SetupCard onDone={load} />}
      <Stack space="space.050">
        <Text size="small" color="color.text.subtle">
          Verdicts across the latest {state.ledger.length} recorded requests
        </Text>
        <VerdictStrip counts={verdictCounts} />
      </Stack>
      {notice && (
        <SectionMessage appearance={notice.ok ? "success" : "warning"} title={notice.ok ? "Decision recorded" : "Decision needs attention"}>
          <Text>{notice.message}</Text>
        </SectionMessage>
      )}
      <Tabs id="warden-tabs">
        <TabList>
          <Tab>Approvals {state.approvals.length > 0 ? `(${state.approvals.length})` : ""}</Tab>
          <Tab>Activity</Tab>
          <Tab>Mandate</Tab>
          <Tab>Simulator</Tab>
        </TabList>
        <TabPanel>
          <Box xcss={xcss({ paddingTop: "space.200", width: "100%" })}>
            <Approvals approvals={state.approvals} onDecide={decide} busyId={busyId} />
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
