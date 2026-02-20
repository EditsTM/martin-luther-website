// Force preload class automatically
document.documentElement.classList.add("preload");

// /js/layoutReady.js
(function () {
  function ready() {
    const headerLoaded = document.getElementById("header")?.classList.contains("loaded");
    const footerLoaded = document.getElementById("footer")?.classList.contains("loaded");
    return headerLoaded && footerLoaded;
  }

  function show() {
    document.body.classList.remove("preload");
    document.body.classList.add("loaded");
  }

  // In case a page doesn't use footer/header for some reason:
  const hasHeader = !!document.getElementById("header");
  const hasFooter = !!document.getElementById("footer");

  // If either doesn't exist, don't block the page
  if (!hasHeader || !hasFooter) {
    show();
    return;
  }

  // Poll briefly until both are loaded
  const t = setInterval(() => {
    if (ready()) {
      clearInterval(t);
      show();
    }
  }, 20);

  // Safety fallback: never keep page hidden forever
  setTimeout(() => {
    clearInterval(t);
    show();
  }, 1500);
})();