/**
 * A local HTTP harness around the Warden policy engine, so external test tools (TestSprite) can
 * exercise the exact code that runs inside Forge. It never touches Jira.
 *
 *   node scripts/policy-server.mjs        → http://localhost:4747
 *
 * GET  /health             → { ok: true }
 * GET  /mandate/default    → the mandate a fresh install starts with
 * POST /evaluate           { mandate?, proposal, usage?, now? }    → { decision, reasons }
 * POST /evaluate-plan      { mandate?, proposals, usage?, now? }   → { results, summary }
 * POST /mandate/sanitize   { input, previous? }                     → { mandate } or 400 { error }
 */
import http from "node:http";
import { evaluate, evaluatePlan } from "../src/policy/evaluate.js";
import { defaultMandate, sanitizeMandate } from "../src/policy/defaults.js";

const PORT = Number(process.env.PORT) || 4747;

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const readJson = (req) =>
  new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Body is not valid JSON."));
      }
    });
  });

/** Missing fields fall back to the default mandate, no usage, and the current time. */
function context(body) {
  const now = body.now ? new Date(body.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("`now` is not a valid date.");
  const mandate = { ...defaultMandate(now), ...(body.mandate || {}) };
  if (body.usage !== undefined && !Array.isArray(body.usage)) throw new Error("`usage` must be an array.");
  return { now, mandate, usage: body.usage || [] };
}

const routes = {
  "GET /health": () => [200, { ok: true }],
  "GET /mandate/default": () => [200, defaultMandate()],
  "POST /evaluate": (body) => {
    if (!body.proposal || typeof body.proposal !== "object") return [400, { error: "`proposal` is required." }];
    const { now, mandate, usage } = context(body);
    return [200, evaluate(mandate, body.proposal, usage, now)];
  },
  "POST /evaluate-plan": (body) => {
    if (!Array.isArray(body.proposals)) return [400, { error: "`proposals` must be an array." }];
    const { now, mandate, usage } = context(body);
    const results = evaluatePlan(mandate, body.proposals, usage, now).map(({ proposal, verdict }) => ({ issueKey: proposal.issueKey, ...verdict }));
    const count = (d) => results.filter((r) => r.decision === d).length;
    return [200, { results, summary: { allow: count("allow"), hold: count("hold"), deny: count("deny") } }];
  },
  "POST /mandate/sanitize": (body) => {
    const result = sanitizeMandate(body.input || {}, body.previous || defaultMandate());
    return result.error ? [400, { error: result.error }] : [200, result];
  },
};

http
  .createServer(async (req, res) => {
    const route = routes[`${req.method} ${req.url.split("?")[0]}`];
    if (!route) return send(res, 404, { error: "Not found." });
    try {
      const body = req.method === "POST" ? await readJson(req) : {};
      const [status, payload] = route(body);
      send(res, status, payload);
    } catch (e) {
      send(res, 400, { error: e.message });
    }
  })
  .listen(PORT, () => console.log(`Warden policy harness on http://localhost:${PORT}`));
