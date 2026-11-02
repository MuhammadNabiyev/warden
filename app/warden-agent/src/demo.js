/**
 * Demo data so anyone (including a hackathon judge on a fresh site) can see all three verdicts in
 * a minute: issues that clear, issues that need a person, issues the agent may never touch, and a
 * batch big enough to trip the per-run limit in the simulator.
 */
import * as jira from "./jira.js";

const STORY = [
  { summary: "Checkout times out for EUR cards", type: "Bug", priority: "High", labels: ["checkout"] },
  { summary: "Refund webhook retries forever", type: "Bug", priority: "Medium", labels: ["webhooks"] },
  { summary: "Rotate leaked staging API key", type: "Task", priority: "High", labels: ["security"] },
  { summary: "Black Friday payment page copy", type: "Task", priority: "Medium", labels: ["release-critical"] },
  { summary: "Enterprise client charged twice", type: "Bug", priority: "High", labels: ["customer-escalation"] },
  { summary: "Add Apple Pay to mobile checkout", type: "Task", priority: "Low", labels: [] },
  { summary: "Update PCI evidence folder", type: "Task", priority: "Medium", labels: ["security", "compliance"] },
  { summary: "Retry button misaligned on Safari", type: "Bug", priority: "Low", labels: ["ui"] },
];

const BATCH = Array.from({ length: 16 }, (_, i) => ({ summary: `Reconcile settlement batch #${String(i + 1).padStart(2, "0")}`, type: "Task", priority: "Medium", labels: ["settlement"] }));

export async function seedDemo(projectKey) {
  const types = await jira.issueTypeNames(projectKey);
  const pick = (wanted) => (types.includes(wanted) ? wanted : types.find((t) => t === "Task") || types.find((t) => !/epic|sub/i.test(t)) || types[0]);
  const created = [];
  for (const issue of [...STORY, ...BATCH]) {
    try {
      created.push(await jira.createIssue(projectKey, { ...issue, type: pick(issue.type) }));
    } catch (e) {
      // Some projects hide the priority field; retry without it rather than failing the seed.
      if (/priority/i.test(e.message)) created.push(await jira.createIssue(projectKey, { ...issue, priority: undefined, type: pick(issue.type) }));
      else throw e;
    }
  }
  return created;
}
