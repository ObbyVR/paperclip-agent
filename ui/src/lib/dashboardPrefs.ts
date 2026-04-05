/**
 * Dashboard user preferences — persisted in localStorage.
 *
 * Covers three concerns:
 * 1. Top-level projects shown on the Dashboard: collapse state + "hide from
 *    dashboard" (reversible, client-only archive — does NOT touch
 *    `projects.archivedAt` in the DB).
 * 2. Workflow cards (sub-projects = root issues with children rendered by
 *    WorkflowGraph): collapse state + hide-from-dashboard.
 * 3. Completed-tasks compact column inside each workflow card: open/closed,
 *    default = closed.
 *
 * Uses `useSyncExternalStore` so that independent components (Dashboard,
 * WorkflowGraph, restore bar) re-render together when any pref changes.
 */

const KEYS = {
  collapsedProjects: "paperclip:dashboard:collapsed-projects",
  hiddenProjects: "paperclip:dashboard:hidden-projects",
  collapsedWorkflows: "paperclip:dashboard:collapsed-workflows",
  hiddenWorkflows: "paperclip:dashboard:hidden-workflows",
  openCompletedColumns: "paperclip:dashboard:open-completed-columns",
} as const;

type PrefKey = keyof typeof KEYS;

function loadSet(key: PrefKey): Set<string> {
  try {
    const raw = localStorage.getItem(KEYS[key]);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function saveSet(key: PrefKey, value: Set<string>) {
  try {
    localStorage.setItem(KEYS[key], JSON.stringify([...value]));
  } catch {
    // Ignore localStorage failures (quota, private mode, etc.).
  }
}

/* ── In-memory state + subscribers ─────────────────────────── */

interface DashboardPrefsState {
  collapsedProjects: Set<string>;
  hiddenProjects: Set<string>;
  collapsedWorkflows: Set<string>;
  hiddenWorkflows: Set<string>;
  openCompletedColumns: Set<string>;
}

let state: DashboardPrefsState = {
  collapsedProjects: loadSet("collapsedProjects"),
  hiddenProjects: loadSet("hiddenProjects"),
  collapsedWorkflows: loadSet("collapsedWorkflows"),
  hiddenWorkflows: loadSet("hiddenWorkflows"),
  openCompletedColumns: loadSet("openCompletedColumns"),
};

const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/* ── Cross-tab sync (optional, defensive) ──────────────────── */

if (typeof window !== "undefined") {
  window.addEventListener("storage", (ev) => {
    if (!ev.key) return;
    let changed = false;
    for (const k of Object.keys(KEYS) as PrefKey[]) {
      if (ev.key === KEYS[k]) {
        state = { ...state, [k]: loadSet(k) };
        changed = true;
      }
    }
    if (changed) notify();
  });
}

/* ── Generic helpers ───────────────────────────────────────── */

function toggle(key: PrefKey, id: string) {
  const next = new Set(state[key]);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  state = { ...state, [key]: next };
  saveSet(key, next);
  notify();
}

function add(key: PrefKey, id: string) {
  if (state[key].has(id)) return;
  const next = new Set(state[key]);
  next.add(id);
  state = { ...state, [key]: next };
  saveSet(key, next);
  notify();
}

function remove(key: PrefKey, id: string) {
  if (!state[key].has(id)) return;
  const next = new Set(state[key]);
  next.delete(id);
  state = { ...state, [key]: next };
  saveSet(key, next);
  notify();
}

function clearKey(key: PrefKey) {
  if (state[key].size === 0) return;
  state = { ...state, [key]: new Set() };
  saveSet(key, state[key]);
  notify();
}

/* ── Public API ────────────────────────────────────────────── */

export const dashboardPrefs = {
  subscribe,
  getSnapshot: (): DashboardPrefsState => state,

  // Projects (top-level)
  toggleCollapsedProject: (id: string) => toggle("collapsedProjects", id),
  hideProject: (id: string) => add("hiddenProjects", id),
  unhideProject: (id: string) => remove("hiddenProjects", id),
  unhideAllProjects: () => clearKey("hiddenProjects"),

  // Workflows (sub-projects = workflow roots)
  toggleCollapsedWorkflow: (id: string) => toggle("collapsedWorkflows", id),
  hideWorkflow: (id: string) => add("hiddenWorkflows", id),
  unhideWorkflow: (id: string) => remove("hiddenWorkflows", id),
  unhideAllWorkflows: () => clearKey("hiddenWorkflows"),

  // Completed column (per workflow card; default = closed)
  toggleCompletedColumn: (rootIssueId: string) => toggle("openCompletedColumns", rootIssueId),
  isCompletedColumnOpen: (rootIssueId: string) => state.openCompletedColumns.has(rootIssueId),
};

export type { DashboardPrefsState };

/* ── React hook ────────────────────────────────────────────── */

import { useSyncExternalStore } from "react";

export function useDashboardPrefs(): DashboardPrefsState {
  return useSyncExternalStore(
    dashboardPrefs.subscribe,
    dashboardPrefs.getSnapshot,
    dashboardPrefs.getSnapshot,
  );
}
