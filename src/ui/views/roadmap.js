/**
 * roadmap.js — "What's New?": feature cards plus a one-vote excitement poll.
 *
 * The poll is stored in the student's own `user_settings` row, so the tally a
 * student sees is always their own vote (honest: "1 vote"). A server-wide
 * aggregate would need a shared backend; until one exists the page says so
 * rather than fabricating a number.
 */
import { esc } from "../dom.js?v=mwz7i9p1";
import { chip, sectionCard } from "../components.js?v=mwz7i9p1";
import { ROADMAP_ITEMS, STATUS_LABEL, STATUS_ORDER, STATUS_TONE } from "../../data/roadmap.js?v=mwz7i9p1";
import { EXCITEMENT_OPTIONS, summariseVotes, optionPercent } from "../../core/excitement.js?v=mwz7i9p1";

function pollSection(ctx) {
  const s = ctx.store.state.settings;
  const mine = s.excitementVote;

  const counts = mine ? { [mine]: 1 } : {};
  const source = "This counts only your own vote, because there is no shared server to compare against yet.";
  const summary = summariseVotes(Object.entries(counts).map(([choice, count]) => ({ choice, count })));

  return sectionCard({
    title: "How excited are you about what's coming?",
    subtitle: "One vote, three fixed answers. “Excited” is the two positive answers; ideas are counted separately so they cannot inflate it.",
    actions: mine ? `<span class="chip ok">You voted: ${esc(EXCITEMENT_OPTIONS.find((o) => o.choice === mine)?.short || mine)}</span>` : "",
    body: `<div class="row wrap gap-3">
      ${EXCITEMENT_OPTIONS.map((o) => {
        const pct = optionPercent(summary, o.choice);
        const active = mine === o.choice;
        return `<button type="button" class="btn ${active ? "primary" : ""}" data-act="vote-excitement" data-choice="${esc(o.choice)}" style="flex:1;min-width:180px;text-align:left">
          <span style="font-size:1.3em">${o.emoji}</span> ${esc(o.label)}
          ${summary.total ? `<span class="chip ${active ? "" : "soft"}" style="margin-left:auto">${pct}%</span>` : ""}
        </button>`;
      }).join("")}
    </div>
    ${summary.total ? `<div class="mt-4"><div class="xs faint">${esc(source)}</div></div>` : ""}
    <div class="field mt-4">
      <label for="excitement-note">Anything you want to see? (optional)</label>
      <textarea class="textarea" id="excitement-note" rows="2" placeholder="A feature idea, a bug, a subject you want covered…">${esc(s.excitementNote || "")}</textarea>
    </div>
    <div class="row gap-2 mt-3"><button class="btn" data-act="vote-note-save">Save my note</button></div>`,
  });
}

export default {
  id: "roadmap",
  title: "What's New?",
  render(ctx) {
    const head = `<section class="card stripe" style="--stripe:var(--accent)">
      <span class="eyebrow">System · Roadmap</span>
      <h1 style="margin:6px 0">What's new, and what's next</h1>
      <p class="small muted" style="margin:0">Product intentions, not promises. Every item carries a status — planned, in development or released. There is no softer fourth state.</p>
    </section>`;

    const byStatus = STATUS_ORDER.map((status) => ({
      status,
      items: ROADMAP_ITEMS.filter((i) => i.status === status).sort((a, b) => a.order - b.order),
    })).filter((g) => g.items.length);

    const cards = byStatus.map((g) => sectionCard({
      title: STATUS_LABEL[g.status],
      subtitle: `${g.items.length} item${g.items.length === 1 ? "" : "s"}`,
      body: `<div class="tiles">${g.items.map((item) => `
        <div class="tile">
          <div class="row between gap-2"><span class="chip soft">${esc(item.category)}</span>${chip(STATUS_LABEL[item.status], STATUS_TONE[item.status])}</div>
          <h3 style="margin:var(--sp-3) 0 var(--sp-2)">${esc(item.title)}</h3>
          <p class="small muted" style="margin:0 0 var(--sp-3)">${esc(item.summary)}</p>
          ${item.detail ? `<p class="small faint" style="margin:0">${esc(item.detail)}</p>` : ""}
          <div class="xs faint mt-3">${esc(item.timing)}</div>
        </div>`).join("")}</div>`,
    }));

    const honest = `<section class="card">
      <h2>A note on "planned"</h2>
      <p class="small muted">A status is a statement about where the work is today, not a schedule. Nothing here has a date, and nothing is described as coming next week. When an item ships it moves to <b>Released</b>; until then it stays exactly as labelled.</p>
    </section>`;

    return [head, pollSection(ctx), ...cards, honest].join("");
  },

  mount(ctx) {
    return null;
  },
};
