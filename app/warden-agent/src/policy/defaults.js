/**
 * The mandate a fresh install starts with. It is deliberately conservative so a new admin can see
 * all three verdicts on day one without editing anything.
 */
export function defaultMandate(now = new Date()) {
  return {
    id: "default",
    version: 1,
    name: "Triage Steward",
    agentKey: "warden-triage-steward",
    kinds: ["transition", "assign", "comment", "set_priority"],
    projects: [],
    blockedLabels: ["security"],
    holdLabels: ["release-critical", "customer-escalation"],
    protectedTypes: ["Epic"],
    holdPriorities: ["Highest"],
    holdStatuses: ["Done", "Closed"],
    protectedGoals: [],
    limits: { perHour: 20, perDay: 60, perRun: 10 },
    holdAboveRun: 5,
    expiresAt: new Date(now.getTime() + 30 * 24 * 3_600_000).toISOString(),
    status: "active",
    updatedAt: now.toISOString(),
  };
}

/**
 * Validates a mandate coming from the admin form. Returns { mandate } or { error }.
 * Anything unexpected falls back to a safe value instead of crashing the page.
 */
export function sanitizeMandate(input, previous) {
  const list = (v) =>
    (Array.isArray(v) ? v : String(v || "").split(","))
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 50);
  const int = (v, fallback, max) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= max ? n : fallback;
  };
  const kinds = list(input.kinds).filter((k) => ["transition", "assign", "comment", "set_priority"].includes(k));
  const expires = new Date(input.expiresAt);
  if (Number.isNaN(expires.getTime())) return { error: "Choose a valid expiry date." };
  const limits = {
    perHour: int(input.limits?.perHour, previous.limits.perHour, 1000),
    perDay: int(input.limits?.perDay, previous.limits.perDay, 10000),
    perRun: int(input.limits?.perRun, previous.limits.perRun, 500),
  };
  if (limits.perHour > limits.perDay) return { error: "The hourly limit cannot be higher than the daily limit." };
  return {
    mandate: {
      ...previous,
      name: String(input.name || previous.name).slice(0, 60),
      kinds,
      projects: list(input.projects).map((p) => p.toUpperCase()),
      blockedLabels: list(input.blockedLabels),
      holdLabels: list(input.holdLabels),
      protectedTypes: list(input.protectedTypes),
      holdPriorities: list(input.holdPriorities),
      holdStatuses: list(input.holdStatuses),
      protectedGoals: list(input.protectedGoals),
      limits,
      holdAboveRun: int(input.holdAboveRun, previous.holdAboveRun, 500),
      expiresAt: expires.toISOString(),
      version: (previous.version || 1) + 1,
      updatedAt: new Date().toISOString(),
    },
  };
}
