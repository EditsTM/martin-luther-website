// ✅ public/js/header.js
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch("/html/header.html");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    document.getElementById("header").innerHTML = html;

    const logo = document.querySelector(".logo-link");
    if (logo) logo.href = "/html/index.html";

    setupDropdownMenu();
    lockMegaMenuToHeader();
    setupMenuReflowWatchers();
  } catch (err) {
    console.error("⚠️ Header load error:", err);
  }
});

/* ------------------------------------------------------
   Dropdown Hover (Desktop) + Tap Toggle (Touch Devices)
------------------------------------------------------ */
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

    // Hover (Desktop)
    dropdown.addEventListener("mouseenter", () => {
      if (window.innerWidth <= 770) return;
      clearTimeout(timeout);
      if (activeDropdown && activeDropdown !== dropdown)
        activeDropdown.classList.remove("open");
      dropdown.classList.add("open");
      activeDropdown = dropdown;
      document.body.classList.add("menu-open");
      lockMegaMenuToHeader();
    });

    dropdown.addEventListener("mouseleave", (e) => {
      if (window.innerWidth <= 770) return;
      timeout = setTimeout(() => {
        dropdown.classList.remove("open");
        if (activeDropdown === dropdown) activeDropdown = null;
        document.body.classList.remove("menu-open");
      }, 150);
    });

    // Tap to toggle (Touch/Mobile)
    if (trigger) {
      trigger.addEventListener("click", (e) => {
        if (window.innerWidth > 770) return; // only for smaller screens
        e.preventDefault();
        e.stopPropagation();

        const isOpen = dropdown.classList.contains("open");
        closeAll();
        if (!isOpen) {
          dropdown.classList.add("open");
          activeDropdown = dropdown;
          document.body.classList.add("menu-open");
          lockMegaMenuToHeader();
        }
      });
    }

    if (menu) {
      menu.addEventListener("click", (ev) => {
        if (ev.target.tagName === "A") closeAll();
      });
    }
  });

  // Click outside closes it
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown") && !e.target.closest(".mega-menu"))
      closeAll();
  });

  // ESC key closes menu
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });
}

/* ------------------------------------------------------
   Keeps Mega Menu Flush Below Header
------------------------------------------------------ */
function lockMegaMenuToHeader() {
  const header = document.querySelector(".main-header");
  if (!header) return;
  const rect = header.getBoundingClientRect();
  const top = Math.round(rect.bottom + window.scrollY);
  document.documentElement.style.setProperty("--menu-top", `${top}px`);
}

/* ------------------------------------------------------
   Update Position on Resize/Scroll
------------------------------------------------------ */
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
