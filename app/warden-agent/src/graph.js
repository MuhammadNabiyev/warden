/**
 * Teamwork Graph context for Warden.
 *
 * Labels are not the whole story: an innocent-looking issue may be linked to a goal the company
 * cares about (a launch, a compliance deadline). Warden asks the Teamwork Graph which Atlassian
 * Goals a work item is linked to, and if any of them is on the mandate's "protected goals" list,
 * an agent change to that issue waits for a person.
 *
 * The lookup runs as the user (asUser), so results respect their permissions. When the graph
 * cannot be reached, Warden says so and holds the change instead of guessing.
 */
import api from "@forge/api";

const GOALS_QUERY = `
  query warden_WorkItemGoals($id: ID!) {
    jiraWorkItemGoals(id: $id, first: 25) {
      edges {
        node {
          __typename
          ... on AtlassianGoal { id name }
        }
      }
    }
  }
`;

/** The ARI (Atlassian Resource Identifier) of a Jira work item. */
export const workItemAri = (cloudId, issueId) => `ari:cloud:jira:${cloudId}:issue/${issueId}`;

/**
 * Returns { ok: true, goals: [{ id, name }] } or { ok: false, error }.
 * Never throws: a failed lookup is a fact the policy engine needs to see.
 */
export async function linkedGoals(cloudId, issueId) {
  if (!cloudId || !issueId) return { ok: false, error: "Missing site or issue id." };
  try {
    const res = await api.asUser().requestTeamworkGraph(GOALS_QUERY, { id: workItemAri(cloudId, issueId) });
    const json = typeof res?.json === "function" ? await res.json() : res;
    if (json?.errors?.length) return { ok: false, error: json.errors.map((e) => e.message).join("; ").slice(0, 300) };
    const edges = json?.data?.jiraWorkItemGoals?.edges || [];
    return { ok: true, goals: edges.map((e) => e.node).filter(Boolean).map((n) => ({ id: n.id, name: n.name || n.id })) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** The first linked goal that the mandate protects, matched by name or id, case-insensitively. */
export function protectedMatch(goals, protectedGoals) {
  const wanted = (protectedGoals || []).map((g) => String(g).trim().toLowerCase()).filter(Boolean);
  return (goals || []).find((g) => wanted.includes(String(g.name).toLowerCase()) || wanted.includes(String(g.id).toLowerCase()));
}
