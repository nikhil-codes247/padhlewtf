/**
 * katex.js — reusable mathematical content rendering for the Revision Centre.
 *
 * Loads KaTeX from a CDN (with auto-render extension) and provides a single
 * renderMath(el) function that scans an element for LaTeX delimiters and
 * typesets them. This keeps math rendering in one place so every component
 * uses the same logic.
 *
 * Delimiters supported:
 *   Inline:  $...$  or  \(...\)
 *   Block:   $$...$$  or  \[...\]
 *
 * Falls back gracefully if KaTeX fails to load (shows raw text escaped).
 */

let katexLoaded = false;
let renderMathInElement = null;
let loadPromise = null;

/** Load KaTeX CSS + JS from cdnjs. Returns a promise that resolves when ready. */
export function loadKaTeX() {
  if (loadPromise) return loadPromise;
  if (katexLoaded) return Promise.resolve();

  loadPromise = new Promise((resolve, reject) => {
    // Load CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css";
    link.integrity = "sha384-...";
    link.crossOrigin = "anonymous";
    link.onload = () => {
      // Load JS
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js";
      script.crossOrigin = "anonymous";
      script.onload = () => {
        // Load auto-render extension
        const autoRender = document.createElement("script");
        autoRender.src = "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js";
        autoRender.crossOrigin = "anonymous";
        autoRender.onload = () => {
          renderMathInElement = window.renderMathInElement;
          katexLoaded = true;
          resolve();
        };
        autoRender.onerror = reject;
        document.head.appendChild(autoRender);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    };
    link.onerror = reject;
    document.head.appendChild(link);
  });

  return loadPromise;
}

/**
 * Render all LaTeX math inside an element.
 * @param {HTMLElement} el - the container element
 * @param {Object} opts - optional overrides (delimiters, etc.)
 */
export async function renderMath(el, opts = {}) {
  if (!el) return;
  try {
    await loadKaTeX();
    if (renderMathInElement) {
      renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
        ...opts,
      });
    }
  } catch (err) {
    // KaTeX unavailable — leave raw text (escaped by caller)
    console.warn("[revision] KaTeX render failed", err);
  }
}
