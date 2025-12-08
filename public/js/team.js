// public/js/team.js

// ---------- ADMIN CHECK (same pattern as faculty.js) ----------
async function isAdminLoggedIn() {
  try {
    const res = await fetch("/admin/check");
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.loggedIn;
  } catch (e) {
    console.error("Failed admin check:", e);
    return false;
  }
}

let teamData = [];
let isAdmin = false;

// Modal state
let teamModalEl;
let teamModalNameInput;
let teamModalSubjectInput;
let teamModalBioTextarea;
let teamModalPhotoInput;
let teamModalPhotoPreview;
let teamModalSaveBtn;
let teamModalDeleteBtn;
let teamModalCloseBtn;

let currentEditIndex = null; // null = new, number = existing
let currentEditCard = null;

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

  // Close handlers
  teamModalCloseBtn.addEventListener("click", closeTeamModal);
  teamModalEl.addEventListener("click", (e) => {
    if (e.target === teamModalEl) closeTeamModal();
  });

  // SAVE
  teamModalSaveBtn.addEventListener("click", async () => {
    const name = teamModalNameInput.value.trim() || "Name";
    const subject = teamModalSubjectInput.value.trim() || "Pastor";
    const bioRaw = teamModalBioTextarea.value || "";
    const imageSrc = teamModalPhotoPreview.src || "/images/Placeholder.jpg";

    const body = {
      name,
      subject,
      image: imageSrc.replace(/^https?:\/\/[^/]+/, ""), // strip origin if present
      bio: bioRaw,
    };

    try {
      if (currentEditIndex === null) {
        // CREATE
        const res = await fetch("/api/team", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Failed to add team member");
      } else {
        // UPDATE
        const res = await fetch(`/api/team/${currentEditIndex}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Failed to update team member");
      }

      await loadTeam(); // refresh cards
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
      const res = await fetch(`/api/team/${currentEditIndex}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete team member");
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

    const formData = new FormData();
    formData.append("image", file);
    formData.append("index", currentEditIndex);

    try {
      const res = await fetch("/api/team/upload-image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!data.success) {
        alert("Failed to upload image.");
        return;
      }

      const newSrc = "/" + data.image.replace(/^\/+/, "") + "?t=" + Date.now();
      teamModalPhotoPreview.src = newSrc;

      // Update card image if we still have a reference
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
    // new entry
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
    teamModalPhotoPreview.src =
      member.image || "/images/Placeholder.jpg";

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
    img.src = member.image || "/images/Placeholder.jpg";
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
      p.textContent = pText;
      bioDiv.appendChild(p);
    });

    card.appendChild(img);
    card.appendChild(h3);
    card.appendChild(h4);
    card.appendChild(bioDiv);

    // ✅ Admin Edit button, just like faculty page
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
    const res = await fetch("/api/team");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
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

  // Add button
  const addBtn = document.getElementById("add-team-btn");
  if (isAdmin && addBtn) {
    addBtn.style.display = "inline-block";
    addBtn.addEventListener("click", () => {
      openTeamModal(null, null); // new member
    });
  }
}

document.addEventListener("DOMContentLoaded", initTeamPage);
