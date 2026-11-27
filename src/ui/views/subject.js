import { esc, fmtPct, groupBy } from "../dom.js?v=mwz6nuk5";
import { emptyState, sectionCard, table, deadlineChip } from "../components.js?v=mwz6nuk5";
import { chapterFiltersHtml, chapterRow, filterChapters, scopeNote, subjectSummary } from "./_shared.js?v=mwz6nuk5";
import { fmtDuration, fmtShort } from "../../core/dates.js?v=mwz6nuk5";
import { isVisibleSubject } from "../selection.js?v=mwz6nuk5";

function outsideSelection() {
  return emptyState({
    icon: "🎯",
    title: "This subject is outside your selection",
    text: "PADHLE.WTF is showing only the subjects you chose. Add this one from Account → Change subjects if you need it.",
    action: `<a class="btn primary" href="#/choose-subjects">Change subjects</a> <a class="btn" href="#/syllabus">Back to my syllabus</a>`,
  });
}

export default {
  id: "subject",
  title: "Subject",
  render(ctx) {
    const { store, ui } = ctx;
    const subject = store.subject(ctx.params[0]);
    if (!subject) return missing();
    if (!isVisibleSubject(store, subject.id)) return outsideSelection();
    const chapters = store.chaptersOf(subject.id);
    const filtered = filterChapters(chapters, ui, ctx);
    const sp = store.subjectProgress(subject.id);
    const time = store.derived.time;

    const grouped = groupBy(filtered, (c) => c.unit || "—");
    const sessionsForSubject = store.state.sessions.filter((s) => s.subjectId === subject.id);
    const lastSession = sessionsForSubject.reduce((a, s) => (s.dateISO > (a?.dateISO || "") ? s : a), null);

    return [
      subjectSummary(subject, ctx),
      sectionCard({
        cls: "tight",
        body:
          `<div class="row wrap gap-2">
            <a class="btn sm ghost" href="#/syllabus">← All subjects</a>
            <span class="grow"></span>
            <button class="btn sm" data-act="subject-edit" data-id="${esc(subject.id)}">Edit subject</button>
            <button class="btn sm ghost" data-act="plan-load" data-date="${esc(ui.planStart || ctx.today)}">Load 60-day plan</button>
            <button class="btn sm danger" data-act="subject-delete" data-id="${esc(subject.id)}">Delete subject</button>
          </div>
          <hr>
          ${chapterFiltersHtml(ui, {})}`,
      }),
      scopeNote(),
      sectionCard({
        title: `${filtered.length} chapter${filtered.length === 1 ? "" : "s"}`,
        subtitle: chapters.length !== filtered.length ? `${chapters.length - filtered.length} hidden by filters` : "groups follow the official units",
        body: filtered.length === 0
          ? emptyState({ icon: "🔍", title: "No chapters match", text: "Reset the filters to see the whole subject.", action: `<button class="btn" data-act="filters-reset">Reset filters</button>` })
          : [...grouped.entries()].map(([unit, list]) => `<div class="stack mt-3">
              <h3 style="margin:var(--sp-2) 0 0">${esc(unit)}</h3>
              ${list.map((c) => chapterRow(c, ctx)).join("")}
            </div>`).join(""),
      }),
      sectionCard({
        title: "Study time in this subject",
        subtitle: `${esc(fmtDuration(sp.minutes))} logged across ${sessionsForSubject.length} session${sessionsForSubject.length === 1 ? "" : "s"}${lastSession ? ` · last on ${esc(fmtShort(lastSession.dateISO))}` : ""}`,
        body: (() => {
          const rows = store.chaptersOf(subject.id)
            .map((c) => ({ c, st: store.progressOf(c.id) }))
            .filter((x) => x.st.minutes > 0)
            .sort((a, b) => b.st.minutes - a.st.minutes);
          if (!rows.length) return emptyState({ icon: "⏱", title: "No time logged for this subject", text: "Use the timer or add a session manually, then this table fills in.", action: `<a class="btn primary" href="#/timer">Open the timer</a>` });
          return table(
            [{ label: "Chapter" }, { label: "Progress", cls: "num" }, { label: "Time", cls: "num" }, { label: "Items", cls: "num" }, { label: "Deadline" }],
            rows.map(({ c, st }) => [
              `<a href="#/chapter/${esc(c.id)}">${esc(c.name)}</a>`,
              fmtPct(st.pct),
              esc(fmtDuration(st.minutes)),
              `${st.done}/${st.leaves}`,
              st.deadline ? deadlineChip(st.deadline, ctx.today) : "—",
            ])
          );
        })(),
      }),
    ].join("");
  },
};

function missing() {
  return emptyState({ icon: "🚫", title: "Subject not found", text: "It may have been deleted.", action: `<a class="btn" href="#/syllabus">Back to the syllabus</a>` });
}
