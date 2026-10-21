




document.addEventListener("DOMContentLoaded", async () => {
  try {
    const headerEl = document.getElementById("header");
    if (!headerEl) return;


    const res = await fetch("/html/header.html", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();





    const tpl = document.createElement("template");
    tpl.innerHTML = html;


    tpl.content.querySelectorAll("script").forEach((s) => s.remove());


    tpl.content.querySelectorAll("*").forEach((el) => {
      [...el.attributes].forEach((attr) => {
        if (attr.name.toLowerCase().startsWith("on")) el.removeAttribute(attr.name);
      });
    });


    headerEl.replaceChildren(tpl.content);
    headerEl.classList.add("loaded");


    const logo = document.querySelector(".logo-link");
    if (logo) logo.href = "/html/index.html";

    setupDropdownMenu();
    lockMegaMenuToHeader();
    setupMenuReflowWatchers();
  } catch (err) {
    console.error("[WARNING] Header load error:", err);
  }
});




function setupDropdownMenu() {
  const dropdowns = document.querySelectorAll(".dropdown");
  let activeDropdown = null;
  let timeout;


  const closeAll = () => {
    dropdowns.forEach((d) => d.classList.remove("open"));
    activeDropdown = null;
    document.body.classList.remove("menu-open");
  };

  dropdowns.forEach((dropdown) => {
    const trigger = dropdown.querySelector(".dropbtn");
    const menu = dropdown.querySelector(".mega-menu");


    dropdown.addEventListener("mouseenter", () => {
      if (window.innerWidth <= 770) return;
      clearTimeout(timeout);


      if (activeDropdown && activeDropdown !== dropdown) {
        activeDropdown.classList.remove("open");
      }

      dropdown.classList.add("open");
      activeDropdown = dropdown;
      document.body.classList.add("menu-open");
      lockMegaMenuToHeader();
    });

    dropdown.addEventListener("mouseleave", () => {
      if (window.innerWidth <= 770) return;


      timeout = setTimeout(() => {
        dropdown.classList.remove("open");
        if (activeDropdown === dropdown) activeDropdown = null;
        document.body.classList.remove("menu-open");
      }, 150);
    });


    if (trigger) {
      let tappedOnce = false;

      trigger.addEventListener("click", (e) => {
        if (window.innerWidth > 770) return;

        const isOpen = dropdown.classList.contains("open");


        if (tappedOnce && isOpen) return true;


        e.preventDefault();
        e.stopPropagation();

        closeAll();
        dropdown.classList.add("open");
        activeDropdown = dropdown;
        document.body.classList.add("menu-open");
        lockMegaMenuToHeader();


        tappedOnce = true;
        setTimeout(() => (tappedOnce = false), 1500);
      });
    }


    if (menu) {

      menu.addEventListener("click", (ev) => {
        if (ev.target.tagName === "A") closeAll();
      });
    }
  });


  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown") && !e.target.closest(".mega-menu")) {
      closeAll();
    }
  });


  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });
}




function lockMegaMenuToHeader() {
  const header = document.querySelector(".main-header");
  if (!header) return;


  const rect = header.getBoundingClientRect();
  const top = Math.round(rect.bottom + window.scrollY);


  document.documentElement.style.setProperty("--menu-top", `${top}px`);
}




function setupMenuReflowWatchers() {
  const update = () => lockMegaMenuToHeader();


  window.addEventListener("resize", update, { passive: true });
  window.addEventListener("scroll", update, { passive: true });


  if (document.fonts && document.fonts.ready) document.fonts.ready.then(update);


  if ("ResizeObserver" in window) {
    const header = document.querySelector(".main-header");
    if (header) new ResizeObserver(update).observe(header);
  }
}
