export const ACTION_KINDS = ["transition", "assign", "comment", "set_priority", "create_subtask"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export type MandateStatus = "active" | "paused" | "revoked";
export type Decision = "allow" | "hold" | "deny";

/** The owner's standing instructions for one agent. */
export interface Mandate {
  id: string;
  name: string;
  /** The Rovo agent (or MCP client) this mandate governs. */
  agentKey: string;
  kinds: ActionKind[];
  /** Project keys the agent may write to. Empty means no project. */
  projects: string[];
  /** Issues carrying any of these labels are never touched by the agent. */
  blockedLabels: string[];
  /** Issues carrying any of these labels need a human to approve first. */
  holdLabels: string[];
  /** Issue types (e.g. "Epic") the agent may not change. */
  protectedTypes: string[];
  limits: {
    /** Writes allowed in any rolling hour. */
    perHour: number;
    /** Writes allowed in any rolling 24 hours. */
    perDay: number;
    /** Writes allowed in one agent run. */
    perRun: number;
  };
  /** Priority names that always need approval when the agent sets them. */
  holdPriorities: string[];
  /** More writes than this in one run need approval, even inside the limits. */
  holdAboveRun: number;
  expiresAt: string;
  status: MandateStatus;
}

/** One write the agent wants to make. */
export interface Proposal {
  kind: ActionKind;
  projectKey: string;
  issueKey: string;
  issueType: string;
  labels: string[];
  /** For set_priority: the target priority name. */
  priority?: string;
  /** For assign: whether the assignee is outside the project's current people. */
  assigneeOutsideProject?: boolean;
  /** Identifies one agent run so burst limits can be applied. */
  runId: string;
}

/** Past executed writes by this mandate, newest or oldest first: order does not matter. */
export interface UsageEvent {
  at: string;
  runId: string;
}

export type ReasonCode =
  | "REVOKED"
  | "PAUSED"
  | "EXPIRED"
  | "KIND_NOT_ALLOWED"
  | "PROJECT_NOT_ALLOWED"
  | "BLOCKED_LABEL"
  | "PROTECTED_TYPE"
  | "HOURLY_LIMIT"
  | "DAILY_LIMIT"
  | "RUN_LIMIT"
  | "HOLD_LABEL"
  | "HOLD_PRIORITY"
  | "HOLD_OUTSIDE_ASSIGNEE"
  | "HOLD_BIG_RUN";

export interface Reason {
  code: ReasonCode;
  message: string;
}

export interface Verdict {
  decision: Decision;
  reasons: Reason[];
}
