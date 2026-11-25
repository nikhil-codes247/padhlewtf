/**
 * settings.js — the default shape of the per-student settings blob.
 *
 * Study data and settings live in Supabase (`user_settings.settings_json`).
 * This module only defines the defaults used when a student has no saved row
 * yet and when a new workspace is seeded.
 */

export const DEFAULT_SETTINGS = {
  targetDate: null,
  planStartDate: null,
  dailyTargetMin: 230,
  availableTodayMin: 180,
  dueWarnDays: 7,
  studyDays: [1, 2, 3, 4, 5, 6],
  theme: "light",
  reduceMotion: false,
  seedVersion: null,
  seededAt: null,
  lastBackupAt: null,
  planLoadedFor: null,
  /* Profile & gamification. */
  displayName: "Student",
  avatar: "🦉",
  shareSlug: null,
  shareTheme: "minimal",
  shareFormat: "post",
  onboarded: false,
  /* Subject choice lives in Supabase (profile_subjects), not here. */
  excitementVote: null,
  excitementNote: "",
  /* Android-only reminders. Harmless in a browser (they are simply ignored);
     the Settings card that edits them only appears inside the app. */
  reminderEnabled: false,
  reminderTime: "19:30",
  notifyTimerEnd: true,
  timer: {
    running: false, paused: false, startedAt: null, accumulatedMs: 0,
    subjectId: null, chapterId: null, nodeId: null, activity: "learn", note: "",
  },
};
