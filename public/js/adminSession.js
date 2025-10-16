// ✅ public/js/adminSession.js
// 🕒 Auto logout after 15 minutes of inactivity
const IDLE_LIMIT = 15 * 60 * 1000; // 15 minutes
let idleTimer;

function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    alert("Session expired due to inactivity. You’ll be logged out.");
    window.location.href = "/admin/logout";
  }, IDLE_LIMIT);
}

// Reset timer whenever the user interacts
["click", "mousemove", "keydown", "scroll", "touchstart"].forEach(evt => {
  document.addEventListener(evt, resetIdleTimer);
});

// Initialize on page load
resetIdleTimer();
