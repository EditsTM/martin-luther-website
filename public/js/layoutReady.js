// /js/layoutReady.js
(() => {
  function show() {
    document.documentElement.style.visibility = "visible";
    // optional: if you want a fade too, keep your html.loaded CSS and add this:
    document.documentElement.classList.add("loaded");
    window.dispatchEvent(new Event("layout:ready"));
  }

  function ready() {
    const headerLoaded = document.getElementById("header")?.classList.contains("loaded");
    const footerLoaded = document.getElementById("footer")?.classList.contains("loaded");
    return headerLoaded && footerLoaded;
  }

  const hasHeader = !!document.getElementById("header");
  const hasFooter = !!document.getElementById("footer");

  // If a page doesn't have header/footer containers, don't block it
  if (!hasHeader || !hasFooter) {
    show();
    return;
  }

  const t = setInterval(() => {
    if (ready()) {
      clearInterval(t);
      show();
    }
  }, 20);

  // SAFETY: never keep the site hidden forever
  setTimeout(() => {
    clearInterval(t);
    show();
  }, 1500);
})();