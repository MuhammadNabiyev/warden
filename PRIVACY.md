# Warden privacy policy

_Last updated: 3 November 2026_

Warden is an Atlassian Forge app. It runs entirely on Atlassian's infrastructure ("Runs on Atlassian"): it has no servers of its own and sends no data outside Atlassian.

## What Warden stores

Inside your site's Forge storage (Atlassian's key-value store for this app), Warden keeps:

- **The mandate**: the rules an admin sets on the Warden page (projects, labels, limits, protected goals).
- **The decision ledger**: one record per agent request, with the time, the Atlassian account ID of the person the agent acted for, the issue key, the issue's summary, status, priority, labels and assignee at that moment, the requested change, the verdict and the rules that fired, and who approved or declined it.
- **Approval requests**: held changes waiting for a person, with the same fields.

## What Warden reads

Warden reads Jira issues and users, and Atlassian Goals linked to issues through the Teamwork Graph, always with the permissions of the person using it (`asUser`). It reads them only to judge and carry out a requested change.

## What Warden does not do

- Warden sends nothing to servers of its own or to third parties. The app declares no external egress.
- No analytics, tracking or advertising.
- Warden calls no language model. Its decisions are made by plain code.

## Agents that use Warden

The results of Warden's actions (issue details from a search, verdicts and reasons) go back to whoever asked: the Rovo agent, which is a language model run by Atlassian, or an MCP client you connect yourself. What those agents do with the results is governed by their own terms.

## Retention and deletion

Data stays in your site's Forge storage while the app is installed. When Warden is uninstalled, Atlassian soft-deletes the data and keeps it for its retention period, as it does for every Forge app; see Atlassian's [hosted storage data lifecycle](https://developer.atlassian.com/platform/forge/storage-reference/hosted-storage-data-lifecycle/). Warden keeps no copy anywhere else.

## Contact

Questions or requests: open an issue at https://github.com/MuhammadNabiyev/warden/issues
