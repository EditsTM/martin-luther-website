// public/js/team.js
/* =========================================================
   SECURITY IMPROVEMENTS (front-end only)
   - Send cookies reliably with credentials: "same-origin"
   - Disable caching on admin/session-ish requests (no-store)
   - Consistent JSON fetch + error handling
   - Optional CSRF header support (won't break if server ignores it)
   - Client-side file checks for uploads (server must still validate)
   - Basic image-path allowlisting to avoid weird paths being stored
   ========================================================= */

// ---------- SECURITY HELPERS ----------
function getCsrfToken() {
  // Supports: <meta name="csrf-token" content="..."> (optional)
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta?.getAttribute("content") || "";
}

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
        if (err?.message) msg = err.message;
      }
    } catch (_) {}
    throw new Error(msg);
  }

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) throw new Error("Expected JSON response.");

  return res.json();
}

async function postJson(url, payload, method = "POST") {
  const csrf = getCsrfToken();
  const headers = { "Content-Type": "application/json" };
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return fetchJson(url, {
    method,
    headers,
    body: JSON.stringify(payload),
  });
}

async function deleteJson(url) {
  const csrf = getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return fetchJson(url, {
    method: "DELETE",
    headers,
  });
}

async function postFormData(url, formData) {
  const csrf = getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return fetchJson(url, {
    method: "POST",
    headers,
    body: formData,
  });
}

function normalizeImagePath(path, fallback = "/images/Placeholder.jpg") {
  // Allow only site-relative images under /images/
  // (Prevents accidental storage of odd/unsafe paths.)
  const p = String(path || "").trim();
  if (!p) return fallback;

  // Strip origin if somehow present
  const noOrigin = p.replace(/^https?:\/\/[^/]+/i, "");

  // Ensure starts with /
  const rel = noOrigin.startsWith("/") ? noOrigin : "/" + noOrigin;

  return rel.startsWith("/images/") ? rel : fallback;
}

// ---------- ADMIN CHECK ----------
// NOTE: UI-only. Backend must still enforce admin permissions on /api/team routes.
async function isAdminLoggedIn() {
  try {
    const data = await fetchJson("/admin/check");
    return !!data.loggedIn;
  } catch (e) {
    console.error("Failed admin check:", e);
    return false;
  }
}

let teamData = [];
let isAdmin = false;

// Modal state (cached DOM elements + current editing context)
let teamModalEl;
let teamModalNameInput;
let teamModalSubjectInput;
let teamModalBioTextarea;
let teamModalPhotoInput;
let teamModalPhotoPreview;
let teamModalSaveBtn;
let teamModalDeleteBtn;
let teamModalCloseBtn;

let currentEditIndex = null; // null = new member, number = existing member index
let currentEditCard = null;  // reference to the card being edited (for instant UI updates)

// ---------- MODAL SETUP ----------
function setupTeamModal() {
  teamModalEl = document.getElementById("team-edit-modal");
  if (!teamModalEl) return;

  teamModalNameInput = document.getElementById("team-modal-name");
  teamModalSubjectInput = document.getElementById("team-modal-subject");
  teamModalBioTextarea = document.getElementById("team-modal-bio");
  teamModalPhotoInput = document.getElementById("team-modal-photo-input");
  teamModalPhotoPreview = document.getElementById("team-modal-photo-preview");
  teamModalSaveBtn = document.getElementById("team-modal-save-btn");
  teamModalDeleteBtn = document.getElementById("team-modal-delete-btn");
  teamModalCloseBtn = document.getElementById("team-modal-close-btn");

  if (
    !teamModalNameInput ||
    !teamModalSubjectInput ||
    !teamModalBioTextarea ||
    !teamModalPhotoInput ||
    !teamModalPhotoPreview ||
    !teamModalSaveBtn ||
    !teamModalDeleteBtn ||
    !teamModalCloseBtn
  ) {
    console.warn("Some team modal elements are missing.");
    return;
  }

  // Close modal via "X" or clicking the overlay background
  teamModalCloseBtn.addEventListener("click", closeTeamModal);
  teamModalEl.addEventListener("click", (e) => {
    if (e.target === teamModalEl) closeTeamModal();
  });

  // SAVE (create or update)
  teamModalSaveBtn.addEventListener("click", async () => {
    const name = teamModalNameInput.value.trim() || "Name";
    const subject = teamModalSubjectInput.value.trim() || "Pastor";
    const bioRaw = teamModalBioTextarea.value || "";

    // Only store allowlisted /images/... paths (prevents weird paths being saved)
    const imageSrc = normalizeImagePath(
      teamModalPhotoPreview.src || "/images/Placeholder.jpg"
    );

    const body = {
      name,
      subject,
      image: imageSrc,
      bio: bioRaw,
    };

    try {
      if (currentEditIndex === null) {
        // CREATE new member
        const out = await postJson("/api/team", body, "POST");
        // If your backend returns {success:false}, handle it
        if (out && out.success === false) throw new Error(out.message || "Failed to add team member");
      } else {
        // UPDATE existing member by index
        const out = await postJson(`/api/team/${currentEditIndex}`, body, "PUT");
        if (out && out.success === false) throw new Error(out.message || "Failed to update team member");
      }

      await loadTeam();
      closeTeamModal();
    } catch (err) {
      console.error(err);
      alert("Error saving team member.");
    }
  });

  // DELETE
  teamModalDeleteBtn.addEventListener("click", async () => {
    if (currentEditIndex === null) {
      closeTeamModal();
      return;
    }

    if (!confirm("Are you sure you want to delete this team member?")) return;

    try {
      const out = await deleteJson(`/api/team/${currentEditIndex}`);
      if (out && out.success === false) throw new Error(out.message || "Failed to delete team member");

      await loadTeam();
      closeTeamModal();
    } catch (err) {
      console.error(err);
      alert("Error deleting team member.");
    }
  });

  // PHOTO UPLOAD
  teamModalPhotoInput.addEventListener("change", async () => {
    if (currentEditIndex === null) {
      alert("Please save this member first, then update the photo.");
      teamModalPhotoInput.value = "";
      return;
    }

    const file = teamModalPhotoInput.files[0];
    if (!file) return;

    // Client-side guardrails (server must still enforce type/size!)
    const MAX_BYTES = 5 * 1024 * 1024; // 5MB
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      alert("Please upload a JPG, PNG, WEBP, or GIF image.");
      teamModalPhotoInput.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      alert("Image is too large (max 5MB).");
      teamModalPhotoInput.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("image", file);
    formData.append("index", currentEditIndex);

    try {
      const data = await postFormData("/api/team/upload-image", formData);
      if (!data.success) {
        alert("Failed to upload image.");
        return;
      }

      // Only accept a safe /images/... relative path coming back from server
      const safeImg = normalizeImagePath("/" + String(data.image || "").replace(/^\/+/, ""));
      const newSrc = safeImg + "?t=" + Date.now();

      teamModalPhotoPreview.src = newSrc;

      if (currentEditCard) {
        const img = currentEditCard.querySelector("img");
        if (img) img.src = newSrc;
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Error uploading image.");
    } finally {
      teamModalPhotoInput.value = "";
    }
  });
}

function openTeamModal(index, cardElement) {
  if (!teamModalEl) setupTeamModal();
  if (!teamModalEl) return;

  currentEditIndex = index;
  currentEditCard = cardElement || null;

  if (index === null) {
    teamModalNameInput.value = "";
    teamModalSubjectInput.value = "";
    teamModalBioTextarea.value = "";
    teamModalPhotoPreview.src = "/images/Placeholder.jpg";
    teamModalDeleteBtn.style.display = "none";
  } else {
    const member = teamData[index];

    const bioArray = Array.isArray(member.bio)
      ? member.bio
      : (member.bio || "")
          .split("\n\n")
          .map((p) => p.trim())
          .filter((p) => p.length > 0);

    teamModalNameInput.value = member.name || "";
    teamModalSubjectInput.value = member.subject || "";
    teamModalBioTextarea.value = bioArray.join("\n\n");

    // Normalize image so preview can't point somewhere unexpected
    teamModalPhotoPreview.src = normalizeImagePath(member.image);

    teamModalDeleteBtn.style.display = "inline-block";
  }

  teamModalEl.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeTeamModal() {
  if (!teamModalEl) return;
  teamModalEl.classList.remove("open");
  document.body.style.overflow = "";
  currentEditIndex = null;
  currentEditCard = null;
  if (teamModalPhotoInput) teamModalPhotoInput.value = "";
}

// ---------- RENDER TEAM CARDS ----------
function renderTeam() {
  const grid = document.getElementById("teamGrid");
  if (!grid) return;

  grid.innerHTML = "";

  if (!teamData || !Array.isArray(teamData) || teamData.length === 0) {
    grid.innerHTML =
      '<p style="grid-column: 1 / -1; text-align:center; padding:40px;">No team members yet.</p>';
    return;
  }

  teamData.forEach((member, index) => {
    const card = document.createElement("article");
    card.className = "team-member";
    card.dataset.index = index;

    const img = document.createElement("img");
    img.src = normalizeImagePath(member.image);
    img.alt = member.name ? `${member.name} photo` : "Team member photo";

    const h3 = document.createElement("h3");
    h3.textContent = member.name || "Name";

    const h4 = document.createElement("h4");
    h4.textContent = member.subject || "Pastor";

    const bioDiv = document.createElement("div");
    bioDiv.className = "bio-text";

    const bioArray = Array.isArray(member.bio)
      ? member.bio
      : (member.bio || "")
          .split("\n\n")
          .map((p) => p.trim())
          .filter((p) => p.length > 0);

    bioArray.forEach((pText) => {
      const p = document.createElement("p");
      p.textContent = pText; // safe against HTML injection
      bioDiv.appendChild(p);
    });

    card.appendChild(img);
    card.appendChild(h3);
    card.appendChild(h4);
    card.appendChild(bioDiv);

    if (isAdmin) {
      const editBtn = document.createElement("button");
      editBtn.className = "edit-btn admin-only";
      editBtn.textContent = "Edit";

      editBtn.addEventListener("click", () => {
        openTeamModal(index, card);
      });

      card.appendChild(editBtn);
    }

    grid.appendChild(card);
  });
}

// ---------- LOAD TEAM DATA ----------
async function loadTeam() {
  try {
    // Use helper so cookies are included + no caching
    const data = await fetchJson("/api/team");
    teamData = data.team || [];
    renderTeam();
  } catch (err) {
    console.error("Error loading team:", err);
    const grid = document.getElementById("teamGrid");
    if (grid) {
      grid.innerHTML =
        '<p style="grid-column: 1 / -1; text-align:center; padding:40px;">Failed to load team data.</p>';
    }
  }
}

// ---------- INIT ----------
async function initTeamPage() {
  isAdmin = await isAdminLoggedIn();
  if (isAdmin) document.body.classList.add("admin-mode");

  setupTeamModal();
  await loadTeam();

  const addBtn = document.getElementById("add-team-btn");
  if (isAdmin && addBtn) {
    addBtn.style.display = "inline-block";
    addBtn.addEventListener("click", () => {
      openTeamModal(null, null);
    });
  }
}

document.addEventListener("DOMContentLoaded", initTeamPage);
