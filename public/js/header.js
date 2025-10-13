// ✅ public/js/header.js
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Always fetch from absolute path under /html/
    const res = await fetch("/html/header.html");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    document.getElementById("header").innerHTML = html;

    // Fix logo path to always go home
    const logo = document.querySelector(".logo-link");
    if (logo) logo.href = "/html/index.html";

    // Initialize dropdown + layout
    setupDropdownMenu();
    lockMegaMenuToHeader();
    setupMenuReflowWatchers();
    setupMobileDropdownToggle(); // ✅ added mobile toggle
  } catch (err) {
    console.error("⚠️ Header load error:", err);
  }
});

/* ------------------------------------------------------
   Smooth + Smart Dropdown Hover Logic
------------------------------------------------------ */
function setupDropdownMenu() {
  const dropdowns = document.querySelectorAll(".dropdown");
  let activeDropdown = null;
  let timeout;

  dropdowns.forEach((dropdown) => {
    const menu = dropdown.querySelector(".mega-menu");

    dropdown.addEventListener("mouseenter", () => {
      clearTimeout(timeout);
      if (activeDropdown && activeDropdown !== dropdown) {
        activeDropdown.classList.remove("open");
      }
      dropdown.classList.add("open");
      activeDropdown = dropdown;
    });

    dropdown.addEventListener("mouseleave", (e) => {
      timeout = setTimeout(() => {
        if (
          !dropdown.contains(e.relatedTarget) &&
          !menu.contains(e.relatedTarget)
        ) {
          dropdown.classList.remove("open");
          if (activeDropdown === dropdown) activeDropdown = null;
        }
      }, 200);
    });

    if (menu) {
      menu.addEventListener("mouseenter", () => {
        clearTimeout(timeout);
        dropdown.classList.add("open");
        activeDropdown = dropdown;
      });

      menu.addEventListener("mouseleave", () => {
        const hoveringAnother = Array.from(dropdowns).some((d) =>
          d.matches(":hover")
        );
        if (!hoveringAnother) {
          timeout = setTimeout(() => {
            dropdown.classList.remove("open");
            if (activeDropdown === dropdown) activeDropdown = null;
          }, 200);
        }
      });
    }
  });
}

/* ------------------------------------------------------
   Keeps Mega Menu Flush Under Header (Dynamic Height)
------------------------------------------------------ */
function lockMegaMenuToHeader() {
  const header = document.querySelector(".main-header");
  if (!header) return;
  const rect = header.getBoundingClientRect();
  document.documentElement.style.setProperty(
    "--menu-top",
    `${Math.round(rect.bottom + window.scrollY)}px`
  );
}

/* ------------------------------------------------------
   Keeps Position Synced on Resize, Scroll, or Font Load
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

/* ------------------------------------------------------
   📱 Mobile Tap Dropdown Toggle (Church / School)
------------------------------------------------------ */
function setupMobileDropdownToggle() {
  const dropdowns = document.querySelectorAll(".dropdown");
  const mq = window.matchMedia("(max-width: 1024px)");

  dropdowns.forEach((dropdown) => {
    const button = dropdown.querySelector(".dropbtn");
    if (!button) return;

    button.addEventListener("click", (e) => {
      if (!mq.matches) return; // ✅ only apply on mobile/tablet
      e.preventDefault();
      e.stopPropagation();

      // Close other open dropdowns first
      dropdowns.forEach((d) => {
        if (d !== dropdown) d.classList.remove("open");
      });

      // Toggle this one
      dropdown.classList.toggle("open");
    });
  });

  // Close all dropdowns when clicking outside
  document.addEventListener("click", (e) => {
    if (!mq.matches) return;
    if (!e.target.closest(".dropdown")) {
      dropdowns.forEach((d) => d.classList.remove("open"));
    }
  });
}
