/**
 * charts.js — hand-rolled SVG charts. No chart library, no canvas, fully
 * responsive via viewBox, colour inherited from the CSS theme, and every chart
 * carries an aria-label with the underlying numbers so it is readable by
 * screen readers (and never decorative-only).
 */
import { esc, fmtNum, fmtPct } from "./dom.js?v=mwz7i9p1";

/* ------------------------------------------------------------------ donut -- */
export function donut({ segments, size = 190, thickness = 26, center, sub, aria }) {
  const total = segments.reduce((a, s) => a + (Number(s.value) || 0), 0);
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const segs = total > 0
    ? segments.filter((s) => Number(s.value) > 0).map((s) => {
        const len = (Number(s.value) / total) * circ;
        const el = `<circle class="donut-seg" cx="${c}" cy="${c}" r="${r}" stroke="${esc(s.color)}" stroke-width="${thickness}"
          stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"
          transform="rotate(-90 ${c} ${c})" data-tip="${esc(s.label)}: ${fmtNum(s.value)}"><title>${esc(s.label)}: ${fmtNum(s.value)}</title></circle>`;
        offset += len;
        return el;
      }).join("")
    : "";
  const label = aria || `${segments.map((s) => `${s.label} ${fmtNum(s.value)}`).join(", ") || "no data"}`;
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}">
    <circle class="donut-track" cx="${c}" cy="${c}" r="${r}" stroke-width="${thickness}"></circle>
    ${segs}
    ${center !== undefined ? `<text x="${c}" y="${c - 4}" text-anchor="middle" class="axis-text strong" style="font-size:26px;font-weight:800">${esc(center)}</text>` : ""}
    ${sub ? `<text x="${c}" y="${c + 18}" text-anchor="middle" class="axis-text">${esc(sub)}</text>` : ""}
  </svg></div>`;
}

export function legend(items) {
  return `<div class="chart-legend">${items.map((i) => `<span class="item"><span class="swatch" style="background:${esc(i.color)}"></span>${esc(i.label)}${i.value !== undefined ? ` · <b>${esc(i.value)}</b>` : ""}</span>`).join("")}</div>`;
}

/* ------------------------------------------------------------- bar (days) -- */
export function barChart({ data, height = 168, valueFormat = (v) => fmtNum(v), goal = null, colorClass = "", ariaLabel = "bar chart" }) {
  const w = Math.max(320, data.length * 34);
  const padL = 44, padR = 10, padT = 12, padB = 30;
  const innerW = w - padL - padR, innerH = height - padT - padB;
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0), goal || 0);
  const bw = Math.min(26, innerW / Math.max(1, data.length) * 0.68);

  const ticks = [0, 0.5, 1].map((f) => {
    const y = padT + innerH - f * innerH;
    return `<line class="grid-line" x1="${padL}" x2="${w - padR}" y1="${y}" y2="${y}"></line>
            <text class="axis-text" x="${padL - 7}" y="${y + 3.5}" text-anchor="end">${esc(valueFormat(max * f))}</text>`;
  }).join("");

  const bars = [];
  const labels = [];
  data.forEach((d, i) => {
    const v = Number(d.value) || 0;
    const bh = v <= 0 ? 0 : Math.max(2, (v / max) * innerH);
    const x = padL + (innerW / data.length) * i + (innerW / data.length - bw) / 2;
    const y = padT + innerH - bh;
    const cls = d.colorClass || colorClass || "";
    bars.push(`<g><rect class="hit" x="${padL + (innerW / data.length) * i}" y="${padT}" width="${innerW / data.length}" height="${innerH}"
        data-tip="${esc(d.label)}: ${esc(valueFormat(v))}"></rect>
      <rect class="bar ${cls}" x="${x}" y="${y}" width="${bw}" height="${bh}" rx="2"></rect>
      <text class="axis-text" x="${x + bw / 2}" y="${height - padB + 14}" text-anchor="middle">${esc(d.short ?? d.label)}</text></g>`);
    if (v > 0 && bh >= 20) {
      labels.push(`<text class="axis-text strong" x="${x + bw / 2}" y="${y - 6}" text-anchor="middle">${esc(valueFormat(v))}</text>`);
    }
  });

  const goalLine = goal > 0 && goal <= max
    ? `<line x1="${padL}" x2="${w - padR}" y1="${padT + innerH - (goal / max) * innerH}" y2="${padT + innerH - (goal / max) * innerH}"
         stroke="var(--warn)" stroke-width="2" stroke-dasharray="6 5"></line>`
    : "";

  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${w} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(ariaLabel)}">
    ${ticks}${goalLine}${bars.join("")}${labels.join("")}
  </svg><div class="chart-tip" data-tip-box></div></div>`;
}

/* --------------------------------------------------------- horizontal bars -- */
export function hBars({ data, valueFormat = (v) => fmtNum(v), max = null, showPct = false }) {
  const top = max ?? Math.max(1, ...data.map((d) => Number(d.value) || 0));
  return `<div class="stack gap-2">${data.map((d) => {
    const v = Number(d.value) || 0;
    const pct = top > 0 ? (v / top) * 100 : 0;
    return `<div class="row gap-3">
      <div class="small truncate" style="width:min(38%,150px)" title="${esc(d.label)}">${esc(d.label)}</div>
      <div class="bar grow" style="height:14px"><span style="width:${pct.toFixed(1)}%;background:${esc(d.color || "var(--accent)")}"></span></div>
      <div class="small nowrap right" style="width:76px;font-variant-numeric:tabular-nums">${esc(valueFormat(v))}${showPct ? ` <span class="faint">${fmtPct(d.pct)}</span>` : ""}</div>
    </div>`;
  }).join("")}</div>`;
}

/* ------------------------------------------------------------------ lines -- */
export function lineChart({ points, height = 150, valueFormat = (v) => fmtNum(v), ariaLabel = "trend" }) {
  const w = Math.max(320, points.length * 26);
  const padL = 42, padR = 12, padT = 12, padB = 28;
  const innerW = w - padL - padR, innerH = height - padT - padB;
  const max = Math.max(1, ...points.map((p) => Number(p.value) || 0));
  const step = points.length > 1 ? innerW / (points.length - 1) : innerW;
  const xy = points.map((p, i) => [padL + step * i, padT + innerH - ((Number(p.value) || 0) / max) * innerH]);
  const path = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = xy.length ? `${path} L${xy[xy.length - 1][0].toFixed(1)},${padT + innerH} L${xy[0][0].toFixed(1)},${padT + innerH} Z` : "";
  const dots = xy.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--accent)" stroke="var(--ink)" stroke-width="1.5" data-tip="${esc(points[i].label)}: ${esc(valueFormat(points[i].value))}"><title>${esc(points[i].label)}: ${esc(valueFormat(points[i].value))}</title></circle>`).join("");
  const ticks = [0, 1].map((f) => {
    const y = padT + innerH - f * innerH;
    return `<line class="grid-line" x1="${padL}" x2="${w - padR}" y1="${y}" y2="${y}"></line>
      <text class="axis-text" x="${padL - 7}" y="${y + 3.5}" text-anchor="end">${esc(valueFormat(max * f))}</text>`;
  }).join("");
  const labels = points.map((p, i) => (points.length > 12 && i % 2 !== 0) ? "" :
    `<text class="axis-text" x="${xy[i][0]}" y="${height - padB + 14}" text-anchor="middle">${esc(p.short ?? p.label)}</text>`).join("");
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${w} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(ariaLabel)}">
    ${ticks}<path class="area" d="${area}"></path><path class="line" d="${path}"></path>${dots}${labels}
  </svg></div>`;
}

/* ------------------------------------------------------------------ tooltips -- */
/**
 * Delegated chart tooltips. Every chart element that carries a `data-tip`
 * attribute (bars, line points, donut segments) shows a floating tip on hover.
 * One listener per document is enough because views replace innerHTML but the
 * elements keep matching the same selectors.
 */
(function () {
  let tip = null;
  function ensure() {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "chart-tip";
      tip.setAttribute("data-tip-box", "");
      document.body.appendChild(tip);
    }
  }
  function hide() { if (tip) tip.classList.remove("on"); }
  function pointAt(e) { return e.target.closest(".chart .hit, .chart circle[data-tip], .chart .donut-seg"); }
  document.addEventListener("mouseover", (e) => {
    const hit = pointAt(e);
    if (!hit) { hide(); return; }
    const text = hit.getAttribute("data-tip") || hit.getAttribute("title") || "";
    if (!text) { hide(); return; }
    ensure(); tip.textContent = text; tip.classList.add("on");
    tip.style.left = (e.pageX + 14) + "px";
    tip.style.top = (e.pageY + 14) + "px";
  });
  document.addEventListener("mousemove", (e) => {
    if (tip && tip.classList.contains("on")) {
      tip.style.left = (e.pageX + 14) + "px";
      tip.style.top = (e.pageY + 14) + "px";
    }
  });
  document.addEventListener("mouseout", (e) => {
    if (!tip || !tip.classList.contains("on")) return;
    const related = e.relatedTarget || e.target;
    if (related && related.closest(".chart")) return;
    hide();
  });
})();
