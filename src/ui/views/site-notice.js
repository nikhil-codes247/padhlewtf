/**
 * site-notice.js — Cookie consent banner.
 *
 * Shows a lightweight cookie consent banner on first visit. Stores the
 * student's choice in localStorage so it only shows once. Does not load any
 * tracking scripts until consent is given.
 */
import { esc } from "../dom.js?v=mwz855jx";

export default {
  id: "site-notice",
  render(ctx) {
    const alreadyConsented = localStorage.getItem("padhle.cookie-consent");
    if (alreadyConsented) return "";

    return `
    <div class="cookie-consent" role="dialog" aria-modal="true" aria-label="Cookie consent">
      <div class="cookie-card">
        <div class="cookie-content">
          <span class="cookie-ico" aria-hidden="true">🍪</span>
          <div class="cookie-text">
            <h3 style="margin:0 0 var(--sp-2) 0;font-size:var(--fs-lg);font-family:var(--font-display);letter-spacing:-0.02em">Cookies &amp; site data</h3>
            <p class="small muted" style="margin:0;line-height:1.6">We use cookies to keep you signed in, remember your preferences and understand how you use the site. Some are essential; others help us improve the experience. You can choose which categories to accept.</p>
          </div>
        </div>
        <div class="cookie-actions" style="display:flex;gap:var(--sp-3);justify-content:flex-end;margin-top:var(--sp-4)">
          <button class="btn ghost" type="button" data-act="cookie-essential">Essential only</button>
          <button class="btn primary" type="button" data-act="cookie-accept">Accept all</button>
        </div>
      </div>
    </div>
    <style>
      .cookie-consent {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: grid;
        place-items: center;
        background: rgba(26, 26, 26, 0.4);
        backdrop-filter: blur(4px);
      }
      .cookie-card {
        background: var(--ll-card);
        border: var(--border-w) solid var(--ll-pencil-mark);
        border-radius: var(--r);
        box-shadow: var(--shadow-lg);
        padding: var(--sp-7);
        max-width: 420px;
        width: 92%;
        color: var(--ll-ink);
      }
      .cookie-content {
        display: flex;
        gap: var(--sp-4);
        align-items: flex-start;
      }
      .cookie-ico {
        font-size: 3rem;
        flex-shrink: 0;
      }
      .cookie-text h3 {
        margin: 0 0 var(--sp-1) 0;
        font-size: var(--fs-lg);
        font-weight: 700;
      }
      .cookie-actions {
        display: flex;
        gap: var(--sp-3);
        justify-content: flex-end;
      }
      @media (max-width: 480px) {
        .cookie-card {
          width: 94%;
          padding: var(--sp-6);
        }
        .cookie-content {
          flex-direction: column;
          gap: var(--sp-3);
        }
        .cookie-actions {
          justify-content: stretch;
        }
        .cookie-actions .btn {
          flex: 1;
        }
      }
    </style>
    `;
  },
  mount(ctx) {
    const acceptBtn = document.querySelector('[data-act="cookie-accept"]');
    const essentialBtn = document.querySelector('[data-act="cookie-essential"]');
    if (acceptBtn) {
      acceptBtn.addEventListener("click", () => {
        localStorage.setItem("padhle.cookie-consent", "all");
        const el = document.querySelector(".cookie-consent");
        if (el) el.remove();
      });
    }
    if (essentialBtn) {
      essentialBtn.addEventListener("click", () => {
        localStorage.setItem("padhle.cookie-consent", "essential");
        const el = document.querySelector(".cookie-consent");
        if (el) el.remove();
      });
    }
  },
};