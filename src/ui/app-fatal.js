/**
 * app-fatal.js — fatal error screen.
 *
 * Rendered when the store cannot initialize (for example the Supabase project is
 * unreachable or a migration has not been applied yet).
 */
import { esc } from "./dom.js?v=mwz855jx";
import { brand } from "../core/branding.js?v=mwz855jx";

export function renderFatal(err) {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="boot"><div class="boot-card" style="max-width:620px;text-align:left">
    <h1>${esc(brand())} could not open your study workspace</h1>
    <p class="muted">${esc(err?.message || String(err))}</p>
    <p class="small muted">Your saved work is safe. Try again in a moment.</p>
    <div class="row gap-2"><button class="btn primary" data-act="reload">Try again</button></div>
  </div></div>`;
}
