/**
 * Thin helpers around the Jira Cloud REST API.
 *
 * Every call uses api.asUser(), so Jira itself enforces the permissions of the person behind the
 * request (the user chatting with the agent, or the admin who approves a held change). Warden can
 * only ever narrow what a user may do, never widen it.
 */
import api, { route } from "@forge/api";

async function call(path, options = {}) {
  const res = await api.asUser().requestJira(path, {
    ...options,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const error = new Error(`Jira answered ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
    error.status = res.status;
    throw error;
  }
  return res.status === 204 ? null : res.json();
}

/** The facts the policy engine needs about one issue, read from Jira (never trusted from the caller). */
export async function issueFacts(issueKey) {
  const data = await call(route`/rest/api/3/issue/${issueKey}?fields=project,issuetype,labels,priority,status,assignee,summary`);
  const f = data.fields;
  return {
    issueKey: data.key,
    issueId: data.id,
    summary: f.summary,
    projectKey: f.project?.key,
    issueType: f.issuetype?.name,
    labels: f.labels || [],
    priority: f.priority?.name,
    status: f.status?.name,
    assignee: f.assignee ? { accountId: f.assignee.accountId, name: f.assignee.displayName } : null,
  };
}

export async function searchIssues(jql, max = 20) {
  const data = await call(route`/rest/api/3/search/jql?jql=${jql}&maxResults=${max}&fields=summary,status,priority,labels,assignee,issuetype`);
  return (data.issues || []).map((i) => ({
    key: i.key,
    summary: i.fields.summary,
    status: i.fields.status?.name,
    priority: i.fields.priority?.name,
    labels: i.fields.labels || [],
    type: i.fields.issuetype?.name,
    assignee: i.fields.assignee?.displayName || null,
  }));
}

/** Moves an issue to the status whose name (or transition name) matches `toStatus`. */
export async function transitionIssue(issueKey, toStatus) {
  const { transitions } = await call(route`/rest/api/3/issue/${issueKey}/transitions`);
  const wanted = String(toStatus).toLowerCase();
  const match = transitions.find((t) => t.to?.name?.toLowerCase() === wanted) || transitions.find((t) => t.name?.toLowerCase() === wanted);
  if (!match) {
    const options = transitions.map((t) => t.to?.name).filter(Boolean).join(", ");
    throw new Error(`No transition to “${toStatus}” from here. Available: ${options || "none"}.`);
  }
  await call(route`/rest/api/3/issue/${issueKey}/transitions`, { method: "POST", body: JSON.stringify({ transition: { id: match.id } }) });
  return match.to?.name || toStatus;
}

export async function setPriority(issueKey, priority) {
  await call(route`/rest/api/3/issue/${issueKey}`, { method: "PUT", body: JSON.stringify({ fields: { priority: { name: priority } } }) });
}

export async function assignIssue(issueKey, accountId) {
  await call(route`/rest/api/3/issue/${issueKey}/assignee`, { method: "PUT", body: JSON.stringify({ accountId }) });
}

export async function addComment(issueKey, text) {
  const body = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: String(text).slice(0, 5000) }] }] };
  const data = await call(route`/rest/api/3/issue/${issueKey}/comment`, { method: "POST", body: JSON.stringify({ body }) });
  return data?.id;
}

/** The issue type names available in a project, used to pick sensible types for demo data. */
export async function issueTypeNames(projectKey) {
  const data = await call(route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`);
  return (data.issueTypes || data.values || []).map((t) => t.name);
}

/** Creates one issue. Used only by the "load demo issues" button on the Warden page. */
export async function createIssue(projectKey, { summary, type, labels = [], priority }) {
  const fields = { project: { key: projectKey }, summary, issuetype: { name: type }, labels };
  if (priority) fields.priority = { name: priority };
  const data = await call(route`/rest/api/3/issue`, { method: "POST", body: JSON.stringify({ fields }) });
  return data.key;
}

/** Finds one user by name or e-mail fragment. */
export async function findUser(query) {
  const users = await call(route`/rest/api/3/user/search?query=${query}&maxResults=5`);
  return (users || []).find((u) => u.accountType === "atlassian") || null;
}

/** True when the user can be assigned issues in the project, i.e. they are on the project. */
export async function isAssignable(projectKey, accountId) {
  const users = await call(route`/rest/api/3/user/assignable/search?project=${projectKey}&accountId=${accountId}`);
  return Array.isArray(users) && users.length > 0;
}
