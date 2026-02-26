/**
 * File: public\js\reveal.js
 * Purpose: Implements client-side behavior for the reveal experience.
 */
// /js/reveal.js
(() => {
  // 1) Inject CSS once
  const styleId = "reveal-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .reveal{
        opacity:0;
        transform:translateY(8px);
        transition:opacity 900ms ease, transform 900ms ease;
        will-change:opacity, transform;
      }
      .reveal.is-visible{
        opacity:1;
        transform:translateY(0);
      }
      @media (prefers-reduced-motion: reduce){
        .reveal{
          opacity:1 !important;
          transform:none !important;
          transition:none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 2) Make one observer we can reuse
  const observer = reduceMotion
    ? null
    : new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target); // reveal once
          });
        },
        { threshold: 0.15 }
      );

  // 3) Apply reveal to elements (only once per element)
  function applyReveal(root = document) {
    const elements = root.querySelectorAll(
      "h1, h2, h3, p, .btn, .btn-outline, .event-card, .feature-box, section"
    );

    elements.forEach((el) => {
      // don't animate the entire page containers like header/footer wrappers
      if (el.id === "header" || el.id === "footer") return;

      if (!el.classList.contains("reveal")) el.classList.add("reveal");

      if (reduceMotion) {
        el.classList.add("is-visible");
      } else {
        // Observe only if not already visible
        if (!el.classList.contains("is-visible")) observer.observe(el);
      }
    });
  }

  // 4) Initial run
  document.addEventListener("DOMContentLoaded", () => {
    applyReveal();

    // 5) Re-run after dynamic content likely finished (header/footer/events)
    // This catches content inserted after DOMContentLoaded.
    setTimeout(applyReveal, 50);
    setTimeout(applyReveal, 250);
    setTimeout(applyReveal, 800);

    // 6) Also watch for anything injected later (robust fix)
    const mo = new MutationObserver(() => applyReveal());
    mo.observe(document.body, { childList: true, subtree: true });
  });
})();