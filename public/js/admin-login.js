/**
 * File: public\js\admin-login.js
 * Purpose: Adds show/hide password toggle behavior for admin login forms.
 */
document.addEventListener("DOMContentLoaded", () => {
  const toggles = document.querySelectorAll("[data-password-toggle]");
  if (!toggles.length) return;

  toggles.forEach((toggle) => {
    const targetId = toggle.getAttribute("data-target");
    if (!targetId) return;

    const input = document.getElementById(targetId);
    if (!input) return;

    toggle.addEventListener("click", () => {
      const nextType = input.type === "password" ? "text" : "password";
      const isVisible = nextType === "text";
      input.type = nextType;
      toggle.classList.toggle("is-visible", isVisible);
      toggle.setAttribute("aria-pressed", String(isVisible));
      toggle.setAttribute("aria-label", isVisible ? "Hide password" : "Show password");
    });
  });
});
