




(() => {

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


  const observer = reduceMotion
    ? null
    : new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            obs.unobserve(entry.target);
          });
        },
        { threshold: 0.15 }
      );


  function applyReveal(root = document) {
    const elements = root.querySelectorAll(
      "h1, h2, h3, p, .btn, .btn-outline, .event-card, .feature-box, section"
    );

    elements.forEach((el) => {

      if (el.id === "header" || el.id === "footer") return;

      if (!el.classList.contains("reveal")) el.classList.add("reveal");

      if (reduceMotion) {
        el.classList.add("is-visible");
      } else {

        if (!el.classList.contains("is-visible")) observer.observe(el);
      }
    });
  }


  document.addEventListener("DOMContentLoaded", () => {
    applyReveal();



    setTimeout(applyReveal, 50);
    setTimeout(applyReveal, 250);
    setTimeout(applyReveal, 800);


    const mo = new MutationObserver(() => applyReveal());
    mo.observe(document.body, { childList: true, subtree: true });
  });
})();