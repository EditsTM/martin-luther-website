(() => {
  // -------------------------
  // View switching (left nav)
  // -------------------------
const navButtons = document.querySelectorAll(".admin-nav__item[data-view]");
const views = document.querySelectorAll(".admin-view");
const previewPanel = document.querySelector(".preview-panel");

function showView(name) {
  // Switch active view
  views.forEach((v) => v.classList.remove("is-active"));
  document.querySelector(`#view-${name}`)?.classList.add("is-active");

  // Highlight active nav button
  navButtons.forEach((b) => b.classList.remove("is-active"));
  document
    .querySelector(`.admin-nav__item[data-view="${name}"]`)
    ?.classList.add("is-active");

  // Default: show preview (unless suggestions)
  previewPanel?.classList.remove("is-hidden");

  if (name === "events") {
    setPreview("/html/church/events.html");
  } else if (name === "faculty") {
    setPreview("/html/school/faculty.html");
  } else if (name === "pastors") {
    setPreview("/html/church/team.html");
  } else if (name === "suggestions") {
    // Hide preview completely for Suggestions
    previewPanel?.classList.add("is-hidden");
  }
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});


 // -------------------------
// Preview panel (iframe)
// -------------------------
const previewFrame = document.getElementById("previewFrame");
const refreshPreviewBtn = document.getElementById("refreshPreviewBtn");

function setPreview(url) {
  if (!previewFrame) return;
  // Cache-bust so edits show immediately
  previewFrame.src = `${url}?t=${Date.now()}`;
}

refreshPreviewBtn?.addEventListener("click", () => {
  if (!previewFrame?.src) return;
  const base = previewFrame.src.split("?")[0];
  previewFrame.src = `${base}?t=${Date.now()}`;
});

// -------------------------
// Suggestions UI (FIXED: no listener loop + status colors)
// -------------------------
const suggestionsList = document.getElementById("suggestionsList");
const toggleAllBtn = document.getElementById("toggleAllBtn");
const addSuggestionBtn = document.getElementById("addSuggestionBtn");
const suggestionsHint = document.getElementById("suggestionsHint");

const modalBackdrop = document.getElementById("suggestionModal");
const closeSuggestionModal = document.getElementById("closeSuggestionModal");
const cancelSuggestion = document.getElementById("cancelSuggestion");
const suggestionForm = document.getElementById("suggestionForm");

const changeType = document.getElementById("changeType");
const wordingFields = document.getElementById("wordingFields");
const descriptionField = document.getElementById("descriptionField");

let allOpen = false;
let suggestionsCache = [];

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusLabel(status) {
  if (status === "in_progress") return "In progress";
  if (status === "done") return "Done";
  return "New";
}

function bellIconSvg() {
  return `
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5L3 18v1h18v-1l-2-2Z"></path>
    </svg>
  `;
}

function cardStatusClass(status) {
  if (status === "in_progress") return "suggestion-card--in-progress";
  if (status === "done") return "suggestion-card--done";
  return "";
}

function renderSuggestions() {
  if (!suggestionsList) return;

  const items = allOpen ? suggestionsCache : suggestionsCache.slice(0, 3);

  suggestionsList.innerHTML = items
    .map((s) => {
      const title = `${s.page} • ${s.changeType}`;
      const when = s.createdAt ? new Date(s.createdAt).toLocaleString() : "";
      let body = "";

      if (s.changeType === "wording") {
        body = `
          <div><strong>From:</strong> ${escapeHtml(s.fromText)}</div>
          <div><strong>To:</strong> ${escapeHtml(s.toText)}</div>
        `;
      } else {
        body = `<div>${escapeHtml(s.description)}</div>`;
      }

      const statusClass = cardStatusClass(s.status);

      return `
        <div class="suggestion-card ${statusClass}" data-id="${s.id}">
          <div class="suggestion-card__top">
            <div>
              <div class="suggestion-card__title">${escapeHtml(title)}</div>
              <div class="suggestion-card__meta">
                ${escapeHtml(when)} • ${escapeHtml(statusLabel(s.status))}
              </div>
            </div>

            <div class="suggestion-actions">
              <button class="icon-btn js-inprogress" type="button" title="Toggle In progress">
                ${bellIconSvg()}
                <span class="icon-btn__label ${s.status === "in_progress" ? "" : "is-hidden"}">In progress</span>
              </button>

              <button class="btn-mini js-done" type="button" title="Mark done">Done</button>

              <button class="btn-mini btn-mini--danger js-delete" type="button" title="Delete">Delete</button>
            </div>
          </div>

          <div class="suggestion-card__body">${body}</div>
        </div>
      `;
    })
    .join("");

  if (toggleAllBtn) toggleAllBtn.textContent = allOpen ? "Show recent" : "View all";
  if (suggestionsHint) {
    suggestionsHint.textContent = allOpen
      ? `Showing all ${suggestionsCache.length} suggestions.`
      : `Showing the most recent 3 suggestions.`;
  }
}

async function loadSuggestions() {
  const res = await fetch("/admin/suggestions", {
    headers: { Accept: "application/json" },
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) throw new Error("Failed to load suggestions");

  suggestionsCache = await res.json();
  renderSuggestions();
}

// ✅ IMPORTANT: these MUST be outside loadSuggestions()
async function setSuggestionStatus(id, status) {
  const res = await fetch(`/admin/suggestions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Failed to update status");
}

async function deleteSuggestion(id) {
  const res = await fetch(`/admin/suggestions/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete");
}

// ✅ attach click handler ONCE (prevents confirm loop)
if (!window.__mlSuggestionsHandlerAttached) {
  window.__mlSuggestionsHandlerAttached = true;

  suggestionsList?.addEventListener("click", async (e) => {
    const card = e.target.closest(".suggestion-card");
    if (!card) return;

    const id = Number(card.dataset.id);
    if (!Number.isInteger(id)) return;

    try {
      if (e.target.closest(".js-inprogress")) {
        const s = suggestionsCache.find((x) => x.id === id);
        const next = s?.status === "in_progress" ? "new" : "in_progress";
        await setSuggestionStatus(id, next);
        await loadSuggestions();
        return;
      }

      if (e.target.closest(".js-done")) {
        await setSuggestionStatus(id, "done");
        await loadSuggestions();
        return;
      }

      if (e.target.closest(".js-delete")) {
        const ok = confirm("Delete this suggestion forever?");
        if (!ok) return;

        // remove immediately so it "goes away forever" visually
        card.remove();
        suggestionsCache = suggestionsCache.filter((x) => x.id !== id);

        // delete from DB
        await deleteSuggestion(id);

        // refresh list to keep counts correct
        await loadSuggestions();
        return;
      }
    } catch (err) {
      console.error(err);
      alert("Action failed. Check server logs.");
    }
  });
}

function openModal() {
  if (!modalBackdrop) return;
  modalBackdrop.classList.add("is-open");
  modalBackdrop.setAttribute("aria-hidden", "false");
}

function closeModal() {
  if (!modalBackdrop) return;
  modalBackdrop.classList.remove("is-open");
  modalBackdrop.setAttribute("aria-hidden", "true");

  suggestionForm?.reset();
  wordingFields?.classList.add("is-hidden");
  descriptionField?.classList.remove("is-hidden");
}

function applyConditionalFields() {
  if (!changeType) return;
  const val = changeType.value;

  if (val === "wording") {
    wordingFields?.classList.remove("is-hidden");
    descriptionField?.classList.add("is-hidden");
  } else {
    wordingFields?.classList.add("is-hidden");
    descriptionField?.classList.remove("is-hidden");
  }
}

toggleAllBtn?.addEventListener("click", () => {
  allOpen = !allOpen;
  renderSuggestions();
});

addSuggestionBtn?.addEventListener("click", openModal);
closeSuggestionModal?.addEventListener("click", closeModal);
cancelSuggestion?.addEventListener("click", closeModal);

modalBackdrop?.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

changeType?.addEventListener("change", applyConditionalFields);

suggestionForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData(suggestionForm);
  const payload = {
    page: formData.get("page"),
    changeType: formData.get("changeType"),
    fromText: formData.get("fromText"),
    toText: formData.get("toText"),
    description: formData.get("description"),
  };

  // cleanup based on type
  if (payload.changeType === "wording") {
    payload.description = "";
  } else {
    payload.fromText = "";
    payload.toText = "";
  }

  const res = await fetch("/admin/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    alert("Could not save suggestion. Check server route /admin/suggestions.");
    return;
  }

  closeModal();
  await loadSuggestions();
});
  
// -------------------------
// Initial load behavior
// -------------------------
showView("faculty");

loadSuggestions().catch((err) => {
  console.error(err);
  if (!suggestionsList) return;

  suggestionsList.innerHTML = `
    <div class="suggestion-card">
      <div class="suggestion-card__title">Suggestions not loading yet</div>
      <div class="suggestion-card__body">
        Your frontend is ready, but you still need backend routes:
        <br/>GET /admin/suggestions and POST /admin/suggestions
      </div>
    </div>
  `;
});
})();

// -------------------------
// Logout (force redirect)
// -------------------------
(() => {
  const btn = document.getElementById("logoutBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    try {
      await fetch("/admin/logout", {
        method: "POST",
        credentials: "include",
        headers: { Accept: "text/html" },
      });
    } catch (e) {
      // ignore
    }

    // always go to login page
    window.location.href = "/admin/login";
  });
})();