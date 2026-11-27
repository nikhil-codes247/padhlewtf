/**
 * store.js — the single source of truth (Supabase-backed).
 *
 * Responsibilities: load from Supabase into memory, expose selectors, apply
 * validated mutations (persist to Supabase first, then update memory, then
 * notify), cascade deletes so no orphan records survive, and recompute all
 * derived analytics.
 *
 * Views never compute progress themselves — they read `store.derived`.
 *
 * All writes go to Supabase PostgreSQL via `src/core/supabase.js`. Row Level
 * Security ensures one student can never read or write another student's rows.
 *
 * Phase 2: lazy loading. The app no longer downloads every row at boot.
 *   · Settings + subjects load first (fast boot).
 *   · Curriculum (chapters / nodes) is cached in localStorage and only
 *     refreshed when the seed version changes.
 *   · Activity (sessions, revisions, notes, planner, points, attempts) is
 *     loaded for the last 90 days only; older history is fetched on demand.
 *   · Flashcard progress loads only due cards; the rest is fetched on demand.
 */
import {
  selectRows, insertRows, upsertRows, deleteRows, currentUser,
  SupabaseError,
} from "./supabase.js?v=mwz8yitl";
import { DEFAULT_SETTINGS } from "./settings.js?v=mwz8yitl";
import { computeProgress, aggregateTime, buildNodeIndex } from "./progress.js?v=mwz8yitl";
import { recommendNext } from "./recommend.js?v=mwz8yitl";
import { newId } from "./ids.js?v=mwz8yitl";
import { todayISO, addDays, diffDays } from "./dates.js?v=mwz8yitl";
import { exportBundle, validateBundle, bundleToStoreMap, SCHEMA_VERSION } from "./exportimport.js?v=mwz8yitl";
import { requiredName, minutesOrNull, dateOrNull, parseTags, STATUSES, inSet, validateSession, clampSessionMinutes } from "./validate.js?v=mwz8yitl";
import { buildPlanEntries } from "./planLoader.js?v=mwz8yitl";
import { computeStreaks, buildDayActivity, qualifiesForStreak, heatmapLevel } from "./streak.js?v=mwz8yitl";
import { DEFAULT_TAGS, SEED_VERSION } from "./defaultTags.js?v=mwz8yitl";
import {
  totalPoints, levelForPoints, pointsForSession, remainingChecklistAwards, shouldAwardDailyGoal,
  sessionDedupeKey, itemDedupeKey, revisionDedupeKey, doubtDedupeKey, dailyGoalDedupeKey,
} from "./gamification.js?v=mwz8yitl";
import { evaluateAchievements } from "./achievements.js?v=mwz8yitl";
import { buildQuests, questDedupeKey } from "./quests.js?v=mwz8yitl";
import { summariseFlashcards, summariseQuestions } from "./revisionStats.js?v=mwz8yitl";
import { STREAK_MIN_ITEMS, STREAK_MIN_MINUTES, STREAK_MILESTONES, POINTS } from "./constants.js?v=mwz8yitl";
import { brand } from "./branding.js?v=mwz8yitl";

/* ----------------------------------------------------------- lazy-loading -- */

/** How many days of recent activity to load at boot. */
const RECENT_DAYS = 90;

/** localStorage keys are per-user so different students don't collide. */
function lsKey(uid, name) {
  return `padhle.${uid}.${name}`;
}

/** Read curriculum (chapters + nodes) from localStorage cache. */
function readCurriculumCache(uid, seedVersion) {
  try {
    const raw = localStorage.getItem(lsKey(uid, "curriculum"));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.seedVersion === seedVersion) return data;
    return null;
  } catch { return null; }
}

/** Write curriculum (chapters + nodes) to localStorage cache. */
function writeCurriculumCache(uid, seedVersion, chapters, nodes) {
  try {
    localStorage.setItem(lsKey(uid, "curriculum"), JSON.stringify({
      seedVersion, chapters, nodes,
      cachedAt: new Date().toISOString(),
    }));
  } catch { /* localStorage may be full or blocked — ignore silently. */ }
}

/** Drop the local curriculum cache (used after a destructive reset). */
function clearCurriculumCache(uid) {
  try { localStorage.removeItem(lsKey(uid, "curriculum")); } catch { /* ignore */ }
}

/**
 * Merge per-user state rows (user_chapter_state / user_node_state) on top of
 * curriculum rows. `key` is the state table's foreign-key column.
 *
 * The local cache only ever holds the shared curriculum; progress must be
 * merged from Supabase on every load or it looks like it was reset.
 */
function mergeUserState(rows, stateRows, key) {
  const byId = new Map((stateRows || []).map((s) => [s[key], s]));
  return (rows || []).map((row) => {
    const app = toAppRow(row);
    const state = byId.get(app.id);
    if (!state) return app;
    // Overlay only the per-user columns. Never let the state row's own keys
    // (user_id, the foreign key, an unexpected `id`) clobber the curriculum
    // record that identifies the item.
    const overlay = { ...state };
    delete overlay.id;
    delete overlay.user_id;
    delete overlay[key];
    return toAppRow({ ...app, ...overlay });
  });
}

const EMPTY_STATE = () => ({
  subjects: [], chapters: [], nodes: [], sessions: [], revisions: [],
  notes: [], planner: [], tags: [], points: [], votes: [], settings: {},
  // Revision Centre progress lives in Supabase too; the home screen reads these.
  flashcardProgress: [], questionAttempts: [],
  // Tracks which data domains have been loaded (lazy-loading flags).
  _loaded: { core: false, curriculum: false, activity: false, progress: false },
});

/** Status change rules — keep `done` (first pass) and `status` (workflow) coherent. */
export function applyStatusRules(rec, status) {
  const next = { ...rec, status };
  if (status === "To Do" || status === "In Progress") next.done = false;
  if (status === "Done" || status === "Revise" || status === "Second Revision") next.done = true;
  return next;
}
export function toggleDone(rec) {
  const done = !rec.done;
  let status = rec.status || "To Do";
  if (done && (status === "To Do" || status === "In Progress")) status = "Done";
  if (!done && (status === "Done" || status === "Revise" || status === "Second Revision")) status = "To Do";
  return { ...rec, done, status };
}

/* ------------------------------------------------ camelCase ↔ snake_case --- */

/** App-field → DB-column overrides where names differ beyond simple snake_case. */
const FIELD_ALIASES = {
  subjects: { short: "short_name", notes: "description", order: "sort_order" },
  study_subjects: { short: "short_name", notes: "description", order: "sort_order" },
};

/**
 * The account catalogue keeps the public `subjects` table from 0001/0002. The
 * study workspace stores a per-student copy (plus custom subjects) in
 * `study_subjects`, because seeded ids such as `sub-math` are the same for every
 * student and would collide in a global-primary-key table.
 */
const SUBJECTS_TABLE = "study_subjects";

/** Backups keep the app-facing store key `subjects`; writes go to `study_subjects`. */
const TABLE_FOR_STORE = { subjects: SUBJECTS_TABLE };
const dbTable = (storeKey) => TABLE_FOR_STORE[storeKey] || storeKey;

/**
 * Every per-student table has a composite primary key `(user_id, id)`. Seeded
 * ids repeat across students, so an upsert must match on both columns.
 */
const OWNED_CONFLICT = "user_id,id";

/** Convert an app record (camelCase) to a Supabase row (snake_case) for a given table. */
export function toDbRow(rec, table) {
  const out = { ...rec };
  // Every owner-only table is scoped by `user_id` and protected by RLS, so the
  // camelCase record field must be carried across rather than dropped.
  if (out.userId !== undefined) {
    out.user_id = out.userId;
    delete out.userId;
  }
  const renames = FIELD_ALIASES[table] || {};
  for (const [appField, dbCol] of Object.entries(renames)) {
    if (out[appField] !== undefined) {
      out[dbCol] = out[appField];
      delete out[appField];
    }
  }
  for (const [k, v] of Object.entries(out)) {
    // camelCase → snake_case that treats runs of capitals as an acronym, so
    // dateISO -> date_iso (not date_i_s_o), subjectId -> subject_id, etc.
    let snake = k
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .toLowerCase();
    if (snake !== k) { out[snake] = v; delete out[k]; }
  }
  return out;
}

/** Convert a Supabase row (snake_case) to an app record (camelCase). */
export function toAppRow(row) {
  const out = { ...row };
  delete out.user_id;
  const reverse = { short_name: "short", description: "notes", sort_order: "order" };
  for (const [dbCol, appField] of Object.entries(reverse)) {
    if (out[dbCol] !== undefined) {
      out[appField] = out[dbCol];
      delete out[dbCol];
    }
  }
  for (const [k, v] of Object.entries(out)) {
    // Mirror of the write-side acronym rule: `date_iso` must become `dateISO`
    // (not `dateIso`), or every loaded planner/session row is invisible to the
    // views that filter on `dateISO`.
    const camel = k
      .split("_")
      .map((part, i) => (i === 0 ? part : part === "iso" ? "ISO" : part.charAt(0).toUpperCase() + part.slice(1)))
      .join("");
    if (camel !== k) { out[camel] = v; delete out[k]; }
  }
  return out;
}

/** Require an authenticated user, returning their id. */
function requireUid() {
  const uid = currentUser()?.id;
  if (!uid) throw new SupabaseError("No authenticated user.", { code: "not_authenticated" });
  return uid;
}

/* ------------------------------------------------------------ lifecycle -- */

class Store {
  constructor() {
    this.state = EMPTY_STATE();
    this.listeners = new Set();
    this.ready = false;
    this.error = null;
    this.derived = null;
    this._suppress = false;
  }

  async init() {
    try {
      const uid = currentUser()?.id;

      if (uid) {
        // Phase 2: load in stages so boot is fast.
        // 1. Settings + subjects (small, needed immediately).
        await this._loadCore();
        // 2. Curriculum (chapters / nodes) — from localStorage cache or Supabase.
        await this._loadCurriculum();
        // 3. Recent activity only (last 90 days).
        await this._loadRecentActivity();

        // Seed a new database with the syllabus when the student has no subjects yet.
        if (!this.state.settings.seededAt) {
          await this._ensureSeed();
          await this._saveSettings({ seededAt: new Date().toISOString() });
          this.state.settings.seededAt = new Date().toISOString();
          // After seeding, reload everything so the new subjects/chapters are in memory.
          await this._loadCore();
          await this._loadCurriculum();
          await this._loadRecentActivity();
        }
      } else {
        // Signed out: the public pages render, but there is no study data to
        // load. Every study record lives in the student's own Supabase rows.
        this.state.settings = { ...DEFAULT_SETTINGS };
      }

      this.state.settings.timer = { ...DEFAULT_SETTINGS.timer, ...(this.state.settings.timer || {}) };

      if (!this.state.settings.planStartDate) {
        await this._saveSettings({ planStartDate: todayISO() });
        this.state.settings.planStartDate = todayISO();
      }

      try {
        await this.ensureDefaultDeadlines({ silent: true });
      } catch (err) {
        console.warn("[store] ensureDefaultDeadlines skipped:", err?.message ?? err);
      }
      this.ready = true;
      this.recompute();
      this.emit();
      return this;
    } catch (err) {
      this.error = err;
      this.ready = false;
      this.emit();
      throw err;
    }
  }

  /** Load only settings + subjects — small data needed for immediate boot. */
  async _loadCore() {
    const uid = requireUid();
    const owner = `user_id=eq.${encodeURIComponent(uid)}`;
    const [settingsRows, subjects] = await Promise.all([
      selectRows("user_settings", `${owner}&limit=1`),
      selectRows(SUBJECTS_TABLE, `${owner}&order=sort_order.asc`),
    ]);

    const settingsRow = Array.isArray(settingsRows) && settingsRows.length ? settingsRows[0] : null;
    const storedSettings = settingsRow ? settingsRow.settings_json : null;
    this.state.settings = { ...DEFAULT_SETTINGS, ...(storedSettings || {}) };
    this.state.subjects = (subjects || []).map(toAppRow);
    this.state._loaded = this.state._loaded || { core: false, curriculum: false, activity: false, progress: false };
    this.state._loaded.core = true;
  }

  /** Load curriculum (chapters + nodes). Uses localStorage cache when possible.
   *
   * Phase 3: chapters and nodes are now global (shared by every student).
   * Per-user state (done, tags, deadline, etc.) lives in user_chapter_state /
   * user_node_state and is merged in memory.
   */
  async _loadCurriculum() {
    const uid = requireUid();
    const seedVersion = this.state.settings.seedVersion || SCHEMA_VERSION;

    this.state._loaded = this.state._loaded || { core: false, curriculum: false, activity: false, progress: false };

    // Per-user progress (done, deadline, notes, tags…) always comes live from
    // Supabase. These tables only hold rows the student actually changed, so
    // fetching them on every boot is cheap — and caching them locally is what
    // made progress vanish after a refresh.
    const [chapterState, nodeState] = await Promise.all([
      selectRows("user_chapter_state", `user_id=eq.${encodeURIComponent(uid)}`),
      selectRows("user_node_state", `user_id=eq.${encodeURIComponent(uid)}`),
    ]);

    // The shared curriculum (262 chapters / 384 nodes) is the expensive part,
    // so it is safe to read from the local cache.
    const cached = readCurriculumCache(uid, seedVersion);
    let chapters;
    let nodes;
    if (cached) {
      chapters = cached.chapters || [];
      nodes = cached.nodes || [];
    } else {
      [chapters, nodes] = await Promise.all([
        selectRows("curriculum_chapters", "order=order.asc"),
        selectRows("curriculum_nodes", "order=order.asc"),
      ]);
    }

    this.state.chapters = mergeUserState(chapters, chapterState, "chapter_id");
    this.state.nodes = mergeUserState(nodes, nodeState, "node_id");

    // Never cache an empty curriculum: a brand-new account seeds the shared
    // tables *after* this first read, and an empty cache would then hide the
    // freshly seeded syllabus forever.
    if (this.state.chapters.length || this.state.nodes.length) {
      writeCurriculumCache(uid, seedVersion, this.state.chapters, this.state.nodes);
    }
    this.state._loaded.curriculum = true;
  }

  /** Load recent activity (last 90 days) only — not the full history. */
  async _loadRecentActivity() {
    const uid = requireUid();
    const cutoff = addDays(todayISO(), -RECENT_DAYS);
    // Scope every read to this account explicitly. Row Level Security already
    // does this, but being explicit keeps the guarantee in the client too and
    // makes it impossible for a mis-set policy to mix two students' data.
    const owner = `user_id=eq.${encodeURIComponent(uid)}`;
    const scoped = (query) => `${owner}&${query}`;

    this.state._loaded = this.state._loaded || { core: false, curriculum: false, activity: false, progress: false };

    const [sessions, revisions, notes, planner, tags, points, flashcardProgress, questionAttempts] = await Promise.all([
      selectRows("sessions", scoped(`date_iso=gte.${encodeURIComponent(cutoff)}&order=date_iso.asc`)),
      selectRows("revisions", scoped(`date_iso=gte.${encodeURIComponent(cutoff)}&order=date_iso.asc`)),
      selectRows("notes", scoped(`created_at=gte.${encodeURIComponent(cutoff)}&order=created_at.asc`)),
      selectRows("planner", scoped(`date_iso=gte.${encodeURIComponent(cutoff)}&order=date_iso.asc,order.asc`)),
      // Ancillary tables must never blank the whole study log if one is missing
      // or temporarily unavailable; the planner, sessions and revisions above
      // are the data the student actually creates, so those stay strict.
      selectRows("tags", scoped("order=order.asc")).catch(() => []),
      selectRows("points", scoped(`occurred_at=gte.${encodeURIComponent(cutoff)}&order=occurred_at.asc`)).catch(() => []),
      // Revision progress: only due cards, not the full 9,180-row table.
      selectRows(
        "flashcard_progress",
        scoped("order=updated_at.asc&limit=200")
      ).catch(() => []),
      selectRows(
        "question_attempts",
        scoped("limit=500")
      ).catch(() => []),
    ]);

    this.state.sessions = (sessions || []).map(toAppRow);
    this.state.revisions = (revisions || []).map(toAppRow);
    this.state.notes = (notes || []).map(toAppRow);
    this.state.planner = (planner || []).map(toAppRow);
    this.state.tags = (tags || []).map(toAppRow);
    this.state.points = (points || []).map(toAppRow);
    this.state.flashcardProgress = (flashcardProgress || []).map(toAppRow);
    this.state.questionAttempts = (questionAttempts || []).map(toAppRow);
    this.state._loaded.activity = true;
    this.state._loaded.progress = true;
  }

  /** Load the full history of a specific table (called when a view needs it). */
  async loadFull(table) {
    const uid = requireUid();
    this.state._loaded = this.state._loaded || { core: false, curriculum: false, activity: false, progress: false };
    const orderMap = {
      sessions: "order=date_iso.asc",
      revisions: "order=date_iso.asc",
      notes: "order=created_at.asc",
      planner: "order=date_iso.asc,order.asc",
      points: "order=occurred_at.asc",
      flashcard_progress: "order=updated_at.asc",
      question_attempts: "order=chapter_id.asc",
    };
    const rows = await selectRows(table, `user_id=eq.${encodeURIComponent(uid)}&${orderMap[table] || "order=id.asc"}`);
    const mapped = (rows || []).map(toAppRow);
    switch (table) {
      case "sessions": this.state.sessions = mapped; break;
      case "revisions": this.state.revisions = mapped; break;
      case "notes": this.state.notes = mapped; break;
      case "planner": this.state.planner = mapped; break;
      case "points": this.state.points = mapped; break;
      case "flashcard_progress": this.state.flashcardProgress = mapped; break;
      case "question_attempts": this.state.questionAttempts = mapped; break;
      default: break;
    }
    this.state._loaded.activity = true;
    return mapped;
  }

  /** Ensure all activity data is loaded (for analytics/history views). */
  async ensureActivityLoaded() {
    this.state._loaded = this.state._loaded || { core: false, curriculum: false, activity: false, progress: false };
    if (this.state._loaded.activity) return;
    await this._loadRecentActivity();
  }

  /** Ensure flashcard progress is fully loaded (for revision dashboard). */
  async ensureProgressLoaded() {
    this.state._loaded = this.state._loaded || { core: false, curriculum: false, activity: false, progress: false };
    if (this.state._loaded.progress) return;
    await this.loadFull("flashcard_progress");
  }

  /** Seed this student's own workspace rows (idempotent).
   *
   * The educational content itself is owned by Supabase and seeded once by the
   * deployment (`npm run seed:supabase`): the subject catalogue, the shared
   * `curriculum_chapters` / `curriculum_nodes` syllabus and the revision
   * catalogue. A student's browser never writes or ships that content.
   *
   * What this method creates per student is only their private copy of the
   * subject list and their starter tags.
   */
  async _ensureSeed() {
    const uid = requireUid();
    const now = new Date().toISOString();

    // Subjects: copy the shared catalogue into this student's own rows so they
    // can carry per-student tags/deadlines and custom subjects.
    const catalogue = await selectRows("subjects", "select=*&order=sort_order.asc");
    const subjectRows = (catalogue || []).map((s) => toDbRow({
      id: s.id,
      name: s.name,
      shortName: s.short_name,
      code: s.code,
      color: s.color,
      accent: s.accent,
      kind: s.kind,
      totalMarks: s.total_marks,
      order: s.sort_order,
      description: s.description,
      createdAt: now,
      updatedAt: now,
    }, SUBJECTS_TABLE));
    for (const row of subjectRows) row.user_id = uid;
    if (subjectRows.length) await upsertRows(SUBJECTS_TABLE, subjectRows, OWNED_CONFLICT);

    // Tags: per-student, from the app's small default set.
    const tagRows = DEFAULT_TAGS.map((t) => {
      const id = `tag_${String(t.label).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      return toDbRow({ id, ...t, createdAt: now, userId: uid }, "tags");
    });
    if (tagRows.length) await upsertRows("tags", tagRows, OWNED_CONFLICT);

    await this._saveSettings({ seedVersion: SEED_VERSION });
    this.state.settings.seedVersion = SEED_VERSION;
  }

  /** Persist a settings patch to the user_settings table (JSON blob). No-op when unsigned. */
  async _saveSettings(patch) {
    const uid = currentUser()?.id;
    if (!uid) return;
    const row = {
      user_id: uid,
      settings_json: { ...(this.state.settings || {}), ...patch },
      updated_at: new Date().toISOString(),
    };
    try {
      await upsertRows("user_settings", [row], "user_id");
    } catch (err) {
      console.error("[store] _saveSettings FAILED:", err?.message ?? err);
      throw err;
    }
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) { try { fn(this); } catch (e) { console.error(e); } } }

  /** Re-fetch all study data from Supabase (called when a user signs in). */
  async reload() {
    const uid = currentUser()?.id;
    if (uid) {
      await this._loadCore();
      await this._loadCurriculum();
      await this._loadRecentActivity();
      // Signing in after boot (sign-up, or a restored session) must seed this
      // student's workspace too. init() only sees the signed-out state.
      if (!this.state.settings.seededAt) {
        await this._ensureSeed();
        await this._saveSettings({ seededAt: new Date().toISOString() });
        this.state.settings.seededAt = new Date().toISOString();
        await this._loadCore();
        await this._loadCurriculum();
        await this._loadRecentActivity();
      }
      this.recompute();
      this.emit();
    }
    return this;
  }

  recompute() {
    const today = todayISO();
    const s = this.state;
    const progress = computeProgress({
      subjects: s.subjects, chapters: s.chapters, nodes: s.nodes,
      revisions: s.revisions, sessions: s.sessions, notes: s.notes, today,
    });
    for (const ch of s.chapters) {
      const st = progress.chapters[ch.id];
      if (!st) continue;
      st.deadline = ch.deadline || null;
      st.deadlineStatus = !ch.deadline ? "none" : (diffDays(today, ch.deadline) < 0 ? "overdue" : diffDays(today, ch.deadline) <= (s.settings.dueWarnDays || 7) ? "soon" : "upcoming");
      st.daysLeft = ch.deadline ? diffDays(today, ch.deadline) : null;
      st.tags = ch.tags || [];
      st.name = ch.name;
      st.difficulty = ch.difficulty;
      st.priority = ch.priority;
      st.globalTier = ch.globalTier;
      st.estMin = ch.estMin;
    }
    const time = aggregateTime(s.sessions, { chapters: s.chapters, nodes: s.nodes, subjects: s.subjects, today });
    const recommendations = recommendNext({
      progress, chapters: s.chapters, nodes: s.nodes, planner: s.planner,
      sessions: s.sessions, notes: s.notes, today,
      availableMin: Number(s.settings.availableTodayMin) || 180,
    });
    const statusCounts = {};
    for (const ch of s.chapters) {
      const st = progress.chapters[ch.id]?.status || "To Do";
      statusCounts[st] = (statusCounts[st] || 0) + 1;
    }
    const gamification = this._computeGamification(today, progress);

    this.derived = {
      today, progress, time, recommendations, statusCounts, revisionDue: progress.revision.due,
      ...gamification,
    };
  }

  _computeGamification(today, progress = null) {
    const s = this.state;
    const dayActivity = buildDayActivity({ sessions: s.sessions, nodes: s.nodes, chapters: s.chapters, today });
    const streaks = computeStreaks(dayActivity, today);
    const points = totalPoints(s.points);
    const level = levelForPoints(points);
    const totalMinutes = s.sessions.reduce((acc, x) => acc + (Number(x.minutes) || 0), 0);
    const checklistItems = s.nodes.filter((n) => n.done).length + s.chapters.filter((c) => c.done).length;
    const doubtsResolved = s.notes.filter((n) => n.kind === "doubt" && n.doubtStatus === "resolved").length;

    const stats = {
      points, level: level.level, sessions: s.sessions.length, minutes: totalMinutes,
      currentStreak: streaks.current, longestStreak: streaks.longest, activeDays: streaks.activeDays,
      checklistItems, revisions: s.revisions.length, doubtsResolved,
    };
    const achievements = evaluateAchievements(stats);

    const weekly = dayActivity.slice(-7).map((d) => ({ day: d.day, minutes: d.studyMinutes, qualified: qualifiesForStreak(d) }));
    const strip = dayActivity.slice(-30).map((d) => heatmapLevel(d.studyMinutes));
    const studyMinutesToday = s.sessions.filter((x) => x.dateISO === today).reduce((a, x) => a + (Number(x.minutes) || 0), 0);

    const quests = buildQuests({
      today, dayActivity, points: s.points,
      dailyTargetMin: Number(s.settings.dailyTargetMin) || 0,
    });

    const shareFacts = (() => {
      const cards = summariseFlashcards(s.flashcardProgress);
      const practice = summariseQuestions(s.questionAttempts);
      const board = progress?.scopes?.board || { done: 0, leaves: 0 };
      const overallPct = board.leaves ? Math.round((board.done / board.leaves) * 100) : 0;
      const milestones = STREAK_MILESTONES.filter((m) => streaks.longest >= m);
      return {
        displayName: s.settings.displayName || "Student",
        streak: { current: streaks.current, longest: streaks.longest, qualifiedDays: streaks.qualifiedDays, activeDays: streaks.activeDays },
        totalMinutes, points, level: { level: level.level, title: level.title },
        weekly, strip, generatedOn: today, appName: brand(),
        sessions: s.sessions.length,
        flashcardsReviewed: cards.reviewed,
        flashcardReviews: cards.reviews,
        flashcardsMastered: cards.mastered,
        flashcardsDue: cards.due,
        flashcardAccuracy: cards.accuracy,
        questionsAttempted: practice.attempted,
        questionsCorrect: practice.correct,
        questionsIncorrect: practice.incorrect,
        practiceAccuracy: practice.accuracy,
        overallDone: board.done,
        overallLeaves: board.leaves,
        overallPct,
        milestones,
        achievements: achievements
          .filter((a) => a.reached)
          .slice(0, 3)
          .map((a) => ({ title: a.title, icon: a.icon })),
      };
    })();

    return {
      gamification: {
        points, level, stats, achievements,
        unlocked: achievements.filter((a) => a.reached).length,
        streak: streaks, dayActivity, weekly, strip,
        studyMinutesToday,
        quests,
        todayQualified: streaks.todayQualified,
        streakRule: `A day counts after ${STREAK_MIN_MINUTES}+ saved minutes or ${STREAK_MIN_ITEMS}+ items ticked.`,
        shareFacts,
      },
    };
  }

  /* ------------------------------------------------------- points ledger ---- */
  async _award(kind, points, label, day, refId = null) {
    if (!points || points <= 0) return null;
    const id = refId;
    if (this.state.points.some((p) => p.id === id)) return null;
    const uid = requireUid();
    const rec = { id, kind, points, label, day, refId: null, occurredAt: new Date().toISOString(), userId: uid };
    const dbRec = toDbRow(rec, "points");
    await insertRows("points", [dbRec]);
    this.state.points.push(rec);
    return rec;
  }

  _checklistAwardsToday(day) {
    return this.state.points.filter((p) => p.kind === "CHECKLIST_ITEM" && p.day === day).length;
  }

  async _awardChecklist(recId, day) {
    if (this.state.points.some((p) => p.id === itemDedupeKey(recId))) return null;
    if (remainingChecklistAwards(this._checklistAwardsToday(day)) <= 0) return null;
    return this._award("CHECKLIST_ITEM", POINTS.CHECKLIST_ITEM.points, POINTS.CHECKLIST_ITEM.label, day, itemDedupeKey(recId));
  }

  async _checkDailyGoal(day) {
    const target = Number(this.state.settings.dailyTargetMin) || 0;
    const minutes = this.state.sessions.filter((x) => x.dateISO === day).reduce((a, x) => a + (Number(x.minutes) || 0), 0);
    const already = this.state.points.some((p) => p.id === dailyGoalDedupeKey(day));
    if (!shouldAwardDailyGoal(minutes, target, already)) return null;
    return this._award("DAILY_GOAL", POINTS.DAILY_GOAL.points, POINTS.DAILY_GOAL.label, day, dailyGoalDedupeKey(day));
  }

  async _settle(day) {
    await this._checkDailyGoal(day);
    await this._checkQuests(day);
  }

  async _checkQuests(day) {
    const dayActivity = buildDayActivity({ sessions: this.state.sessions, nodes: this.state.nodes, chapters: this.state.chapters, today: day });
    const quests = buildQuests({
      today: day, dayActivity, points: this.state.points,
      dailyTargetMin: Number(this.state.settings.dailyTargetMin) || 0,
    });
    const minted = [];
    for (const quest of quests.all) {
      if (!quest.done || quest.earned) continue;
      const rec = await this._award("QUEST", quest.xp, `Quest: ${quest.title}`, day, questDedupeKey(quest));
      if (rec) minted.push(rec);
    }
    return minted;
  }

  async _write(fn) {
    const result = await fn();
    if (this._suppress) return result;
    this.recompute();
    this.emit();
    return result;
  }

  async batch(fn) {
    const wasSuppressed = this._suppress;
    this._suppress = true;
    try {
      return await fn();
    } finally {
      this._suppress = wasSuppressed;
      if (!wasSuppressed) { this.recompute(); this.emit(); }
    }
  }

  /* ------------------------------------------------------------ selectors -- */
  subject(id) { return this.state.subjects.find((s) => s.id === id) || null; }
  chapter(id) { return this.state.chapters.find((c) => c.id === id) || null; }
  node(id) { return this.state.nodes.find((n) => n.id === id) || null; }
  tag(id) { return this.state.tags.find((t) => t.id === id) || null; }
  tagByLabel(label) { return this.state.tags.find((t) => t.label.toLowerCase() === String(label).toLowerCase()) || null; }
  chapterNodes(chapterId) { return this.state.nodes.filter((n) => n.chapterId === chapterId).sort((a, b) => a.order - b.order); }
  childNodes(parentId) { return this.state.nodes.filter((n) => n.parentId === parentId).sort((a, b) => a.order - b.order); }
  subjectsSorted() { return [...this.state.subjects].sort((a, b) => a.order - b.order); }
  chaptersOf(subjectId) { return this.state.chapters.filter((c) => c.subjectId === subjectId).sort((a, b) => a.order - b.order); }
  nodesOf(chapterId) { return this.chapterNodes(chapterId); }
  sessionsOn(dateISO) { return this.state.sessions.filter((s) => s.dateISO === dateISO); }
  plannerOn(dateISO) { return this.state.planner.filter((p) => p.dateISO === dateISO).sort((a, b) => a.order - b.order); }
  chaptersByScope(scope) { return this.state.chapters.filter((c) => (c.scope || "board") === scope); }
  allDeadlines() {
    const out = [];
    for (const c of this.state.chapters) if (c.deadline) out.push({ type: "chapter", id: c.id, name: c.name, subjectId: c.subjectId, deadline: c.deadline, status: this.derived?.progress?.chapters?.[c.id]?.status });
    for (const n of this.state.nodes) if (n.deadline) out.push({ type: "node", id: n.id, name: n.name, subjectId: n.subjectId, chapterId: n.chapterId, deadline: n.deadline, status: n.status });
    return out.sort((a, b) => a.deadline.localeCompare(b.deadline));
  }
  progressOf(chapterId) { return this.derived?.progress?.chapters?.[chapterId] || null; }
  subjectProgress(subjectId) { return this.derived?.progress?.subjects?.find((s) => s.id === subjectId) || null; }
  label(rec) {
    if (!rec) return "—";
    if (rec.chapterId && rec.nodeId) {
      const ch = this.chapter(rec.chapterId), n = this.node(rec.nodeId);
      return `${ch?.name || "?"} › ${n?.name || "?"}`;
    }
    if (rec.chapterId) return this.chapter(rec.chapterId)?.name || "—";
    if (rec.subjectId) return this.subject(rec.subjectId)?.name || "—";
    return "—";
  }

  /* ------------------------------------------------------------ mutations -- */
  async addSubject(patch) {
    const name = requiredName(patch.name, "Subject name");
    if (!name.ok) throw new Error(name.error);
    const rec = {
      id: newId("sub"), name: name.value, code: patch.code || "", short: patch.short || name.value.slice(0, 12),
      color: patch.color || "#4f46e5", accent: patch.accent || "#a5b4fc",
      totalMarks: Number(patch.totalMarks) || 80, order: this.state.subjects.length,
      notes: patch.notes || "", tags: parseTags(patch.tags), deadline: patch.deadline || null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const uid = requireUid();
    const dbRec = toDbRow({ ...rec, userId: uid }, SUBJECTS_TABLE);
    await insertRows(SUBJECTS_TABLE, [dbRec]);
    return this._write(() => { this.state.subjects.push(rec); return rec; });
  }

  async updateSubject(id, patch) {
    const prev = this.subject(id);
    if (!prev) throw new Error("Subject not found.");
    if (patch.name !== undefined) {
      const n = requiredName(patch.name, "Subject name");
      if (!n.ok) throw new Error(n.error);
      patch = { ...patch, name: n.value };
    }
    if (patch.deadline !== undefined) {
      const d = dateOrNull(patch.deadline);
      if (!d.ok) throw new Error(d.error);
      patch = { ...patch, deadline: d.value };
    }
    const rec = { ...prev, ...patch, id, updatedAt: new Date().toISOString() };
    if (patch.tags !== undefined) rec.tags = parseTags(patch.tags, this.state.tags.map((t) => t.label));
    const uid = requireUid();
    const dbRec = toDbRow({ ...rec, userId: uid }, SUBJECTS_TABLE);
    await upsertRows(SUBJECTS_TABLE, [dbRec], OWNED_CONFLICT);
    return this._write(() => { this.state.subjects = this.state.subjects.map((s) => (s.id === id ? rec : s)); return rec; });
  }

  async deleteSubject(id, { cascade = true } = {}) {
    const chapters = this.chaptersOf(id).map((c) => c.id);
    if (cascade && chapters.length) await this._deleteChapters(chapters);
    const uid = requireUid();
    await deleteRows(SUBJECTS_TABLE, `id=eq.${encodeURIComponent(id)}`);
    return this._write(() => { this.state.subjects = this.state.subjects.filter((s) => s.id !== id); });
  }

  async addChapter(subjectId, patch) {
    if (!this.subject(subjectId)) throw new Error("Parent subject not found.");
    const name = requiredName(patch.name, "Chapter name");
    if (!name.ok) throw new Error(name.error);
    const rec = {
      id: newId("ch"), subjectId, name: name.value, unit: patch.unit || "",
      order: this.state.chapters.filter((c) => c.subjectId === subjectId).length,
      scope: inSet(patch.scope, ["board", "internal", "optional"], "board"),
      assessedLabel: patch.assessedLabel || "User added", ruleNote: patch.ruleNote || "",
      marksLabel: patch.marksLabel || "", difficulty: inSet(patch.difficulty, ["D1", "D2", "D3", "D4"], "D2"),
      priority: inSet(patch.priority, ["P1", "P2", "P3"], "P2"),
      globalTier: inSet(String(patch.globalTier), ["1", "2", "3"], "2"),
      tierLabel: patch.tierLabel || "", seedConfidence: 0, nextAction: patch.nextAction || "",
      done: false, status: "To Do", tags: [], deadline: patch.deadline || null, deadlineCustom: !!patch.deadline,
      estMin: patch.estMin ?? null, actualMin: 0, notes: patch.notes || "", doneAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const uid = requireUid();
    const dbRec = toDbRow({ ...rec, userId: uid }, "chapters");
    await insertRows("chapters", [dbRec]);
    return this._write(() => { this.state.chapters.push(rec); return rec; });
  }

  async updateChapter(id, patch) {
    const prev = this.chapter(id);
    if (!prev) throw new Error("Chapter not found.");
    let next = { ...patch };
    // Chapters are shared, admin-seeded syllabus rows and are never renamed.
    delete next.name;
    if (patch.deadline !== undefined) {
      const d = dateOrNull(patch.deadline);
      if (!d.ok) throw new Error(d.error);
      next.deadline = d.value;
      next.deadlineCustom = true;
    }
    if (patch.estMin !== undefined) {
      const m = minutesOrNull(patch.estMin);
      if (!m.ok) throw new Error(m.error);
      next.estMin = m.value;
    }
    if (patch.scope !== undefined) next.scope = inSet(patch.scope, ["board", "internal", "optional"], prev.scope);
    if (patch.status !== undefined) next = applyStatusRules(next, inSet(patch.status, STATUSES, prev.status));
    if (patch.tags !== undefined) next.tags = parseTags(patch.tags, this.state.tags.map((t) => t.label));
    const rec = { ...prev, ...next, id, updatedAt: new Date().toISOString() };
    if (!!rec.done !== !!prev.done) rec.doneAt = rec.done ? todayISO() : null;
    const uid = requireUid();

    // Phase 3: write only per-user overrides to user_chapter_state.
    // The canonical chapter data lives in the global curriculum_chapters table.
    const stateRow = {
      user_id: uid,
      chapter_id: id,
      done: rec.done,
      status: rec.status,
      tags: rec.tags || [],
      deadline: rec.deadline || null,
      deadline_custom: !!rec.deadlineCustom,
      est_min: rec.estMin || null,
      actual_min: Number(rec.actualMin) || 0,
      notes: rec.notes || null,
      done_at: rec.doneAt || null,
      updated_at: new Date().toISOString(),
    };
    try {
      await upsertRows("user_chapter_state", [stateRow], "user_id,chapter_id");
    } catch (err) {
      console.error("[store] updateChapter upsert failed:", err?.message ?? err);
      throw err;
    }

    return this._write(async () => {
      this.state.chapters = this.state.chapters.map((c) => (c.id === id ? rec : c));
      if (!prev.done && rec.done) { await this._awardChecklist(id, todayISO()); await this._checkQuests(todayISO()); }
      return rec;
    });
  }

  async toggleChapterDone(id) {
    const ch = this.chapter(id);
    if (!ch) throw new Error("Chapter not found.");
    const next = toggleDone(ch);
    return this.updateChapter(id, { done: next.done, status: next.status });
  }

  async _deleteChapters(chapterIds) {
    const ids = new Set(chapterIds);
    const nodeIds = this.state.nodes.filter((n) => ids.has(n.chapterId)).map((n) => n.id);
    const nodeSet = new Set(nodeIds);
    const uid = requireUid();
    // Delete nodes for these chapters
    if (nodeIds.length) await deleteRows("nodes", `id=in.(${nodeIds.map(id => `'${id}'`).join(",")})`);
    // Delete sessions for these chapters
    const sessionIds = this.state.sessions.filter((s) => ids.has(s.chapterId)).map((s) => s.id);
    if (sessionIds.length) await deleteRows("sessions", `id=in.(${sessionIds.map(id => `'${id}'`).join(",")})`);
    // Delete revisions targeting these chapters or their nodes
    const revIds = this.state.revisions.filter((r) => (r.targetType === "chapter" && ids.has(r.targetId)) || (r.targetType === "node" && nodeSet.has(r.targetId))).map((r) => r.id);
    if (revIds.length) await deleteRows("revisions", `id=in.(${revIds.map(id => `'${id}'`).join(",")})`);
    // Delete notes for these chapters
    const noteIds = this.state.notes.filter((n) => ids.has(n.chapterId)).map((n) => n.id);
    if (noteIds.length) await deleteRows("notes", `id=in.(${noteIds.map(id => `'${id}'`).join(",")})`);
    // Delete planner tasks for these chapters
    const plannerIds = this.state.planner.filter((p) => ids.has(p.chapterId)).map((p) => p.id);
    if (plannerIds.length) await deleteRows("planner", `id=in.(${plannerIds.map(id => `'${id}'`).join(",")})`);
    // Delete chapters
    if (ids.length) await deleteRows("chapters", `id=in.(${ids.map(id => `'${id}'`).join(",")})`);
    return this._write(() => {
      this.state.chapters = this.state.chapters.filter((c) => !ids.has(c.id));
      this.state.nodes = this.state.nodes.filter((n) => !nodeSet.has(n.id));
      this.state.sessions = this.state.sessions.filter((s) => !ids.has(s.chapterId));
      this.state.revisions = this.state.revisions.filter((r) => !((r.targetType === "chapter" && ids.has(r.targetId)) || (r.targetType === "node" && nodeSet.has(r.targetId))));
      this.state.notes = this.state.notes.filter((n) => !ids.has(n.chapterId));
      this.state.planner = this.state.planner.filter((p) => !ids.has(p.chapterId));
    });
  }

  async deleteChapter(id) { return this._deleteChapters([id]); }

  async addNode(chapterId, patch) {
    const ch = this.chapter(chapterId);
    if (!ch) throw new Error("Parent chapter not found.");
    const name = requiredName(patch.name, "Item name");
    if (!name.ok) throw new Error(name.error);
    const parentId = patch.parentId || null;
    if (parentId) {
      const parent = this.node(parentId);
      if (!parent || parent.chapterId !== chapterId) throw new Error("Parent topic not found in this chapter.");
    }
    const m = minutesOrNull(patch.estMin);
    if (!m.ok) throw new Error(m.error);
    const rec = {
      id: newId("nd"), chapterId, subjectId: ch.subjectId, parentId,
      kind: inSet(patch.kind, ["topic", "subtopic", "task"], "task"),
      name: name.value, order: this.state.nodes.filter((n) => n.chapterId === chapterId && n.parentId === parentId).length,
      done: false, status: "To Do", priority: inSet(patch.priority, ["P1", "P2", "P3"], ch.priority || "P2"),
      tags: parseTags(patch.tags, this.state.tags.map((t) => t.label)),
      estMin: m.value, actualMin: 0, deadline: patch.deadline || null, deadlineCustom: !!patch.deadline,
      notes: patch.notes || "", collapsed: false, doneAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const uid = requireUid();
    const dbRec = toDbRow({ ...rec, userId: uid }, "nodes");
    await insertRows("nodes", [dbRec]);
    return this._write(() => { this.state.nodes.push(rec); return rec; });
  }

  async updateNode(id, patch) {
    const prev = this.node(id);
    if (!prev) throw new Error("Item not found.");
    let next = { ...patch };
    if (patch.name !== undefined) {
      const n = requiredName(patch.name, "Item name");
      if (!n.ok) throw new Error(n.error);
      next.name = n.value;
    }
    if (patch.estMin !== undefined) {
      const m = minutesOrNull(patch.estMin);
      if (!m.ok) throw new Error(m.error);
      next.estMin = m.value;
    }
    if (patch.deadline !== undefined) {
      const d = dateOrNull(patch.deadline);
      if (!d.ok) throw new Error(d.error);
      next.deadline = d.value;
      next.deadlineCustom = true;
    }
    if (patch.status !== undefined) next = applyStatusRules(next, inSet(patch.status, STATUSES, prev.status));
    if (patch.tags !== undefined) next.tags = parseTags(patch.tags, this.state.tags.map((t) => t.label));
    const rec = { ...prev, ...next, id, updatedAt: new Date().toISOString() };
    if (!!rec.done !== !!prev.done) rec.doneAt = rec.done ? todayISO() : null;
    const uid = requireUid();

    // Phase 3: write per-user overrides to user_node_state.
    const stateRow = {
      user_id: uid,
      node_id: id,
      done: rec.done,
      status: rec.status,
      priority: rec.priority || "P2",
      tags: rec.tags || [],
      est_min: rec.estMin || null,
      actual_min: Number(rec.actualMin) || 0,
      deadline: rec.deadline || null,
      deadline_custom: !!rec.deadlineCustom,
      notes: rec.notes || null,
      collapsed: !!rec.collapsed,
      done_at: rec.doneAt || null,
      updated_at: new Date().toISOString(),
    };
    try {
      await upsertRows("user_node_state", [stateRow], "user_id,node_id");
    } catch (err) {
      console.error("[store] updateNode upsert failed:", err?.message ?? err);
      throw err;
    }

    return this._write(async () => {
      this.state.nodes = this.state.nodes.map((n) => (n.id === id ? rec : n));
      if (!prev.done && rec.done) { await this._awardChecklist(id, todayISO()); await this._checkQuests(todayISO()); }
      return rec;
    });
  }

  async toggleNodeDone(id) {
    const n = this.node(id);
    if (!n) throw new Error("Item not found.");
    const next = toggleDone(n);
    return this.updateNode(id, { done: next.done, status: next.status });
  }

  async deleteNode(id) {
    const node = this.node(id);
    if (!node) throw new Error("Item not found.");
    const descendants = [];
    const walk = (pid) => {
      for (const child of this.state.nodes.filter((n) => n.parentId === pid)) { descendants.push(child.id); walk(child.id); }
    };
    walk(id);
    const all = new Set([id, ...descendants]);
    const uid = requireUid();
    if (all.size) await deleteRows("nodes", `id=in.(${[...all].map(id => `'${id}'`).join(",")})`);
    const revIds = this.state.revisions.filter((r) => r.targetType === "node" && all.has(r.targetId)).map((r) => r.id);
    if (revIds.length) await deleteRows("revisions", `id=in.(${revIds.map(id => `'${id}'`).join(",")})`);
    const noteIds = this.state.notes.filter((n) => n.nodeId && all.has(n.nodeId)).map((n) => n.id);
    if (noteIds.length) await deleteRows("notes", `id=in.(${noteIds.map(id => `'${id}'`).join(",")})`);
    const plannerIds = this.state.planner.filter((p) => p.nodeId && all.has(p.nodeId)).map((p) => p.id);
    if (plannerIds.length) await deleteRows("planner", `id=in.(${plannerIds.map(id => `'${id}'`).join(",")})`);
    const sessionIds = this.state.sessions.filter((s) => s.nodeId && all.has(s.nodeId)).map((s) => s.id);
    if (sessionIds.length) await deleteRows("sessions", `id=in.(${sessionIds.map(id => `'${id}'`).join(",")})`);
    return this._write(() => {
      this.state.nodes = this.state.nodes.filter((n) => !all.has(n.id));
      this.state.revisions = this.state.revisions.filter((r) => !(r.targetType === "node" && all.has(r.targetId)));
      this.state.notes = this.state.notes.filter((n) => !(n.nodeId && all.has(n.nodeId)));
      this.state.planner = this.state.planner.filter((p) => !(p.nodeId && all.has(p.nodeId)));
      this.state.sessions = this.state.sessions.filter((s) => !(s.nodeId && all.has(s.nodeId)));
    });
  }

  async reorderNode(id, direction) {
    const n = this.node(id);
    if (!n) throw new Error("Item not found.");
    const siblings = this.state.nodes.filter((x) => x.chapterId === n.chapterId && x.parentId === n.parentId).sort((a, b) => a.order - b.order);
    const i = siblings.findIndex((s) => s.id === id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= siblings.length) return;
    const a = { ...siblings[i], order: siblings[j].order, updatedAt: new Date().toISOString() };
    const b = { ...siblings[j], order: siblings[i].order, updatedAt: new Date().toISOString() };
    const uid = requireUid();
    await upsertRows("nodes", [toDbRow({ ...a, userId: uid }, "nodes"), toDbRow({ ...b, userId: uid }, "nodes")], OWNED_CONFLICT);
    return this._write(() => {
      this.state.nodes = this.state.nodes.map((x) => (x.id === a.id ? a : x.id === b.id ? b : x));
    });
  }

  /* ------------------------------------------------------------- sessions -- */
  async logSession(patch) {
    const v = validateSession(patch);
    if (!v.ok) throw new Error(v.error);
    const chapter = patch.chapterId ? this.chapter(patch.chapterId) : null;
    const node = patch.nodeId ? this.node(patch.nodeId) : null;
    const rec = {
      id: newId("ses"), dateISO: patch.dateISO || todayISO(),
      startISO: patch.startISO || null, endISO: patch.endISO || null,
      minutes: v.value,
      subjectId: patch.subjectId || node?.subjectId || chapter?.subjectId || null,
      chapterId: patch.chapterId || node?.chapterId || null,
      nodeId: patch.nodeId || null,
      activity: inSet(patch.activity, ["learn", "practice", "revision", "doubt"], "learn"),
      notes: patch.notes || "", outcome: patch.outcome || "",
      source: patch.source || "manual",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const uid = requireUid();
    const dbRec = toDbRow({ ...rec, userId: uid }, "sessions");
    await insertRows("sessions", [dbRec]);
    return this._write(async () => {
      this.state.sessions.push(rec);
      const pts = pointsForSession(rec.minutes);
      if (pts) await this._award("STUDY_SESSION", pts, POINTS.STUDY_SESSION.label, rec.dateISO, sessionDedupeKey(rec.id));
      await this._settle(rec.dateISO);
      return rec;
    });
  }

  async updateSession(id, patch) {
    const prev = this.state.sessions.find((s) => s.id === id);
    if (!prev) throw new Error("Session not found.");
    if (patch.minutes !== undefined) {
      const m = minutesOrNull(patch.minutes);
      if (!m.ok || !m.value) throw new Error(m.ok ? "Duration must be greater than zero." : m.error);
      patch = { ...patch, minutes: m.value };
    }
    const rec = { ...prev, ...patch, id, updatedAt: new Date().toISOString() };
    const uid = requireUid();
    const dbRec = toDbRow({ ...rec, userId: uid }, "sessions");
    await upsertRows("sessions", [dbRec], OWNED_CONFLICT);
    return this._write(async () => {
      this.state.sessions = this.state.sessions.map((s) => (s.id === id ? rec : s));
      await this._settle(rec.dateISO);
      return rec;
    });
  }

  async deleteSession(id) {
    const uid = requireUid();
    await deleteRows("sessions", `id=eq.${encodeURIComponent(id)}`);
    return this._write(() => { this.state.sessions = this.state.sessions.filter((s) => s.id !== id); });
  }

  /* ------------------------------------------------------------ revisions -- */
  async addRevision({ chapterId, nodeId, pass = 1, dateISO, score = null, notes = "", activity = "revision" }) {
    let targetType = "chapter", targetId = chapterId;
    let subjectId = null;
    if (nodeId) {
      const node = this.node(nodeId);
      if (!node) throw new Error("Topic not found.");
      targetType = "node"; targetId = nodeId; subjectId = node.subjectId;
    } else {
      const ch = this.chapter(chapterId);
      if (!ch) throw new Error("Chapter not found.");
      subjectId = ch.subjectId;
    }
    const d = dateOrNull(dateISO || todayISO());
    if (!d.ok) throw new Error(d.error);
    const rec = {
      id: newId("rev"), targetType, targetId, chapterId: targetType === "node" ? this.node(targetId).chapterId : targetId,
      subjectId, pass: Math.max(1, Number(pass) || 1), dateISO: d.value,
      score: score === null || score === "" ? null : Math.max(0, Math.min(5, Number(score))),
      notes, activity,
      createdAt: new Date().toISOString(),
    };
    const uid = requireUid();
    const dbRec = toDbRow({ ...rec, userId: uid }, "revisions");
    await insertRows("revisions", [dbRec]);
    const patch = { status: rec.pass >= 2 ? "Second Revision" : "Revise" };
    await this._write(async () => {
      this.state.revisions.push(rec);
      await this._award("REVISION_PASS", POINTS.REVISION_PASS.points, POINTS.REVISION_PASS.label, rec.dateISO, revisionDedupeKey(targetId, rec.pass));
      await this._checkQuests(rec.dateISO);
    });
    if (targetType === "node") await this.updateNode(targetId, patch);
    else await this.updateChapter(targetId, patch);
    return rec;
  }

  async deleteRevision(id) {
    const r = this.state.revisions.find((x) => x.id === id);
    if (!r) return;
    const uid = requireUid();
    await deleteRows("revisions", `id=eq.${encodeURIComponent(id)}`);
    return this._write(() => { this.state.revisions = this.state.revisions.filter((x) => x.id !== id); });
  }

  /* ---------------------------------------------------------------- notes -- */
  async addNote(patch) {
    const text = String(patch.text ?? "").trim();
    if (!text) throw new Error("A note cannot be empty.");
    const chapterId = patch.chapterId || (patch.nodeId ? this.node(patch.nodeId)?.chapterId : null) || null;
    const rec = {
      id: newId("nt"), subjectId: patch.subjectId || (chapterId ? this.chapter(chapterId)?.subjectId : null) || null,
      chapterId, nodeId: patch.nodeId || null,
      kind: inSet(patch.kind, ["note", "doubt", "formula", "reminder"], "note"),
      text, pinned: !!patch.pinned,
      doubtStatus: patch.kind === "doubt" ? inSet(patch.doubtStatus, ["unresolved", "inprogress", "resolved"], "unresolved") : null,
      sessionId: patch.sessionId || null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const uid = requireUid();
    const dbRec = toDbRow({ ...rec, userId: uid }, "notes");
    await insertRows("notes", [dbRec]);
    return this._write(() => { this.state.notes.push(rec); return rec; });
  }

  async updateNote(id, patch) {
    const prev = this.state.notes.find((n) => n.id === id);
    if (!prev) throw new Error("Note not found.");
    if (patch.text !== undefined && !String(patch.text).trim()) throw new Error("A note cannot be empty.");
    const rec = { ...prev, ...patch, id, updatedAt: new Date().toISOString() };
    if (rec.kind !== "doubt") rec.doubtStatus = null;
    const justResolved = rec.kind === "doubt" && rec.doubtStatus === "resolved" && prev.doubtStatus !== "resolved";
    const uid = requireUid();
    const dbRec = toDbRow({ ...rec, userId: uid }, "notes");
    await upsertRows("notes", [dbRec], OWNED_CONFLICT);
    return this._write(async () => {
      this.state.notes = this.state.notes.map((n) => (n.id === id ? rec : n));
      if (justResolved) { await this._award("DOUBT_RESOLVED", POINTS.DOUBT_RESOLVED.points, POINTS.DOUBT_RESOLVED.label, todayISO(), doubtDedupeKey(id)); await this._checkQuests(todayISO()); }
      return rec;
    });
  }

  async deleteNote(id) {
    const uid = requireUid();
    await deleteRows("notes", `id=eq.${encodeURIComponent(id)}`);
    return this._write(() => { this.state.notes = this.state.notes.filter((n) => n.id !== id); });
  }

  /* -------------------------------------------------------------- planner -- */
  async addPlannedTask(patch) {
    const title = String(patch.title ?? "").trim();
    if (!title) throw new Error("Give the task a name.");
    const d = dateOrNull(patch.dateISO || todayISO());
    if (!d.ok) throw new Error(d.error);
    const m = minutesOrNull(patch.estMin ?? 30);
    if (!m.ok) throw new Error(m.error);
    const rec = {
      id: newId("pl"), dateISO: d.value, title,
      subjectId: patch.subjectId || null, chapterId: patch.chapterId || null, nodeId: patch.nodeId || null,
      task: patch.task || "", target: patch.target || "",
      estMin: m.value || 0, priority: inSet(patch.priority, ["P1", "P2", "P3"], "P2"),
      done: false, order: this.plannerOn(d.value).length, movedFrom: patch.movedFrom || null,
      day: patch.day ?? null, slot: patch.slot ?? null,
      createdAt: new Date().toISOString(),
    };
    const uid = requireUid();
    const dbRec = toDbRow({ ...rec, userId: uid }, "planner");
    await insertRows("planner", [dbRec]);
    return this._write(() => { this.state.planner.push(rec); return rec; });
  }

  async updatePlannedTask(id, patch) {
    const prev = this.state.planner.find((p) => p.id === id);
    if (!prev) throw new Error("Task not found.");
    let next = { ...patch };
    if (patch.dateISO !== undefined) {
      const d = dateOrNull(patch.dateISO);
      if (!d.ok) throw new Error(d.error);
      next.dateISO = d.value;
      if (d.value !== prev.dateISO && !patch.movedFrom) next.movedFrom = prev.dateISO;
      next.order = this.plannerOn(d.value).length;
    }
    if (patch.estMin !== undefined) {
      const m = minutesOrNull(patch.estMin);
      if (!m.ok) throw new Error(m.error);
      next.estMin = m.value || 0;
    }
    const rec = { ...prev, ...next, id };
    const uid = requireUid();
    const dbRec = toDbRow({ ...rec, userId: uid }, "planner");
    await upsertRows("planner", [dbRec], OWNED_CONFLICT);
    return this._write(() => { this.state.planner = this.state.planner.map((p) => (p.id === id ? rec : p)); return rec; });
  }

  async togglePlannedTask(id) {
    const p = this.state.planner.find((x) => x.id === id);
    if (!p) throw new Error("Task not found.");
    return this.updatePlannedTask(id, { done: !p.done });
  }

  async movePlannedTask(id, newDate) {
    const d = dateOrNull(newDate);
    if (!d.ok) throw new Error(d.error);
    return this.updatePlannedTask(id, { dateISO: d.value });
  }

  async deletePlannedTask(id) {
    const uid = requireUid();
    await deleteRows("planner", `id=eq.${encodeURIComponent(id)}`);
    return this._write(() => { this.state.planner = this.state.planner.filter((p) => p.id !== id); });
  }

  /** The shared 60-day plan template, fetched from Supabase once and cached. */
  async _planTemplate() {
    if (this._planCache) return this._planCache;
    const rows = await selectRows("plan_template", "select=*&order=sort_order.asc");
    this._planCache = (rows || []).map((r) => ({
      day: r.day,
      weekday: r.weekday,
      slot: r.slot,
      minutes: r.minutes,
      subject: r.subject,
      topic: r.topic,
      task: r.task,
      target: r.target,
    }));
    return this._planCache;
  }

  /** Load the 60-day plan template, Day 1 = startDate. */
  async loadPlanTemplate(startDate, { replace = false } = {}) {
    const d = dateOrNull(startDate);
    if (!d.ok) throw new Error(d.error);
    const { entries, matched, unmatched } = buildPlanEntries({
      template: await this._planTemplate(), subjects: this.state.subjects, chapters: this.state.chapters, startDate: d.value,
    });
    if (replace) {
      const uid = requireUid();
      await deleteRows("planner", `user_id=eq.${encodeURIComponent(uid)}`);
      this.state.planner = [];
    }
    const uid = requireUid();
    const dbEntries = entries.map((e) => toDbRow({ ...e, userId: uid }, "planner"));
    if (dbEntries.length) await insertRows("planner", dbEntries);
    await this._saveSettings({ planLoadedFor: d.value });
    return this._write(() => {
      this.state.planner.push(...entries);
      this.state.settings.planLoadedFor = d.value;
      return { added: entries.length, matched, unmatched, startDate: d.value };
    });
  }

  /* ----------------------------------------------------------------- tags -- */
  async addTag(patch) {
    const label = requiredName(patch.label, "Tag label");
    if (!label.ok) throw new Error(label.error);
    if (this.tagByLabel(label.value)) throw new Error("That tag already exists.");
    const rec = {
      id: newId("tag"), label: label.value, kind: inSet(patch.kind, ["status", "custom"], "custom"),
      color: patch.color || "#64748b", order: this.state.tags.length, createdAt: new Date().toISOString(),
    };
    const uid = requireUid();
    const dbRec = toDbRow({ ...rec, userId: uid }, "tags");
    await insertRows("tags", [dbRec]);
    return this._write(() => { this.state.tags.push(rec); return rec; });
  }

  async updateTag(id, patch) {
    const prev = this.tag(id);
    if (!prev) throw new Error("Tag not found.");
    const rec = { ...prev, ...patch, id };
    if (patch.label !== undefined) {
      const l = requiredName(patch.label, "Tag label");
      if (!l.ok) throw new Error(l.error);
      const dup = this.tagByLabel(l.value);
      if (dup && dup.id !== id) throw new Error("That tag already exists.");
      const oldLabel = prev.label;
      rec.label = l.value;
      await this._renameTagOnRecords(oldLabel, l.value);
    }
    const uid = requireUid();
    const dbRec = toDbRow({ ...rec, userId: uid }, "tags");
    await upsertRows("tags", [dbRec], OWNED_CONFLICT);
    return this._write(() => { this.state.tags = this.state.tags.map((t) => (t.id === id ? rec : t)); });
  }

  async _renameTagOnRecords(oldLabel, newLabel) {
    const changedCh = [], changedNd = [], changedSub = [];
    for (const c of this.state.chapters) if ((c.tags || []).includes(oldLabel)) changedCh.push({ ...c, tags: c.tags.map((t) => (t === oldLabel ? newLabel : t)) });
    for (const n of this.state.nodes) if ((n.tags || []).includes(oldLabel)) changedNd.push({ ...n, tags: n.tags.map((t) => (t === oldLabel ? newLabel : t)) });
    for (const s of this.state.subjects) if ((s.tags || []).includes(oldLabel)) changedSub.push({ ...s, tags: s.tags.map((t) => (t === oldLabel ? newLabel : t)) });
    const uid = requireUid();
    if (changedCh.length) await upsertRows("chapters", changedCh.map((c) => toDbRow({ ...c, userId: uid }, "chapters")), OWNED_CONFLICT);
    if (changedNd.length) await upsertRows("nodes", changedNd.map((n) => toDbRow({ ...n, userId: uid }, "nodes")), OWNED_CONFLICT);
    if (changedSub.length) await upsertRows(SUBJECTS_TABLE, changedSub.map((s) => toDbRow({ ...s, userId: uid }, SUBJECTS_TABLE)), OWNED_CONFLICT);
    this.state.chapters = this.state.chapters.map((c) => changedCh.find((x) => x.id === c.id) || c);
    this.state.nodes = this.state.nodes.map((n) => changedNd.find((x) => x.id === n.id) || n);
    this.state.subjects = this.state.subjects.map((s) => changedSub.find((x) => x.id === s.id) || s);
  }

  async deleteTag(id) {
    const tag = this.tag(id);
    if (!tag) return;
    const strip = (rec) => ({ ...rec, tags: (rec.tags || []).filter((t) => t !== tag.label) });
    const ch = this.state.chapters.filter((c) => (c.tags || []).includes(tag.label)).map(strip);
    const nd = this.state.nodes.filter((n) => (n.tags || []).includes(tag.label)).map(strip);
    const uid = requireUid();
    if (ch.length) await upsertRows("chapters", ch.map((c) => toDbRow({ ...c, userId: uid }, "chapters")), OWNED_CONFLICT);
    if (nd.length) await upsertRows("nodes", nd.map((n) => toDbRow({ ...n, userId: uid }, "nodes")), OWNED_CONFLICT);
    await deleteRows("tags", `id=eq.${encodeURIComponent(id)}`);
    return this._write(() => {
      this.state.tags = this.state.tags.filter((t) => t.id !== id);
      this.state.chapters = this.state.chapters.map((c) => ch.find((x) => x.id === c.id) || c);
      this.state.nodes = this.state.nodes.map((n) => nd.find((x) => x.id === n.id) || n);
    });
  }

  /* ------------------------------------------------------------ settings --- */
  async setSettings(patch) {
    const clean = { ...patch };
    if (patch.dailyTargetMin !== undefined) {
      const m = minutesOrNull(patch.dailyTargetMin, { max: 1440 });
      if (!m.ok) throw new Error(m.error);
      clean.dailyTargetMin = m.value ?? 0;
    }
    if (patch.availableTodayMin !== undefined) {
      const m = minutesOrNull(patch.availableTodayMin, { max: 1440 });
      if (!m.ok) throw new Error(m.error);
      clean.availableTodayMin = m.value ?? 0;
    }
    if (patch.targetDate !== undefined) {
      const d = dateOrNull(patch.targetDate);
      if (!d.ok) throw new Error(d.error);
      clean.targetDate = d.value;
    }
    await this._saveSettings(clean);
    return this._write(() => { this.state.settings = { ...this.state.settings, ...clean }; });
  }

  /* ------------------------------------------------------------- profile ---- */
  async setProfile(patch) {
    const clean = {};
    if (patch.displayName !== undefined) {
      const name = String(patch.displayName).trim().slice(0, 40);
      clean.displayName = name || "Student";
    }
    if (patch.avatar !== undefined) clean.avatar = String(patch.avatar).slice(0, 4) || "🦉";
    if (patch.shareTheme !== undefined) clean.shareTheme = String(patch.shareTheme);
    if (patch.shareFormat !== undefined) clean.shareFormat = String(patch.shareFormat);
    if (patch.onboarded !== undefined) clean.onboarded = !!patch.onboarded;
    if (patch.shareSlug === null) clean.shareSlug = null;
    else if (patch.shareSlug !== undefined) clean.shareSlug = String(patch.shareSlug).replace(/[^a-z0-9-]/gi, "").slice(0, 32) || null;
    await this._saveSettings(clean);
    return this._write(() => { this.state.settings = { ...this.state.settings, ...clean }; return this.state.settings; });
  }

  /** A stable, human-readable public share slug, generated once and kept. */
  ensureShareSlug() {
    if (this.state.settings.shareSlug) return this.state.settings.shareSlug;
    const base = (this.state.settings.displayName || "student").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 12) || "student";
    const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    this.state.settings.shareSlug = slug;
    void this._saveSettings({ shareSlug: slug });
    return slug;
  }

  /* --------------------------------------------------- roadmap excitement ---- */
  async setExcitementVote(choice, note = "") {
    const clean = { excitementVote: choice || null, excitementNote: String(note || "").slice(0, 280) };
    await this._saveSettings(clean);
    return this._write(() => { this.state.settings = { ...this.state.settings, ...clean }; return clean; });
  }

  /** Default deadlines derived from the target date and the plan, only where unset. */
  async ensureDefaultDeadlines({ silent = false } = {}) {
    const uid = currentUser()?.id;
    if (!uid) return { assigned: 0 };
    const target = this.state.settings?.targetDate;
    if (!target) return { assigned: 0 };
    const planByChapter = new Map();
    for (const p of await this._planTemplate()) {
      if (!planByChapter.has(p.topic)) planByChapter.set(p.topic, p.day);
    }
    const start = this.state.settings?.planStartDate || todayISO();
    const updates = [];
    for (const c of this.state.chapters) {
      if (c.deadline || c.deadlineCustom) continue;
      let iso = null;
      const day = planByChapter.get(c.name);
      if (day) iso = addDays(start, day - 1);
      else iso = addDays(target, -14);
      if (iso) {
        const { chapterId, ...cleanC } = c;
        updates.push({ ...cleanC, deadline: iso, deadlineCustom: false, updatedAt: new Date().toISOString() });
      }
    }
    if (!updates.length) return { assigned: 0 };
    await upsertRows("chapters", updates.map((c) => toDbRow({ ...c, userId: uid }, "chapters")), OWNED_CONFLICT);
    if (!silent) await this._write(() => {
      this.state.chapters = this.state.chapters.map((c) => updates.find((u) => u.id === c.id) || c);
    });
    else this.state.chapters = this.state.chapters.map((c) => updates.find((u) => u.id === c.id) || c);
    return { assigned: updates.length };
  }

  async clearDefaultDeadlines() {
    const uid = currentUser()?.id;
    if (!uid) return { cleared: 0 };
    const updates = this.state.chapters.filter((c) => c.deadline && !c.deadlineCustom).map((c) => {
      const { chapterId, ...cleanC } = c;
      return { ...cleanC, deadline: null };
    });
    if (!updates.length) return { cleared: 0 };
    await upsertRows("chapters", updates.map((c) => toDbRow({ ...c, userId: uid }, "chapters")), OWNED_CONFLICT);
    return this._write(() => {
      this.state.chapters = this.state.chapters.map((c) => updates.find((u) => u.id === c.id) || c);
      return { cleared: updates.length };
    });
  }

  /* ----------------------------------------------------------------- timer -- */
  timerElapsedMs(timer = this.state.settings.timer) {
    if (!timer) return 0;
    const base = Number(timer.accumulatedMs) || 0;
    if (timer.running && !timer.paused && timer.startedAt) {
      return base + Math.max(0, Date.now() - new Date(timer.startedAt).getTime());
    }
    return base;
  }

  async startTimer(patch = {}) {
    const t = this.state.settings.timer || {};
    const timer = {
      ...DEFAULT_SETTINGS.timer, ...t, ...patch,
      running: true, paused: false, startedAt: new Date().toISOString(), accumulatedMs: 0,
    };
    await this.setSettings({ timer });
    return timer;
  }

  async pauseTimer() {
    const t = this.state.settings.timer;
    if (!t?.running || t.paused) return t;
    const timer = { ...t, paused: true, accumulatedMs: this.timerElapsedMs(t), startedAt: null };
    await this.setSettings({ timer });
    return timer;
  }

  async resumeTimer() {
    const t = this.state.settings.timer;
    if (!t?.running || !t.paused) return t;
    const timer = { ...t, paused: false, startedAt: new Date().toISOString() };
    await this.setSettings({ timer });
    return timer;
  }

  async stopTimer({ save = true, roundTo = 1 } = {}) {
    const t = this.state.settings.timer;
    if (!t?.running) return null;
    const ms = this.timerElapsedMs(t);
    let minutes = Math.round(ms / 60000);
    if (roundTo > 1) minutes = Math.max(roundTo, Math.round(minutes / roundTo) * roundTo);
    const clamped = clampSessionMinutes(minutes, { warnOver: 6 * 60, max: 12 * 60 });
    let session = null;
    if (save && clamped.value > 0) {
      session = await this.logSession({
        minutes: clamped.value, source: "timer",
        subjectId: t.subjectId, chapterId: t.chapterId, nodeId: t.nodeId,
        activity: t.activity, notes: t.note,
        startISO: t.startedAt || null, endISO: new Date().toISOString(),
      });
    }
    await this.setSettings({ timer: { ...DEFAULT_SETTINGS.timer } });
    return { session, minutes: clamped.value, warning: clamped.warning || null, discarded: !save };
  }

  async discardTimer() {
    await this.setSettings({ timer: { ...DEFAULT_SETTINGS.timer } });
  }

  /* ------------------------------------------------------- export / import -- */
  exportBundle() { return exportBundle(this.state); }

  async importBundle(bundle, { mode = "replace" } = {}) {
    const v = validateBundle(bundle);
    if (!v.ok) {
      const err = new Error(`Import failed: ${v.errors[0]}${v.totalErrors > 1 ? ` (+${v.totalErrors - 1} more)` : ""}`);
      err.errors = v.errors;
      throw err;
    }
    const map = bundleToStoreMap(bundle);
    const uid = requireUid();
    const DATA_TABLES = ["subjects", "chapters", "nodes", "sessions", "revisions", "notes", "planner", "tags", "points"];
    if (mode === "replace") {
      // Clear all user data first
      for (const t of DATA_TABLES) await deleteRows(dbTable(t), `user_id=eq.${encodeURIComponent(uid)}`);
      // Also reset settings
      await deleteRows("user_settings", `user_id=eq.${encodeURIComponent(uid)}`);
      // Then insert all data tables
      for (const [table, rows] of Object.entries(map)) {
        if (!DATA_TABLES.includes(table)) continue;
        const rowsArray = Array.isArray(rows) ? rows : [];
        if (rowsArray.length) {
          const dbRows = rowsArray.map((r) => toDbRow({ ...r, userId: uid }, table));
          await insertRows(dbTable(table), dbRows);
        }
      }
      // Restore settings from bundle
      if (map.settings) await this._saveSettings(map.settings);
    } else {
      // Merge mode: upsert all rows
      for (const [table, rows] of Object.entries(map)) {
        if (!DATA_TABLES.includes(table)) continue;
        const rowsArray = Array.isArray(rows) ? rows : [];
        if (rowsArray.length) {
          const dbRows = rowsArray.map((r) => toDbRow({ ...r, userId: uid }, table));
          await upsertRows(dbTable(table), dbRows, OWNED_CONFLICT);
        }
      }
      // Merge settings
      if (map.settings) await this._saveSettings(map.settings);
    }
    // Reload from Supabase
    requireUid();
    const [subjects, chapters, nodes, sessions, revisions, notes, planner, tags, points] = await Promise.all([
      selectRows(SUBJECTS_TABLE, "order=sort_order.asc"),
      selectRows("chapters", "order=order.asc"),
      selectRows("nodes", "order=order.asc"),
      selectRows("sessions", "order=date_iso.asc"),
      selectRows("revisions", "order=date_iso.asc"),
      selectRows("notes", "order=created_at.asc"),
      selectRows("planner", "order=date_iso.asc,order.asc"),
      selectRows("tags", "order=order.asc"),
      selectRows("points", "order=occurred_at.asc"),
    ]);
    this.state.subjects = (subjects || []).map(toAppRow);
    this.state.chapters = (chapters || []).map(toAppRow);
    this.state.nodes = (nodes || []).map(toAppRow);
    this.state.sessions = (sessions || []).map(toAppRow);
    this.state.revisions = (revisions || []).map(toAppRow);
    this.state.notes = (notes || []).map(toAppRow);
    this.state.planner = (planner || []).map(toAppRow);
    this.state.tags = (tags || []).map(toAppRow);
    this.state.points = (points || []).map(toAppRow);
    const settingsRows = await selectRows("user_settings", "limit=1");
    const settingsRow = Array.isArray(settingsRows) && settingsRows.length ? settingsRows[0] : null;
    this.state.settings = { ...DEFAULT_SETTINGS, ...(settingsRow?.settings_json || {}) };
    this.state.settings.timer = { ...DEFAULT_SETTINGS.timer, ...(this.state.settings.timer || {}) };
    return this._write(() => ({ counts: Object.fromEntries(Object.entries(map).map(([k, val]) => [k, Array.isArray(val) ? val.length : Object.keys(val || {}).length])) }));
  }

  /**
   * Delete everything this student owns and re-seed their workspace.
   *
   * The syllabus is *shared*: it lives in `curriculum_chapters` /
   * `curriculum_nodes` and belongs to every student, so a reset must never
   * touch those tables. What belongs to the student — and what a reset has to
   * clear — is their study data (`sessions`, `revisions`, `notes`, `planner`,
   * `points`) and their per-student progress rows (`user_chapter_state`,
   * `user_node_state`, where the ticks live). The abandoned per-student
   * `chapters` / `nodes` tables are cleared too so no orphan rows are left.
   */
  async resetAll({ keepSettings = false } = {}) {
    const settings = keepSettings ? this.state.settings : null;
    const uid = requireUid();
    const owned = [
      "sessions", "revisions", "notes", "planner", "points",
      "user_chapter_state", "user_node_state",
      "chapters", "nodes",
    ];
    for (const t of owned) await deleteRows(t, `user_id=eq.${encodeURIComponent(uid)}`);
    await this._ensureSeed();
    await this._saveSettings({ ...DEFAULT_SETTINGS, seededAt: new Date().toISOString(), planStartDate: todayISO(), ...(settings && keepSettings ? { dailyTargetMin: settings.dailyTargetMin, targetDate: settings.targetDate, theme: settings.theme } : {}) });
    // The local curriculum cache holds the *merged* chapters (shared syllabus
    // plus this student's ticks). The state rows are gone now, so the cache
    // would keep resurrecting the old ticks — drop it before reloading.
    clearCurriculumCache(uid);
    await this._loadCore();
    await this._loadCurriculum();
    await this._loadRecentActivity();
    this.recompute();
    return this._write(() => ({ ok: true }));
  }

  /** Delete only study data, keep syllabus. */
  async clearStudyData() {
    const uid = requireUid();
    const stores = ["sessions", "revisions", "notes", "planner", "points"];
    for (const s of stores) await deleteRows(s, `user_id=eq.${encodeURIComponent(uid)}`);
    // The ticks live in the per-student state tables (`user_chapter_state` /
    // `user_node_state`), not in the abandoned per-student chapter tables.
    // Clear the tick columns but keep the student's own deadlines, tags and
    // notes, which are not ticks.
    await this._clearTicks(uid);
    await this._loadCurriculum();
    await this._loadRecentActivity();
    this.recompute();
    return this._write(() => ({ ok: true }));
  }

  /** Un-tick every chapter and item, keeping deadlines, tags and notes. */
  async _clearTicks(uid) {
    const at = new Date().toISOString();
    const [chapterState, nodeState] = await Promise.all([
      selectRows("user_chapter_state", `user_id=eq.${encodeURIComponent(uid)}`),
      selectRows("user_node_state", `user_id=eq.${encodeURIComponent(uid)}`),
    ]);
    const untick = (r) => ({ ...r, done: false, status: "To Do", actual_min: 0, done_at: null, updated_at: at });
    if (chapterState.length) await upsertRows("user_chapter_state", chapterState.map(untick), "user_id,chapter_id");
    if (nodeState.length) await upsertRows("user_node_state", nodeState.map(untick), "user_id,node_id");
  }

  get schemaVersion() { return SCHEMA_VERSION; }
}

export const store = new Store();
export { buildNodeIndex };
