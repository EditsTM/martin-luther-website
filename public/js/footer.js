/**
 * File: public\js\footer.js
 * Purpose: Implements client-side behavior for the footer experience.
 */
//public/js/footer.js
document.addEventListener("DOMContentLoaded", async () => {
  async function fetchJson(url, options = {}) {
    const res = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
    });

    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const err = await res.json();
          msg = err?.error || err?.message || msg;
        }
      } catch (_) {}
      throw new Error(msg);
    }

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      throw new Error("Expected JSON response.");
    }
    return res.json();
  }

  const footerEl = document.getElementById("footer");
  if (!footerEl) return;

  try {
    const res = await fetch("/html/footer.html", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    footerEl.innerHTML = html;
    footerEl.classList.add("loaded");
  } catch (err) {
    console.error("[WARNING] Footer load error:", err);
    return;
  }

  const noteEl = footerEl.querySelector("#footer-time-note");
  const lineOneEl = footerEl.querySelector("#footer-time-line-one");
  const lineTwoEl = footerEl.querySelector("#footer-time-line-two");

  const current = {
    note: "*Summer hours vary*",
    lineOne: "Sundays - 8am & 10:30am",
    lineTwo: "Mondays - 6pm",
  };

  function applyFooterTime(text) {
    const next = {
      note: String(text?.note || "").trim() || current.note,
      lineOne: String(text?.lineOne || "").trim() || current.lineOne,
      lineTwo: String(text?.lineTwo || "").trim() || current.lineTwo,
    };

    if (noteEl) noteEl.textContent = next.note;
    if (lineOneEl) lineOneEl.textContent = next.lineOne;
    if (lineTwoEl) lineTwoEl.textContent = next.lineTwo;
  }

  try {
    const settings = await fetchJson("/content/footer-time.json");
    applyFooterTime(settings);
  } catch (err) {
    console.error("Failed to load footer time:", err);
  }
});
