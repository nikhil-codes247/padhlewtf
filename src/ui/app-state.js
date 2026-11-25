/**
 * app-state.js — shared mutable UI state for the app shell.
 *
 * Holds the `ui` object, shell references, and view context. Both app.js and
 * the split-out UI modules import from here to avoid circular dependencies.
 */
export const ui = {
  q: "",
  status: "all", scope: "all", tag: "all", sort: "order", subject: "all",
  nq: "", noteKind: "all", noteStatus: "all", noteSubject: "all", notePinned: false,
  open: new Set(),
  range: "14",
  shareKind: null,
  invites: [],
  shares: [],
  timerBlock: 30,
  calMonth: null,
  calSelected: null,
  planStart: null,
  _tagIndex: new Map(),
  _tags: [],
  onbStep: 0,
  _onb: {},
  sidebarOpen: true,
};

export const shell = { mode: null, viewEl: null, ctx: null, cleanupView: null, syncedProfileKey: "" };
