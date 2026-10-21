





const IDLE_LIMIT = 15 * 60 * 1000;
let idleTimer;

function resetIdleTimer() {
  clearTimeout(idleTimer);

  idleTimer = setTimeout(async () => {
    alert("Session expired due to inactivity. You’ll be logged out.");

    try {

      await fetch("/admin/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {

      window.location.href = "/admin/login";
    }
  }, IDLE_LIMIT);
}


["click", "mousemove", "keydown", "scroll", "touchstart"].forEach((evt) => {
  document.addEventListener(evt, resetIdleTimer);
});


resetIdleTimer();
