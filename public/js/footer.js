// ✅ public/js/footer.js
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const footerEl = document.getElementById("footer");
    if (!footerEl) return;

    const res = await fetch("/html/footer.html", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();

    // Footer file should be trusted static HTML.
    // If it ever becomes user-editable, do NOT use innerHTML without sanitizing.
    footerEl.innerHTML = html;
  } catch (err) {
    console.error("⚠️ Footer load error:", err);
  }
});
