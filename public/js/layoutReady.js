




(() => {
  function show() {
    document.documentElement.style.visibility = "visible";

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


  setTimeout(() => {
    clearInterval(t);
    show();
  }, 1500);
})();