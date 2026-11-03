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

- No data leaves Atlassian. The app declares no external egress.
- No analytics, tracking or advertising.
- No language model sees your data through Warden. Decisions are made by plain code.

## Retention and deletion

Data stays in your site's Forge storage until the app is uninstalled. Uninstalling Warden removes its storage, as Forge does for every app.

## Contact

Questions or requests: open an issue at https://github.com/MuhammadNabiyev/warden/issues
