/**
 * profile.js — profile, streaks, points, achievements and the share-card studio.
 *
 * Every number is derived from stored records (see store._computeGamification):
 * nothing here is a placeholder, and a broken record self-heals the badge on the
 * next recompute. The share studio can only draw the whitelisted facts in
 * core/shareCard.js.
 *
 * Layout intent: identity → headline stats → streak spotlight → history →
 * achievements → quests → rewards → share studio. The card always wears the
 * Looseleaf design, the same one the app ships.
 */
import { esc, fmtNum } from "../dom.js?v=mwz23oco";
import { bar, chip, emptyState, metricCard, questBoard, sectionCard } from "../components.js?v=mwz23oco";
import { fmtDuration } from "../../core/dates.js?v=mwz23oco";
import { POINT_RULES_TEXT } from "../../core/gamification.js?v=mwz23oco";
import { HEATMAP_BUCKETS, STREAK_MILESTONES } from "../../core/constants.js?v=mwz23oco";
import { buildShareCard, shareCardKinds, SHARE_CARD_KIND_LABEL } from "../../core/shareCard.js?v=mwz23oco";
import { SHARE_THEME_SPECS, SHARE_FORMATS, SHARE_FORMAT_SPECS } from "../../core/shareThemes.js?v=mwz23oco";
import { drawCard, shareIntents } from "../shareRender.js?v=mwz23oco";

const TONE_CLASS = { info: "info", ok: "ok", accent: "acc", bad: "bad", warn: "warn" };

const WEEKDAY = (iso) => {
  try {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en", { weekday: "short", timeZone: "UTC" });
  } catch {
    return "";
  }
};

/* --------------------------------------------------------------- heatmap --- */
function heatmap(dayActivity, today) {
  const byDay = new Map(dayActivity.map((d) => [d.day, d]));
  const iso = (dt) => dt.toISOString().slice(0, 10);
  const end = new Date(today + "T00:00:00Z");
  const monday = (d) => { const x = new Date(d); const wd = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - wd); return x; };
  const start = monday(new Date(end.getTime() - 52 * 7 * 86400000));
  const weeks = [];
  for (let w = 0; w < 53; w++) {
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(start.getTime() + (w * 7 + d) * 86400000);
      const day = iso(cur);
      if (day > today) { cells.push(null); continue; }
      const rec = byDay.get(day);
      const minutes = rec ? rec.studyMinutes : 0;
      const level = minutes <= 0 ? 0 : minutes < 20 ? 1 : minutes < 60 ? 2 : minutes < 120 ? 3 : 4;
      cells.push({ day, minutes, level });
    }
    const first = new Date(start.getTime() + w * 7 * 86400000);
    weeks.push({ label: first.getUTCDate() <= 7 ? first.toLocaleString("en", { month: "short", timeZone: "UTC" }) : "", cells });
  }
  return weeks;
}

export default {
  id: "profile",
  title: "Profile & Streaks",
  render(ctx) {
    const { store, today, ui } = ctx;
    const g = store.derived.gamification;
    const s = store.state.settings;
    const level = g.level;
    const streak = g.streak;
    const week = (g.dayActivity || []).slice(-7);

    /* ------------------------------------------------------------- hero ---- */
    const hero = `<section class="card profile-hero">
      <div class="profile-hero-main">
        <span class="tile-mark big profile-avatar" aria-hidden="true">${esc(s.avatar || "🦉")}</span>
        <div class="grow" style="min-width:0">
          <div class="eyebrow">Student profile</div>
          <h1>${esc(s.displayName || "Student")}</h1>
          <div class="row wrap gap-2 mt-2">
            ${chip(`Level ${level.level}`, "acc")}
            ${chip(level.title, "soft")}
            ${streak.current > 0 ? chip(`🔥 ${streak.current}-day streak`, "warn") : chip("no current streak", "plain")}
            ${g.unlocked ? chip(`${fmtNum(g.unlocked)} achievements`, "ok") : ""}
          </div>
        </div>
      </div>
      <div class="profile-hero-side">
        <div class="row between small"><span class="strong">${fmtNum(g.points)} XP</span><span class="faint">${fmtNum(level.intoLevel)} / ${fmtNum(level.needed)} to level ${level.level + 1}</span></div>
        <div class="mt-2">${bar((level.intoLevel / level.needed) * 100, { cls: "acc" })}</div>
        <div class="row wrap gap-2 mt-3">
          <button class="btn sm" data-act="profile-edit">Edit profile</button>
          <a class="btn sm ghost" href="#/analytics">Open analytics</a>
        </div>
      </div>
    </section>`;

    /* ----------------------------------------------------------- metrics --- */
    const stats = `<div class="metrics">
      ${metricCard({ k: "Current streak", v: `${fmtNum(streak.current)}<span class="faint" style="font-size:var(--fs-lg)">d</span>`, s: `${fmtNum(streak.current)} day${streak.current === 1 ? "" : "s"} qualifying`, tone: streak.current > 0 ? "ok" : "" })}
      ${metricCard({ k: "Longest streak", v: `${fmtNum(streak.longest)}<span class="faint" style="font-size:var(--fs-lg)">d</span>`, s: "personal best" })}
      ${metricCard({ k: "Study time", v: esc(fmtDuration(g.stats.minutes)), s: `${fmtNum(g.stats.sessions)} sessions`, href: "#/analytics" })}
      ${metricCard({ k: "Study days", v: fmtNum(streak.qualifiedDays), s: `${fmtNum(streak.activeDays)} active days in total` })}
      ${metricCard({ k: "XP", v: fmtNum(g.points), s: `level ${level.level} · ${level.title}` })}
      ${metricCard({ k: "Achievements", v: `${fmtNum(g.unlocked)}<span class="faint" style="font-size:var(--fs-lg)">/${fmtNum(g.achievements.length)}</span>`, s: "unlocked from real records" })}
    </div>`;

    /* ---------------------------------------------------- streak spotlight -- */
    const nextMilestone = STREAK_MILESTONES.find((m) => m > streak.longest) || null;
    const milestonePct = nextMilestone ? Math.min(100, (streak.longest / nextMilestone) * 100) : 100;
    const streakSpotlight = `<section class="card streak-spotlight">
      <div class="streak-spotlight-head">
        <div class="streak-spotlight-copy">
          <div class="eyebrow">Current streak</div>
          <div class="streak-big">
            <span class="streak-flame" aria-hidden="true">🔥</span>
            <span>${fmtNum(streak.current)}</span>
            <span class="streak-unit">day${streak.current === 1 ? "" : "s"}</span>
          </div>
          <p class="small muted">${esc(g.streakRule)} ${streak.todayQualified ? "Today already counts — nice." : "Today is still open; save a session or tick three items to keep it alive."}</p>
        </div>
        <div class="streak-spotlight-side">
          <div class="streak-side-row"><span>Longest</span><b>${fmtNum(streak.longest)} days</b></div>
          <div class="streak-side-row"><span>Qualifying days</span><b>${fmtNum(streak.qualifiedDays)}</b></div>
          <div class="streak-side-row"><span>Active days</span><b>${fmtNum(streak.activeDays)}</b></div>
          <div class="streak-side-row"><span>Today</span><b>${streak.todayQualified ? "counted 🔥" : "not yet"}</b></div>
        </div>
      </div>

      <div class="streak-week" role="list" aria-label="Last seven days of activity">
        ${week.map((d) => {
          const on = d.minutes > 0;
          const isToday = d.day === today;
          return `<div class="streak-week-day ${on ? "on" : ""} ${isToday ? "today" : ""}" role="listitem" title="${esc(d.day)} · ${fmtNum(d.minutes)} minutes">
            <span class="swd-label">${esc(WEEKDAY(d.day))}</span>
            <span class="swd-dot" aria-hidden="true">${on ? "●" : ""}</span>
            <span class="swd-min">${on ? `${fmtNum(d.minutes)}m` : "—"}</span>
          </div>`;
        }).join("")}
      </div>

      <div class="streak-next">
        <div class="row between small">
          <span>${nextMilestone ? `Next milestone · ${fmtNum(nextMilestone)} days` : "Every milestone reached 🏆"}</span>
          <span class="faint">${nextMilestone ? `${fmtNum(streak.longest)} / ${fmtNum(nextMilestone)}` : "legend"}</span>
        </div>
        <div class="mt-2">${bar(milestonePct, { cls: nextMilestone ? "warn" : "ok" })}</div>
      </div>

      <div class="streak-milestones" aria-label="Streak milestones">
        ${STREAK_MILESTONES.map((m) => `<span class="milestone ${streak.longest >= m ? "reached" : ""}">${streak.longest >= m ? "✓ " : ""}${fmtNum(m)}d</span>`).join("")}
      </div>
    </section>`;

    /* ---------------------------------------------------------- quests ----- */
    const q = g.quests;
    const questsCard = questBoard({
      title: "Quests",
      subtitle: `Today ${q.dailyDoneCount}/${q.daily.length} · this week ${q.weeklyDoneCount}/${q.weekly.length} · ${q.xpAvailable ? `+${fmtNum(q.xpAvailable)} XP available` : "all boards cleared"}`,
      actions: `<a class="btn sm ghost" href="#/dashboard">Today's board →</a>`,
      quests: [...q.weekly, ...q.daily],
      note: "Daily quests reset at midnight; weekly quests reset on Monday. Finishing one pays its XP exactly once — the ledger dedupes it, so a repeat visit can never mint it again.",
    });

    /* ----------------------------------------------------------- heatmap --- */
    const weeks = heatmap(g.dayActivity, today);
    const hmCell = (cell) => {
      if (!cell) return `<span class="hm-cell lvl0" aria-hidden="true"></span>`;
      return `<span class="hm-cell lvl${cell.level}" tabindex="0" role="img" aria-label="${esc(`${cell.day}: ${cell.minutes} minutes`)}" title="${esc(`${cell.day} · ${cell.minutes}m`)}"></span>`;
    };
    const activeLast30 = (g.dayActivity || []).slice(-30).filter((d) => d.studyMinutes > 0).length;
    const heat = sectionCard({
      title: "Study heatmap",
      subtitle: `${fmtNum(streak.qualifiedDays)} qualifying days in the last year · ${fmtNum(activeLast30)} active in the last 30`,
      body: `<div class="hm" role="group" aria-label="Study heatmap for the last year">${weeks.map((w) => `
        <div class="hm-week"><span class="hm-month" aria-hidden="true">${esc(w.label)}</span>${w.cells.map(hmCell).join("")}</div>`).join("")}</div>
        <div class="row wrap gap-2 mt-3 small faint">
          <span>Less</span>
          ${[0, 1, 2, 3, 4].map((l) => `<span class="hm-cell lvl${l}" aria-hidden="true"></span>`).join("")}
          <span>More</span>
          <span style="margin-left:auto">${HEATMAP_BUCKETS.map((b) => `${b.min}m+ = ${b.label}`).join(" · ")}</span>
        </div>
        <div class="callout info mt-4">A timer that is still running never counts — only a saved session does. That is why a gap can be real rest rather than missing data.</div>`,
    });

    /* ------------------------------------------------------- achievements -- */
    const achievements = sectionCard({
      title: "Achievements",
      subtitle: `${fmtNum(g.unlocked)} of ${fmtNum(g.achievements.length)} unlocked · derived from saved records, so they self-heal`,
      body: `<div class="achievement-grid">${g.achievements.map((a) => `
        <div class="achievement-card ${a.reached ? "unlocked" : "locked"}">
          <div class="achievement-top">
            <span class="achievement-icon" aria-hidden="true">${esc(a.icon)}</span>
            ${chip(a.reached ? "Unlocked" : `${fmtNum(a.value)}/${fmtNum(a.target)}`, a.reached ? "ok" : TONE_CLASS[a.tone])}
          </div>
          <h3>${esc(a.title)}</h3>
          <p class="xs muted">${esc(a.description)}</p>
          ${bar(a.progress * 100, { thin: true, cls: a.reached ? "ok" : "" })}
        </div>`).join("")}</div>`,
    });

    /* ------------------------------------------------------------ points --- */
    const recent = [...store.state.points]
      .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))
      .slice(0, 8);
    const pointsCard = sectionCard({
      title: "XP & rewards",
      subtitle: "A published, deduplicated ledger — every award is paid exactly once",
      body: `<div class="xp-summary">
        <div><span class="k">Lifetime XP</span><b>${fmtNum(g.points)}</b></div>
        <div><span class="k">Level</span><b>${level.level} · ${esc(level.title)}</b></div>
        <div><span class="k">To next level</span><b>${fmtNum(level.needed - level.intoLevel)} XP</b></div>
      </div>
      <div class="mt-3">${bar((level.intoLevel / level.needed) * 100, { cls: "acc" })}</div>
      <h3 class="mt-4">Recent awards</h3>
      ${recent.length ? `<div class="award-list">${recent.map((p) => `<div class="award-row"><span>${esc(p.label)} <span class="xs faint">${esc(p.day)}</span></span><span class="chip ${p.points > 0 ? "ok" : "plain"}">+${esc(p.points)}</span></div>`).join("")}</div>` : `<p class="small muted">No points yet — save a session or tick an item.</p>`}
      <details class="disclosure mt-4"><summary>How XP is earned</summary>
        <div class="table-wrap mt-3"><table>
          <thead><tr><th>Event</th><th>What it is</th><th>Rule</th></tr></thead>
          <tbody>${POINT_RULES_TEXT.map((r) => `<tr><td class="strong">${esc(r.label)}</td><td>${esc(r.event)}</td><td class="small muted">${esc(r.rule)}</td></tr>`).join("")}</tbody>
        </table></div>
      </details>`,
    });

    /* ---------------------------------------------------- share studio ----- */
    const kinds = shareCardKinds(g.shareFacts);
    // Looseleaf is the app's only design, so the card always uses it.
    const themeId = "looseleaf";
    const format = SHARE_FORMATS.includes(s.shareFormat) ? s.shareFormat : "post";
    const kind = kinds.includes(ui.shareKind) ? ui.shareKind : (kinds[0] || null);
    ui.shareKind = kind;
    const model = kind ? buildShareCard(g.shareFacts, kind) : null;

    const studio = sectionCard({
      title: "Share card studio",
      subtitle: model ? "A ready-to-post snapshot of your real numbers — no notes, doubts, deadlines or email ever appear" : "Cards unlock once you have something real to show",
      cls: "share-studio",
      body: kinds.length ? `
        <div class="share-studio-grid">
          <div class="share-preview-col">
            <div class="share-preview-frame">
              <canvas id="share-canvas" width="1080" height="${SHARE_FORMAT_SPECS[format].height}" aria-label="Preview of your share card"></canvas>
            </div>
            <div class="row wrap gap-2 mt-3">
              <button class="btn primary" data-act="share-png">⬇ Download PNG</button>
              <button class="btn" data-act="share-gif">⬇ Animated GIF</button>
            </div>
            <p class="xs faint mt-2">The GIF counts the headline up and drops a confetti burst. Everything is drawn and encoded in your browser — nothing is uploaded.</p>
          </div>

          <div class="share-controls">
            <div class="field"><label for="share-kind">Card style</label>
              <select class="select" id="share-kind" data-act="share-kind">${kinds.map((k) => `<option value="${esc(k)}"${k === kind ? " selected" : ""}>${esc(SHARE_CARD_KIND_LABEL[k])}</option>`).join("")}</select></div>
            <div class="field"><label for="share-format">Size</label>
              <select class="select" id="share-format" data-act="share-format">${SHARE_FORMATS.map((f) => `<option value="${esc(f)}"${f === format ? " selected" : ""}>${esc(SHARE_FORMAT_SPECS[f].label)}</option>`).join("")}</select></div>

            <div class="share-theme-note">
              <span class="eyebrow">Card design</span>
              <b>${esc(SHARE_THEME_SPECS[themeId].label)}</b>
              <span class="small muted">${esc(SHARE_THEME_SPECS[themeId].description)} The card wears the same design as the app — there is one look, in light and dark.</span>
            </div>

            ${model ? `<div class="share-stat-list" aria-label="Statistics on this card">
              ${model.stats.map((st) => `<div class="share-stat"><span>${esc(st.label)}</span><b>${esc(st.value)}</b></div>`).join("")}
            </div>` : ""}

            <div class="share-intents">
              ${shareIntents(model || { title: "", subtitle: "" }).map((i) => `<a class="btn ghost sm" href="${esc(i.href)}" target="_blank" rel="noopener">Share · ${esc(i.label)}</a>`).join("")}
            </div>
          </div>
        </div>`
        : emptyState({ icon: "🎴", title: "No share card yet", text: "Save a study session and your first card appears here.", action: `<a class="btn" href="#/timer">Open the timer</a>`, mood: "curious" }),
    });

    return [
      hero,
      stats,
      streakSpotlight,
      heat,
      achievements,
      questsCard,
      pointsCard,
      studio,
    ].join("");
  },

  mount(ctx) {
    const g = ctx.store.derived.gamification;
    const s = ctx.store.state.settings;
    const kinds = shareCardKinds(g.shareFacts);
    const kind = kinds.includes(ctx.ui.shareKind) ? ctx.ui.shareKind : kinds[0];
    const canvas = document.getElementById("share-canvas");
    if (!canvas || !kind) return null;
    const model = buildShareCard(g.shareFacts, kind);
    if (!model) return null;
    const theme = "looseleaf";
    const format = SHARE_FORMATS.includes(s.shareFormat) ? s.shareFormat : "post";
    try {
      const c2d = canvas.getContext("2d");
      if (c2d) drawCard(c2d, model, theme, format, { progress: 1 });
    } catch (e) {
      // jsdom has no canvas; the real browser path is covered by the Download buttons.
      console.error("[padhle] share preview", e);
    }
    return null;
  },
};
