/**
 * Storage for Warden, built on Forge Key-Value Storage (@forge/kvs).
 *
 * Keys are designed so that a simple "begins with" query returns records in a useful order:
 *   mandate:default                    the active mandate (one per install in this version)
 *   ledger:<reverse-time>:<id>         every decision, newest first
 *   approval:<id>                      a held write waiting for a person
 *
 * KVS only works from backend code (resolvers and Rovo action handlers), never from the browser.
 */
import { kvs, WhereConditions } from "@forge/kvs";

const MANDATE_KEY = "mandate:default";
const MAX_TIME = 9_999_999_999_999;

/** Reverse timestamp, zero-padded, so newer entries sort first. */
const reverseTime = (date) => String(MAX_TIME - date.getTime()).padStart(13, "0");

export const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const getMandate = () => kvs.get(MANDATE_KEY);
export const saveMandate = (mandate) => kvs.set(MANDATE_KEY, mandate);

/** Reads every record whose key begins with `prefix`, following cursors, up to `max` records. */
async function readAll(prefix, max = 500) {
  const out = [];
  let cursor;
  do {
    let query = kvs.query().where("key", WhereConditions.beginsWith(prefix)).limit(100);
    if (cursor) query = query.cursor(cursor);
    const page = await query.getMany();
    out.push(...page.results.map((r) => r.value));
    cursor = page.nextCursor;
  } while (cursor && out.length < max);
  return out.slice(0, max);
}

export async function appendLedger(entry) {
  await kvs.set(`ledger:${reverseTime(new Date(entry.at))}:${entry.id}`, entry);
  return entry;
}

/** Updates an existing ledger entry in place (its key is derived from its original time). */
export async function updateLedger(entry) {
  await kvs.set(`ledger:${reverseTime(new Date(entry.at))}:${entry.id}`, entry);
  return entry;
}

export const listLedger = (max = 200) => readAll("ledger:", max);

/**
 * The usage the policy engine counts: writes that actually ran (or are reserved by a pending
 * approval that was later executed). Only the last 24 hours matter for the limits.
 */
export async function recentUsage(now) {
  const dayAgo = now.getTime() - 24 * 3_600_000;
  const entries = await listLedger(500);
  return entries
    .filter((e) => (e.status === "executed" || e.status === "approved") && new Date(e.at).getTime() > dayAgo)
    .map((e) => ({ at: e.at, runId: e.runId }));
}

export const saveApproval = (approval) => kvs.set(`approval:${approval.id}`, approval);
export const getApproval = (id) => kvs.get(`approval:${id}`);
export const listApprovals = () => readAll("approval:", 200);
