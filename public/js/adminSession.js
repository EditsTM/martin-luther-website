//public/js/adminSession.js
//Auto logout after 15 minutes of inactivity
const IDLE_LIMIT = 15 * 60 * 1000; // 15 minutes
let idleTimer;

function resetIdleTimer() {
  clearTimeout(idleTimer);

  idleTimer = setTimeout(async () => {
    alert("Session expired due to inactivity. You’ll be logged out.");

    try {
      // 🔐 Use POST instead of GET for logout (more secure)
      await fetch("/admin/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      // Redirect regardless, so user is fully logged out
      window.location.href = "/admin/login";
    }
  }, IDLE_LIMIT);
}

// Reset timer whenever the user interacts
["click", "mousemove", "keydown", "scroll", "touchstart"].forEach((evt) => {
  document.addEventListener(evt, resetIdleTimer);
});

// Initialize on page load
resetIdleTimer();
