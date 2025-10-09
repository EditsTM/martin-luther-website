// ✅ public/js/footer.js
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch("/html/footer.html");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    document.getElementById("footer").innerHTML = html;
  } catch (err) {
    console.error("⚠️ Footer load error:", err);
  }
});
