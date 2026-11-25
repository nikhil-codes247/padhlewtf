/**
 * progress.js — the single source of truth for every completion number in the app.
 *
 * Model
 * -----
 * A chapter's real work is its **leaves**:
 *   - if the chapter has no topic/subtopic/task children, the chapter itself is one leaf;
 *   - otherwise a leaf is any descendant node that has no children of its own.
 * Progress is *always* computed from leaves, so a parent item is never counted
 * alongside its own descendants (no double counting).
 *
 * Every metric is `done / total` over an explicit denominator, and the caller can
 * always show the two raw numbers — nothing is a stored or hardcoded percentage.
 *
 * Scopes separate mandatory board work from internal/optional work:
 *   board    = assessed in the board exam  (drives the headline %)
 *   internal = school-assessed only (periodic tests / projects / formative)
 *   optional = excluded / practical-only — tracked, never counted as "unfinished"
 */

const SCOPES = ["board", "internal", "optional"];

export function buildNodeIndex(nodes) {
  const byChapter = new Map();
  const parentIds = new Set();
  for (const n of nodes) {
    if (n.parentId) parentIds.add(n.parentId);
    let list = byChapter.get(n.chapterId);
    if (!list) { list = []; byChapter.set(n.chapterId, list); }
    list.push(n);
  }
  return { byChapter, parentIds };
}

/** The leaves of one chapter (see model note above). */
export function leavesOfChapter(chapter, nodeIndex) {
  const kids = nodeIndex.byChapter.get(chapter.id) || [];
  if (!kids.length) {
    return [{ kind: "chapter", id: chapter.id, chapterId: chapter.id, nodeId: null,
      done: !!chapter.done, status: chapter.status || "To Do", estMin: chapter.estMin || 0 }];
  }
  const leaves = kids.filter((n) => !nodeIndex.parentIds.has(n.id));
  const use = leaves.length ? leaves : kids; // defensive: never return nothing
  return use.map((n) => ({ kind: "node", id: n.id, chapterId: chapter.id, nodeId: n.id,
    done: !!n.done, status: n.status || "To Do", estMin: n.estMin || 0 }));
}

export function buildRevisionIndex(revisions) {
  const max = new Map();       // "chapter:<id>" | "node:<id>" -> highest pass
  const dates = new Map();     // key -> last revision date
  for (const r of revisions || []) {
    if (!r || !r.targetId) continue;
    const key = `${r.targetType || "chapter"}:${r.targetId}`;
    const p = Number(r.pass) || 1;
    if (!max.has(key) || p > max.get(key)) max.set(key, p);
    if (r.dateISO && (!dates.has(key) || r.dateISO > dates.get(key))) dates.set(key, r.dateISO);
  }
  return { max, dates };
}

const pct = (done, total) => (total > 0 ? Math.round((done / total) * 1000) / 10 : 0);
const empty = () => ({ leaves: 0, done: 0, pct: 0, chapters: 0, chaptersDone: 0, chaptersPct: 0 });

function add(bucket, ch) {
  bucket.leaves += ch.leaves;
  bucket.done += ch.done;
  bucket.chapters += 1;
  if (ch.leaves > 0 && ch.done === ch.leaves) bucket.chaptersDone += 1;
}

function finish(bucket) {
  bucket.pct = pct(bucket.done, bucket.leaves);
  bucket.chaptersPct = pct(bucket.chaptersDone, bucket.chapters);
  return bucket;
}

/**
 * @returns complete, store-derived progress snapshot.
 */
export function computeProgress({ subjects = [], chapters = [], nodes = [], revisions = [], sessions = [], notes = [], today }) {
  const nodeIndex = buildNodeIndex(nodes);
  const revIndex = buildRevisionIndex(revisions);

  // per-chapter detail
  const chapterStats = {};
  const bySubject = new Map();
  const scopes = { board: empty(), internal: empty(), optional: empty(), all: empty() };

  for (const ch of chapters) {
    const leaves = leavesOfChapter(ch, nodeIndex);
    let done = 0, passes = 0, doubt = false, mins = 0;
    for (const leaf of leaves) {
      if (leaf.done) done += 1;
      const key = `${leaf.kind}:${leaf.id}`;
      const p = revIndex.max.get(key) || 0;
      if (p > passes) passes = p;
    }
    for (const s of sessions) if (s.chapterId === ch.id) mins += Number(s.minutes) || 0;
    for (const n of notes) if (n.chapterId === ch.id && n.kind === "doubt" && n.doubtStatus !== "resolved") doubt = true;

    const stat = {
      id: ch.id, subjectId: ch.subjectId, scope: ch.scope || "board",
      leaves: leaves.length, done, pct: pct(done, leaves.length),
      passes, lastRevision: revIndex.dates.get(`chapter:${ch.id}`) || maxNodeDate(leaves, revIndex),
      doubt, minutes: mins, status: ch.status || "To Do",
      doneFlag: !!ch.done,
    };
    chapterStats[ch.id] = stat;

    const bucket = scopes[ch.scope] || scopes.board;
    add(bucket, stat); add(scopes.all, stat);

    let s = bySubject.get(ch.subjectId);
    if (!s) { s = { id: ch.subjectId, scopes: { board: empty(), internal: empty(), optional: empty(), all: empty() }, doubts: 0, minutes: 0, chapters: 0, passes: 0 }; bySubject.set(ch.subjectId, s); }
    add(s.scopes[ch.scope] || s.scopes.board, stat);
    add(s.scopes.all, stat);
    s.chapters += 1; s.minutes += mins; if (passes > s.passes) s.passes = passes;
  }
  SCOPES.forEach((k) => finish(scopes[k]));
  finish(scopes.all);

  // revision readiness over board work
  const boardChapters = chapters.filter((c) => (c.scope || "board") === "board");
  let boardLeaves = 0, boardDone = 0, rev1 = 0, rev2 = 0;
  const revDue = [];
  for (const ch of boardChapters) {
    const st = chapterStats[ch.id];
    boardLeaves += st.leaves; boardDone += st.done;
    if (st.done > 0 && st.passes >= 1) rev1 += 1;
    if (st.passes >= 2) rev2 += 1;
    if (st.done === st.leaves && st.leaves > 0 && st.passes === 0) revDue.push({ chapterId: ch.id, subjectId: ch.subjectId, leaves: st.leaves });
  }
  const doneChapters = boardChapters.filter((c) => chapterStats[c.id].leaves > 0 && chapterStats[c.id].done === chapterStats[c.id].leaves).length;

  // doubts
  const doubts = { open: 0, total: 0, byScope: { board: 0, internal: 0, optional: 0 } };
  const chapterScope = new Map(chapters.map((c) => [c.id, c.scope || "board"]));
  for (const n of notes) {
    if (n.kind !== "doubt") continue;
    doubts.total += 1;
    if (n.doubtStatus !== "resolved") {
      doubts.open += 1;
      const sc = n.chapterId ? chapterScope.get(n.chapterId) : "board";
      if (sc in doubts.byScope) doubts.byScope[sc] += 1;
    }
  }

  const subjectsOut = subjects.map((s) => {
    const agg = bySubject.get(s.id);
    if (agg) SCOPES.forEach((k) => finish(agg.scopes[k]));
    if (agg) finish(agg.scopes.all);
    return { ...s, ...(agg || { scopes: { board: empty(), internal: empty(), optional: empty(), all: empty() }, doubts: 0, minutes: 0, chapters: 0, passes: 0 }) };
  });

  return {
    today,
    scopes,
    chapters: chapterStats,
    subjects: subjectsOut,
    totals: {
      subjects: subjects.length,
      chapters: chapters.length,
      leaves: scopes.all.leaves,
      boardLeaves,
      boardDone,
    },
    revision: {
      boardChapters: boardChapters.length,
      doneChapters,
      rev1, rev2,
      rev1Pct: pct(rev1, doneChapters),
      rev2Pct: pct(rev2, rev1),
      due: revDue,
    },
    doubts,
    formula: {
      headline: "Overall syllabus completion = ticked leaf items in the board scope ÷ all leaf items in the board scope. Internal (periodic/project) and optional (excluded/practical) work is tracked in its own scope and never counted as unfinished board work.",
      firstPass: "First pass = number of board chapters whose leaves are all ticked.",
      revision: "Revision = of the fully first-passed board chapters, the share with at least one recorded revision pass.",
      secondRevision: "Second revision = of the revised chapters, the share with two or more recorded passes.",
    },
  };
}

function maxNodeDate(leaves, revIndex) {
  let best = null;
  for (const leaf of leaves) {
    const d = revIndex.dates.get(`${leaf.kind}:${leaf.id}`);
    if (d && (!best || d > best)) best = d;
  }
  return best;
}

/**
 * Time aggregation — kept separate from completion (time is never treated as completion).
 */
export function aggregateTime(sessions = [], { chapters = [], nodes = [], subjects = [], today } = {}) {
  const chapterById = new Map(chapters.map((c) => [c.id, c]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const out = {
    total: 0, today: 0, week: 0,
    byDate: {}, bySubject: {}, byChapter: {}, byNode: {}, byActivity: {},
    longVsEstimate: [],
  };
  const weekStart = today ? weekStartISO(today) : null;
  for (const s of sessions) {
    const m = Number(s.minutes) || 0;
    out.total += m;
    if (today && s.dateISO === today) out.today += m;
    if (today && weekStart && s.dateISO >= weekStart && s.dateISO <= today) out.week += m;
    out.byDate[s.dateISO] = (out.byDate[s.dateISO] || 0) + m;
    if (s.subjectId) out.bySubject[s.subjectId] = (out.bySubject[s.subjectId] || 0) + m;
    if (s.chapterId) out.byChapter[s.chapterId] = (out.byChapter[s.chapterId] || 0) + m;
    if (s.nodeId) out.byNode[s.nodeId] = (out.byNode[s.nodeId] || 0) + m;
    out.byActivity[s.activity || "learn"] = (out.byActivity[s.activity || "learn"] || 0) + m;
  }
  // topics where actual time exceeded the estimate
  for (const [nodeId, mins] of Object.entries(out.byNode)) {
    const n = nodeById.get(nodeId);
    if (n && n.estMin && mins > n.estMin) {
      out.longVsEstimate.push({ id: nodeId, name: n.name, estMin: n.estMin, actual: mins, over: mins - n.estMin, chapterId: n.chapterId });
    }
  }
  for (const [chId, mins] of Object.entries(out.byChapter)) {
    const c = chapterById.get(chId);
    if (c && c.estMin && mins > c.estMin) {
      out.longVsEstimate.push({ id: chId, name: c.name, estMin: c.estMin, actual: mins, over: mins - c.estMin, chapterId: chId });
    }
  }
  out.longVsEstimate.sort((a, b) => b.over - a.over);
  return out;
}

function weekStartISO(iso) {
  const d = new Date(iso + "T12:00:00");
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
