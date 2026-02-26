/**
 * File: public\js\header.js
 * Purpose: Implements client-side behavior for the header experience.
 */
//public/js/header.js
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const headerEl = document.getElementById("header");
    if (!headerEl) return; // prevents runtime errors on pages without #header

    // Fetch the static header include (same-origin)
    const res = await fetch("/html/header.html", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // SECURITY NOTE:
    // innerHTML is safe ONLY if /html/header.html is trusted static HTML.
    // If it ever becomes user-editable or server-templated with untrusted data,
    // you must sanitize more robustly or avoid injecting raw HTML.
    const tpl = document.createElement("template");
    tpl.innerHTML = html;

    // Basic hardening: remove <script> tags from the injected fragment
    tpl.content.querySelectorAll("script").forEach((s) => s.remove());

    // Basic hardening: remove inline event handlers like onclick="..."
    tpl.content.querySelectorAll("*").forEach((el) => {
      [...el.attributes].forEach((attr) => {
        if (attr.name.toLowerCase().startsWith("on")) el.removeAttribute(attr.name);
      });
    });

    // Insert the cleaned header HTML
    headerEl.replaceChildren(tpl.content);
    headerEl.classList.add("loaded");

    // Post-insert tweaks
    const logo = document.querySelector(".logo-link");
    if (logo) logo.href = "/html/index.html";

    setupDropdownMenu();
    lockMegaMenuToHeader();
    setupMenuReflowWatchers();
  } catch (err) {
    console.error("[WARNING] Header load error:", err);
  }
});

/* ------------------------------------------------------
   Dropdown Hover (Desktop) + Tap (Mobile/iPhone)
------------------------------------------------------ */
function setupDropdownMenu() {
  const dropdowns = document.querySelectorAll(".dropdown");
  let activeDropdown = null;
  let timeout;

  // Closes all dropdowns and clears "menu-open" body state
  const closeAll = () => {
    dropdowns.forEach((d) => d.classList.remove("open"));
    activeDropdown = null;
    document.body.classList.remove("menu-open");
  };

  dropdowns.forEach((dropdown) => {
    const trigger = dropdown.querySelector(".dropbtn");
    const menu = dropdown.querySelector(".mega-menu");

    /* ---------- 🖱️ DESKTOP HOVER ---------- */
    dropdown.addEventListener("mouseenter", () => {
      if (window.innerWidth <= 770) return;
      clearTimeout(timeout);

      // Only one open dropdown at a time
      if (activeDropdown && activeDropdown !== dropdown) {
        activeDropdown.classList.remove("open");
      }

      dropdown.classList.add("open");
      activeDropdown = dropdown;
      document.body.classList.add("menu-open");
      lockMegaMenuToHeader(); // keeps mega-menu aligned under header
    });

    dropdown.addEventListener("mouseleave", () => {
      if (window.innerWidth <= 770) return;

      // Small delay prevents flicker when moving cursor between trigger/menu
      timeout = setTimeout(() => {
        dropdown.classList.remove("open");
        if (activeDropdown === dropdown) activeDropdown = null;
        document.body.classList.remove("menu-open");
      }, 150);
    });

    /* ---------- MOBILE TAP LOGIC ---------- */
    if (trigger) {
      let tappedOnce = false;

      trigger.addEventListener("click", (e) => {
        if (window.innerWidth > 770) return; // only on small screens

        const isOpen = dropdown.classList.contains("open");

        // If already tapped once and menu is open, allow default link navigation
        if (tappedOnce && isOpen) return true;

        // First tap opens the menu instead of navigating
        e.preventDefault();
        e.stopPropagation();

        closeAll();
        dropdown.classList.add("open");
        activeDropdown = dropdown;
        document.body.classList.add("menu-open");
        lockMegaMenuToHeader();

        // Prevent "sticky" tap state
        tappedOnce = true;
        setTimeout(() => (tappedOnce = false), 1500);
      });
    }

    /* ---------- Inside Menu Links ---------- */
    if (menu) {
      // Clicking any link inside the menu closes everything
      menu.addEventListener("click", (ev) => {
        if (ev.target.tagName === "A") closeAll();
      });
    }
  });

  /* ---------- Click Outside Closes ---------- */
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown") && !e.target.closest(".mega-menu")) {
      closeAll();
    }
  });

  /* ---------- ESC Key Closes ---------- */
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

  // Compute the bottom of the header in document coordinates
  const rect = header.getBoundingClientRect();
  const top = Math.round(rect.bottom + window.scrollY);

  // Expose it to CSS as a variable so mega-menu can position itself
  document.documentElement.style.setProperty("--menu-top", `${top}px`);
}

/* ------------------------------------------------------
   Update Position on Resize/Scroll
------------------------------------------------------ */
function setupMenuReflowWatchers() {
  const update = () => lockMegaMenuToHeader();

  // Passive listeners = better scroll performance
  window.addEventListener("resize", update, { passive: true });
  window.addEventListener("scroll", update, { passive: true });

  // Re-run once fonts load (header height can change after font swap)
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(update);

  // If header resizes (responsive layout), keep menu aligned
  if ("ResizeObserver" in window) {
    const header = document.querySelector(".main-header");
    if (header) new ResizeObserver(update).observe(header);
  }
}
