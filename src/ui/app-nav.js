/**
 * app-nav.js — primary navigation definition and rendering.
 *
 * Defines the NAV array (sidebar items) and renders them into the #nav element.
 * Route visibility is handled by the router gate in app.js.
 *
 * Layout contract: every item renders as a *direct* child anchor of #nav. The
 * integration test counts `#nav > a` (eleven items), so grouping is expressed
 * with data attributes and CSS separators rather than wrapper elements.
 */
import { esc } from "./dom.js?v=mwz7xp2l";
import { store } from "../core/store.js?v=mwz7xp2l";
import { todayISO } from "../core/dates.js?v=mwz7xp2l";
import { parseHash } from "./app-router.js?v=mwz7xp2l";

export const NAV = [
  { hash: "#/dashboard", label: "Dashboard", ico: "◧", routes: ["dashboard"], group: "Overview" },
  { hash: "#/syllabus", label: "My Syllabus", ico: "▤", routes: ["syllabus", "subject", "chapter"], group: "Plan" },
  { hash: "#/planner", label: "Daily Planner", ico: "▦", routes: ["planner"], badge: (d) => d.overduePlanner, group: "Plan" },
  { hash: "#/timer", label: "Study Timer", ico: "◷", routes: ["timer"], group: "Do" },
  { hash: "#/revision", label: "Revision Centre", ico: "↻", routes: ["revision", "flashcards", "practice-questions"], badge: (d) => d.revisionDue?.length ?? 0, group: "Do" },
  { hash: "#/notes", label: "Doubts & Notes", ico: "✎", routes: ["notes"], badge: (d) => d.openDoubts, group: "Do" },
  { hash: "#/analytics", label: "Analytics", ico: "◨", routes: ["analytics"], group: "Review" },
  { hash: "#/curriculum", label: "Syllabus Map", ico: "❖", routes: ["curriculum"], group: "Plan" },
  { hash: "#/calendar", label: "Calendar", ico: "▩", routes: ["calendar"], group: "Plan" },
  { hash: "#/board-exams", label: "Board Exams", ico: "📅", routes: ["board-exams"], group: "Plan" },
  { hash: "#/pyq", label: "PYQ Insights", ico: "▥", routes: ["pyq"], group: "Review" },
];

export function renderNav() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  const route = parseHash();
  const d = store.derived || {};
  const openDoubts = d.progress?.doubts?.open ?? 0;
  const revisionDue = d.revisionDue?.length ?? 0;
  const overduePlanner = store.state.planner.filter((t) => !t.done && t.dateISO < todayISO()).length;
  const badges = { openDoubts, revisionDue, overduePlanner };
  nav.innerHTML = NAV.map((item, i) => {
    const active = item.routes.includes(route.name);
    const n = item.badge ? Number(item.badge(badges)) || 0 : 0;
    const startsGroup = i === 0 || NAV[i - 1].group !== item.group;
    return `<a href="${item.hash}" class="${active ? "active" : ""}" ${active ? 'aria-current="page"' : ""}
      data-group="${esc(item.group)}"${startsGroup ? " data-group-start" : ""}
      title="${esc(item.label)}">
      <span class="ico" aria-hidden="true">${item.ico}</span>
      <span class="nav-label">${esc(item.label)}</span>
      ${n ? `<span class="count" title="${n} waiting" aria-label="${n} waiting">${n}</span>` : ""}
    </a>`;
  }).join("");
}
