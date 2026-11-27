/**
 * recommend.js — "What should I study next?"
 *
 * Transparent, additive scoring. Every suggestion carries the list of signals
 * that produced its score, so the UI can always answer *why*, and the user keeps
 * full control: these are suggestions, never automatic changes.
 *
 * Weights (documented, deterministic):
 *   overdue planned task        100 + 5/day late (max +40)
 *   overdue deadline             60 + 4/day late (max +40)
 *   deadline within 3 days       35      within 7 days  20
 *   priority            P1 +30   P2 +15   P3 +5
 *   tier                1 +25    2 +12    3 +3
 *   status              In Progress +20   Revise +18   Second Revision +12
 *   open doubt                  +22
 *   unblocks later chapters     +15 (only when this chapter is the earliest unfinished one)
 *   blocks on earlier work      -30 (earlier chapter in the same subject unfinished)
 *   fits the free time today    +10   doesn't fit  -10
 *   studied in the last 2 days  -15   not touched for 14+ days & done  +10 (revision)
 */
import { diffDays } from "./dates.js?v=mwz7xp2l";
import { buildNodeIndex, leavesOfChapter } from "./progress.js?v=mwz7xp2l";

export const WEIGHTS = {
  plannedOverdueBase: 100, plannedOverduePerDay: 5, plannedOverdueCap: 40,
  deadlineOverdueBase: 60, deadlineOverduePerDay: 4, deadlineOverdueCap: 40,
  dueSoon3: 35, dueSoon7: 20,
  priority: { P1: 30, P2: 15, P3: 5 },
  tier: { "1": 25, "2": 12, "3": 3 },
  status: { "In Progress": 20, Revise: 18, "Second Revision": 12 },
  doubt: 22, unblocks: 15, blocked: -30, fitsTime: 10, noFitTime: -10,
  recentStudy: -15, staleRevision: 10,
};

const ACTIVITY_LABEL = { learn: "initial learning", practice: "practice", revision: "revision", doubt: "doubt resolution" };

export function chapterEstimate(chapter, nodes) {
  const idx = buildNodeIndex(nodes.filter((n) => n.chapterId === chapter.id));
  const leaves = leavesOfChapter(chapter, idx);
  const sum = leaves.reduce((a, l) => a + (Number(l.estMin) || 0), 0);
  return sum || Number(chapter.estMin) || 30;
}

/**
 * @param {object} input
 * @param {object} input.progress  result of computeProgress()
 * @param {Array}  input.chapters
 * @param {Array}  input.nodes
 * @param {Array}  input.planner
 * @param {Array}  input.sessions
 * @param {Array}  input.notes
 * @param {string} input.today
 * @param {number} input.availableMin  free minutes the user has stated for today
 * @param {number} [input.limit=6]
 */
export function recommendNext(input) {
  const {
    progress, chapters = [], nodes = [], planner = [], sessions = [], notes = [],
    today, availableMin = 120, limit = 6,
  } = input;

  const stats = progress?.chapters || {};
  const chapterById = new Map(chapters.map((c) => [c.id, c]));
  const lastStudy = new Map(); // chapterId -> most recent session date
  const lastActivity = new Map();
  for (const s of sessions) {
    if (!s.chapterId) continue;
    const prev = lastStudy.get(s.chapterId);
    if (!prev || s.dateISO > prev) { lastStudy.set(s.chapterId, s.dateISO); lastActivity.set(s.chapterId, s.activity || "learn"); }
  }
  const openDoubts = new Map(); // chapterId -> count
  for (const n of notes) {
    if (n.kind === "doubt" && n.doubtStatus !== "resolved" && n.chapterId) {
      openDoubts.set(n.chapterId, (openDoubts.get(n.chapterId) || 0) + 1);
    }
  }

  // earliest-unfinished index per subject (for prerequisite signals)
  const earliestUnfinished = new Map();
  const orderBySubject = new Map();
  for (const c of chapters) {
    if ((c.scope || "board") !== "board") continue;
    let list = orderBySubject.get(c.subjectId) || [];
    list.push(c);
    orderBySubject.set(c.subjectId, list);
  }
  for (const [sid, list] of orderBySubject) {
    list.sort((a, b) => a.order - b.order);
    const first = list.find((c) => (stats[c.id]?.pct ?? 0) < 100);
    if (first) earliestUnfinished.set(sid, first.id);
    orderBySubject.set(sid, list);
  }
  const blocksCount = new Map(); // chapterId -> how many later chapters it blocks
  for (const c of chapters) {
    if ((c.scope || "board") !== "board") continue;
    const list = orderBySubject.get(c.subjectId) || [];
    let n = 0;
    for (const later of list) if (later.order > c.order && (stats[later.id]?.pct ?? 0) < 100) n += 1;
    if (n) blocksCount.set(c.id, n);
  }

  const candidates = [];
  const push = (cand) => {
    cand.signals = cand.signals || [];
    cand.score = Math.round(cand.signals.reduce((a, s) => a + s.points, 0) * 10) / 10;
    candidates.push(cand);
  };

  // ---------------------------------------------------------------- planned --
  for (const p of planner) {
    if (p.done) continue;
    if (p.dateISO > today) continue;
    const late = Math.max(0, -diffDays(today, p.dateISO));
    if (late === 0 && p.dateISO !== today) continue;
    const pts = [
      { label: late > 0 ? `planned ${late} day${late > 1 ? "s" : ""} ago and still open` : "planned for today", points: WEIGHTS.plannedOverdueBase + Math.min(late * WEIGHTS.plannedOverduePerDay, WEIGHTS.plannedOverdueCap) },
    ];
    const ch = p.chapterId ? chapterById.get(p.chapterId) : null;
    if (ch) {
      if (WEIGHTS.priority[ch.priority]) pts.push({ label: `priority ${ch.priority}`, points: WEIGHTS.priority[ch.priority] });
      if (WEIGHTS.tier[ch.globalTier]) pts.push({ label: `global tier ${ch.globalTier}`, points: WEIGHTS.tier[ch.globalTier] });
    }
    if (openDoubts.get(p.chapterId)) pts.push({ label: "has an unresolved doubt", points: WEIGHTS.doubt });
    push({
      key: `plan:${p.id}`, type: "planned", plannerId: p.id,
      chapterId: p.chapterId || null, nodeId: p.nodeId || null, subjectId: p.subjectId || ch?.subjectId || null,
      title: p.title || ch?.name || "Planned task",
      subtitle: ch ? `${ch.subjectId} · ${ch.name}` : "from your planner",
      estMin: Number(p.estMin) || 30,
      deadline: p.dateISO, scope: ch?.scope || "board",
      tags: [], signals: pts,
    });
  }

  // --------------------------------------------------------------- chapters --
  for (const ch of chapters) {
    const st = stats[ch.id];
    if (!st) continue;
    if (st.leaves === 0) continue;
    const scope = ch.scope || "board";
    const fullyDone = st.done === st.leaves;
    const unstarted = st.done === 0;
    const signals = [];

    // what kind of work is this?
    let type = "learn";
    if (!fullyDone && st.done > 0) type = "continue";
    if (fullyDone && st.passes === 0) type = "revision";
    if (fullyDone && st.passes === 1) type = "revision2";
    if (openDoubts.get(ch.id) && (fullyDone || st.done > 0)) type = "doubt";

    if (st.deadlineStatus === "overdue") {
      const late = Math.max(0, -diffDays(today, ch.deadline));
      signals.push({ label: `deadline passed ${late} day${late > 1 ? "s" : ""} ago`, points: WEIGHTS.deadlineOverdueBase + Math.min(late * WEIGHTS.deadlineOverduePerDay, WEIGHTS.deadlineOverdueCap) });
    } else if (ch.deadline) {
      const n = diffDays(today, ch.deadline);
      if (n !== null && n <= 3) signals.push({ label: `deadline in ${n} day${n === 1 ? "" : "s"}`, points: WEIGHTS.dueSoon3 });
      else if (n !== null && n <= 7) signals.push({ label: `deadline in ${n} days`, points: WEIGHTS.dueSoon7 });
    }
    if (WEIGHTS.priority[ch.priority]) signals.push({ label: `priority ${ch.priority}`, points: WEIGHTS.priority[ch.priority] });
    if (WEIGHTS.tier[ch.globalTier]) signals.push({ label: `global tier ${ch.globalTier}`, points: WEIGHTS.tier[ch.globalTier] });
    if (WEIGHTS.status[st.status]) signals.push({ label: `status “${st.status}”`, points: WEIGHTS.status[st.status] });
    if (openDoubts.get(ch.id)) signals.push({ label: `${openDoubts.get(ch.id)} unresolved doubt${openDoubts.get(ch.id) > 1 ? "s" : ""}`, points: WEIGHTS.doubt });
    if (type === "revision2") signals.push({ label: "second revision pending", points: WEIGHTS.status["Second Revision"] });

    const firstUnfinished = earliestUnfinished.get(ch.subjectId);
    if (!fullyDone && firstUnfinished === ch.id) {
      const blocking = blocksCount.get(ch.id) || 0;
      if (blocking) signals.push({ label: `earliest unfinished chapter — unblocks ${blocking} later chapter${blocking > 1 ? "s" : ""}`, points: WEIGHTS.unblocks });
    } else if (!fullyDone && firstUnfinished && typeof ch.order === "number") {
      const first = chapterById.get(firstUnfinished);
      if (first && ch.order > first.order) signals.push({ label: `an earlier chapter (“${first.name}”) is still unfinished`, points: WEIGHTS.blocked });
    }

    const est = chapterEstimate(ch, nodes);
    if (est <= availableMin) signals.push({ label: `fits in your ${Math.round(availableMin / 60 * 10) / 10}h of free time`, points: WEIGHTS.fitsTime });
    else signals.push({ label: `needs ${Math.round(est / 6) / 10}h — more than today's ${Math.round(availableMin / 6) / 10}h`, points: WEIGHTS.noFitTime });

    const last = lastStudy.get(ch.id);
    if (last) {
      const ago = Math.max(0, diffDays(last, today) ?? 0);
      if (ago <= 2) signals.push({ label: `studied ${ago === 0 ? "today" : ago + " day(s) ago"} — spaced repetition says let it settle`, points: WEIGHTS.recentStudy });
      else if (ago >= 14 && fullyDone) signals.push({ label: `not revised for ${ago} days`, points: WEIGHTS.staleRevision });
    }

    if (scope !== "board") signals.push({ label: scope === "internal" ? "internal (school-assessed) work" : "optional work — not board-assessed", points: scope === "internal" ? 8 : -5 });
    if (unstarted) signals.push({ label: "not started yet", points: 5 });

    push({
      key: `ch:${ch.id}`, type, chapterId: ch.id, nodeId: null, subjectId: ch.subjectId,
      title: ch.name, subtitle: ch.unit || "", estMin: est,
      deadline: ch.deadline || null, scope, status: st.status,
      tags: ch.tags || [], signals,
      meta: { done: st.done, leaves: st.leaves, pct: st.pct, passes: st.passes },
    });
  }

  // dedupe: at most one candidate per chapter, keep the highest scoring
  const best = new Map();
  for (const c of candidates) {
    const k = c.chapterId ? `ch:${c.chapterId}` : c.key;
    const prev = best.get(k);
    if (!prev) { best.set(k, c); continue; }
    // a planned task with the same chapter always wins for "today"
    if (c.type === "planned" || (prev.type !== "planned" && c.score > prev.score)) {
      // merge signals so the reason list stays complete
      if (prev.chapterId === c.chapterId && prev.type !== c.type) {
        c.signals = [...c.signals, ...prev.signals.filter((s) => !c.signals.some((x) => x.label === s.label))];
        c.score = Math.round(c.signals.reduce((a, s) => a + s.points, 0) * 10) / 10;
      }
      best.set(k, c);
    }
  }

  const suggestions = [...best.values()]
    .sort((a, b) => b.score - a.score || (a.estMin - b.estMin))
    .slice(0, limit);

  // ------------------------------------------------------------- overload ----
  const plannedToday = planner.filter((p) => p.dateISO === today);
  const plannedMin = plannedToday.reduce((a, p) => a + (Number(p.estMin) || 0), 0);
  const openToday = planner.filter((p) => p.dateISO === today && !p.done);
  const openMin = openToday.reduce((a, p) => a + (Number(p.estMin) || 0), 0);

  return {
    suggestions,
    legend: WEIGHTS,
    activityLabel: ACTIVITY_LABEL,
    utilization: {
      availableMin,
      plannedMin,
      openCount: openToday.length,
      openMin,
      overloaded: openMin > availableMin,
      excess: Math.max(0, openMin - availableMin),
      remaining: Math.max(0, availableMin - openMin),
    },
  };
}
