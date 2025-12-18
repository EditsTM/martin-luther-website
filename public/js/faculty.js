// public/js/faculty.js

function getCsrfToken() {
  // If you later add: <meta name="csrf-token" content="...">
  // this grabs it so we can send it with POST requests.
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta?.getAttribute("content") || "";
}

async function fetchJson(url, options = {}) {
  // Centralized fetch for JSON:
  // - credentials ensures session cookies are included (admin auth)
  // - no-store avoids stale admin responses being cached
  const res = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
  });

  // Standardize error handling (so callers can just try/catch)
  if (!res.ok) {
    // If the server returns a JSON error body with { message }, show it
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

  // Guard: we expect JSON from these endpoints
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error("Expected JSON response.");
  }

  return res.json();
}

async function postJson(url, payload) {
  // Helper for JSON POSTs (optionally includes CSRF token header)
  const csrf = getCsrfToken();
  const headers = { "Content-Type": "application/json" };
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return fetchJson(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

async function postFormData(url, formData) {
  // Helper for multipart/form-data uploads (browser sets Content-Type boundary)
  const csrf = getCsrfToken();
  const headers = {};
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return fetchJson(url, {
    method: "POST",
    headers,
    body: formData,
  });
}

// ---------- ADMIN CHECK ----------
async function isAdminLoggedIn() {
  // NOTE: This only controls UI (show/hide edit buttons).
  // Your backend MUST still enforce admin auth on every /admin route.
  try {
    const data = await fetchJson("/admin/check");
    return !!data.loggedIn;
  } catch (e) {
    console.error("Failed admin check:", e);
    return false;
  }
}

// ---------- LOAD FACULTY DATA ----------
async function loadFacultyData() {
  try {
    const data = await fetchJson("/admin/faculty.json");

    // Normalize admin arrays because the backend uses "admin" but UI expects "admins"
    data.admin = Array.isArray(data.admin) ? data.admin : [];
    data.admins = data.admin;

    // Ensure arrays exist so the UI can safely iterate without crashing
    if (!data.teachers) data.teachers = [];
    if (!data.staff) data.staff = [];

    return data;
  } catch (e) {
    console.error("Failed to load faculty data:", e);

    // Safe fallback so the page still renders even if fetch fails
    return {
      principal: {
        name: "Name",
        subject: "Principal",
        image: "/images/faculty/PlaceHolder.jpg",
      },
      admins: [],
      teachers: [],
      staff: [],
    };
  }
}

// ---------- MODAL STATE ----------
// We store what card is being edited so Save/Delete/Upload know what to update.
let currentEditContext = null;
let modalInitialized = false;

let modalEl;
let modalNameInput;
let modalSubjectInput;
let modalPhotoInput;
let modalPhotoPreview;
let modalSaveBtn;
let modalDeleteBtn;
let modalCloseBtn;

// ---------- MODAL SETUP ----------
function setupEditModal() {
  // Query modal elements once and wire up handlers once
  modalEl = document.getElementById("faculty-edit-modal");
  if (!modalEl) return;

  modalNameInput = document.getElementById("modal-name");
  modalSubjectInput = document.getElementById("modal-subject");
  modalPhotoInput = document.getElementById("modal-photo-input");
  modalPhotoPreview = document.getElementById("modal-photo-preview");
  modalSaveBtn = document.getElementById("modal-save-btn");
  modalDeleteBtn = document.getElementById("modal-delete-btn");
  modalCloseBtn = document.getElementById("modal-close-btn");

  if (
    !modalNameInput ||
    !modalSubjectInput ||
    !modalPhotoInput ||
    !modalPhotoPreview ||
    !modalSaveBtn ||
    !modalDeleteBtn ||
    !modalCloseBtn
  ) {
    console.warn("Some modal elements are missing.");
    return;
  }

  // Close modal: "X" button and clicking the overlay background
  modalCloseBtn.addEventListener("click", closeEditModal);
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) closeEditModal();
  });

  // SAVE CHANGES
  modalSaveBtn.addEventListener("click", async () => {
    if (!currentEditContext) return;

    const { role, index, cardElement } = currentEditContext;

    // Basic normalization so empty inputs don’t break layout
    const name = modalNameInput.value.trim() || "Name";
    const subject =
      modalSubjectInput.value.trim() ||
      (role === "principal" ? "Principal" : "Subject");

    // Different roles use different endpoints/payloads
    let url = "/admin/faculty/update";
    let payload = { role, name, subject };

    if (role === "principal") {
      // principal uses /faculty/update with no index
    } else if (role === "teacher") {
      payload.index = index;
    } else if (role === "staff") {
      payload.index = index; // staff mirrors teacher behavior
    } else if (role === "admin") {
      url = "/admin/faculty/update-admin";
      payload = { index, name, subject };
    }

    try {
      const out = await postJson(url, payload);
      if (!out.success) {
        alert("Failed to save changes.");
        return;
      }

      // Update UI immediately without reloading the whole page
      cardElement.querySelector(".faculty-name").textContent = name;
      cardElement.querySelector(".faculty-subject").textContent = subject;

      closeEditModal();
    } catch (err) {
      console.error("Update error:", err);
      alert("Error saving.");
    }
  });

  // DELETE ENTRY
  modalDeleteBtn.addEventListener("click", async () => {
    if (!currentEditContext) return;

    const { role, index, cardElement } = currentEditContext;

    // Principal is not deletable in this UI
    if (role === "principal") return;

    if (!confirm("Are you sure you want to delete this entry?")) return;

    // Convert index to a number before sending to server
    const idx = Number(index);
    let url = "";

    if (role === "teacher") {
      url = "/admin/faculty/delete";
    } else if (role === "admin") {
      url = "/admin/faculty/delete-admin";
    } else if (role === "staff") {
      url = "/admin/faculty/delete-staff";
    } else {
      return;
    }

    try {
      const out = await postJson(url, { index: idx });
      if (!out.success) {
        alert("Failed to delete.");
        return;
      }

      // Remove the deleted card from the DOM
      cardElement.remove();

      // Re-index remaining cards so future edits/deletes map to correct array indexes
      document
        .querySelectorAll(`.faculty-card[data-role="${role}"]`)
        .forEach((c, newIndex) => {
          c.dataset.index = newIndex;
        });

      closeEditModal();
    } catch (err) {
      console.error("Delete error:", err);
      alert("Error deleting.");
    }
  });

  // PHOTO UPLOAD
  modalPhotoInput.addEventListener("change", async () => {
    if (!currentEditContext) return;
    const { role, index, cardElement } = currentEditContext;

    const file = modalPhotoInput.files[0];
    if (!file) return;

    // Client-side guardrails to prevent obvious bad uploads.
    // IMPORTANT: These do NOT replace server-side validation.
    const MAX_BYTES = 5 * 1024 * 1024; // 5MB
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];

    if (!allowed.includes(file.type)) {
      alert("Please upload a JPG, PNG, WEBP, or GIF image.");
      modalPhotoInput.value = "";
      return;
    }

    if (file.size > MAX_BYTES) {
      alert("Image is too large (max 5MB).");
      modalPhotoInput.value = "";
      return;
    }

    // Send file + role + index (index not needed for principal)
    const formData = new FormData();
    formData.append("image", file);
    formData.append("role", role);
    if (role !== "principal") formData.append("index", index);

    try {
      const data = await postFormData("/admin/faculty/upload-image", formData);
      if (!data.success) {
        alert("Failed to upload image.");
        return;
      }

      // Defensive cleanup: avoid weird leading slashes or empty paths
      const imagePath = String(data.image || "").replace(/^\/+/, "");
      if (!imagePath) {
        alert("Upload succeeded but no image path returned.");
        return;
      }

      // Cache-bust so the browser shows the new image immediately
      const newSrc = "/" + imagePath + "?t=" + Date.now();

      // Update both modal preview and the card image
      modalPhotoPreview.src = newSrc;
      cardElement.querySelector("img").src = newSrc;
    } catch (err) {
      console.error("Upload error:", err);
      alert("Error uploading image.");
    }
  });

  modalInitialized = true;
}

function openEditModal(context) {
  // Lazily initialize (safe if initFacultyPage calls it early too)
  if (!modalInitialized) {
    setupEditModal();
  }
  if (!modalEl) return;

  // Store context so Save/Delete/Upload know what they are operating on
  currentEditContext = context;

  // Pre-fill modal fields from the card
  modalNameInput.value = context.name || "";
  modalSubjectInput.value = context.subject || "";
  modalPhotoPreview.src = context.imageSrc || "/images/faculty/PlaceHolder.jpg";

  // Hide delete for principal
  modalDeleteBtn.style.display =
    context.role === "principal" ? "none" : "inline-block";

  // Show modal and prevent background scroll
  modalEl.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeEditModal() {
  if (!modalEl) return;

  // Hide modal and re-enable scrolling
  modalEl.classList.remove("open");
  document.body.style.overflow = "";

  // Clear state for safety
  currentEditContext = null;
  modalPhotoInput.value = "";
}

// ---------- CARD CREATION ----------
function createFacultyCard(person, options) {
  const { role, index, isAdmin } = options;

  // Each person becomes a "faculty-card"
  const card = document.createElement("article");
  card.className =
    "faculty-card" + (role === "principal" ? " principal-card" : "");
  card.dataset.role = role;

  // Only non-principal cards have array indexes
  if (role !== "principal") card.dataset.index = index;

  const imgWrapper = document.createElement("div");
  imgWrapper.className = "faculty-image-wrapper";

  const img = document.createElement("img");
  img.src = person.image || "/images/faculty/PlaceHolder.jpg";
  img.alt = person.name ? `${person.name} photo` : "Faculty photo";
  imgWrapper.appendChild(img);

  // Use textContent (not innerHTML) to avoid XSS sinks
  const nameEl = document.createElement("h3");
  nameEl.className = "faculty-name";
  nameEl.textContent = person.name || "Name";

  const subjEl = document.createElement("h4");
  subjEl.className = "faculty-subject";
  subjEl.textContent =
    person.subject || (role === "principal" ? "Principal" : "Subject");

  card.appendChild(imgWrapper);
  card.appendChild(nameEl);
  card.appendChild(subjEl);

  // Admins see an Edit button that opens the modal
  if (isAdmin) {
    const editBtn = document.createElement("button");
    editBtn.className = "edit-btn admin-only";
    editBtn.textContent = "Edit";
    editBtn.style.marginTop = "auto";

    editBtn.addEventListener("click", () => {
      openEditModal({
        role,
        index: role !== "principal" ? Number(card.dataset.index) : null,
        name: nameEl.textContent.trim(),
        subject: subjEl.textContent.trim(),
        imageSrc: img.src,
        cardElement: card,
      });
    });

    card.appendChild(editBtn);
  }

  return card;
}

// ---------- INIT PAGE ----------
async function initFacultyPage() {
  // Determine admin mode first so we can show/hide admin-only UI
  const isAdmin = await isAdminLoggedIn();
  if (isAdmin) document.body.classList.add("admin-mode");

  const data = await loadFacultyData();

  const adminGrid = document.getElementById("admin-grid");
  const facultyGrid = document.getElementById("faculty-grid");
  const staffGrid = document.getElementById("staff-grid");
  const addAdminBtn = document.getElementById("add-admin-btn");
  const addTeacherBtn = document.getElementById("add-teacher-btn");
  const addStaffBtn = document.getElementById("add-staff-btn");

  // Ensure modal handlers exist before any Edit click happens
  setupEditModal();

  // ADMINISTRATION: principal + admins in one grid
  adminGrid.innerHTML = "";
  adminGrid.appendChild(
    createFacultyCard(data.principal, { role: "principal", isAdmin })
  );

  data.admins.forEach((a, idx) => {
    adminGrid.appendChild(
      createFacultyCard(a, { role: "admin", index: idx, isAdmin })
    );
  });

  // FACULTY: teachers grid
  facultyGrid.innerHTML = "";
  data.teachers.forEach((t, idx) => {
    facultyGrid.appendChild(
      createFacultyCard(t, { role: "teacher", index: idx, isAdmin })
    );
  });

  // STAFF: optional grid (only if page has it)
  if (staffGrid) {
    staffGrid.innerHTML = "";
    (data.staff || []).forEach((s, idx) => {
      staffGrid.appendChild(
        createFacultyCard(s, { role: "staff", index: idx, isAdmin })
      );
    });
  }

  // ADD ADMIN
  if (isAdmin && addAdminBtn) {
    addAdminBtn.style.display = "inline-block";
    addAdminBtn.addEventListener("click", async () => {
      try {
        const out = await postJson("/admin/faculty/add-admin", {});
        if (!out.success) return alert("Failed to add admin.");

        const newCard = createFacultyCard(out.admin, {
          role: "admin",
          index: out.index,
          isAdmin: true,
        });

        adminGrid.appendChild(newCard);
        newCard.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (err) {
        console.error("Add admin error:", err);
        alert("Error adding admin.");
      }
    });
  }

  // ADD TEACHER
  if (isAdmin && addTeacherBtn) {
    addTeacherBtn.style.display = "inline-block";
    addTeacherBtn.addEventListener("click", async () => {
      try {
        const out = await postJson("/admin/faculty/add", { role: "teacher" });
        if (!out.success) return alert("Failed to add teacher.");

        const newCard = createFacultyCard(out.teacher, {
          role: "teacher",
          index: out.index,
          isAdmin: true,
        });

        facultyGrid.appendChild(newCard);
        newCard.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (err) {
        console.error("Add teacher error:", err);
        alert("Error adding teacher.");
      }
    });
  }

  // ADD STAFF
  if (isAdmin && addStaffBtn) {
    addStaffBtn.style.display = "inline-block";
    addStaffBtn.addEventListener("click", async () => {
      try {
        // This endpoint already expects POST; we include credentials/no-store/optional CSRF
        const out = await fetchJson("/admin/faculty/add-staff", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: (() => {
            const csrf = getCsrfToken();
            return csrf ? { "X-CSRF-Token": csrf } : {};
          })(),
        });

        if (!out.success) return alert("Failed to add staff.");

        const newCard = createFacultyCard(out.staff, {
          role: "staff",
          index: out.index,
          isAdmin: true,
        });

        if (staffGrid) {
          staffGrid.appendChild(newCard);
          newCard.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } catch (err) {
        console.error("Add staff error:", err);
        alert("Error adding staff.");
      }
    });
  }
}

// Start once the DOM is available
document.addEventListener("DOMContentLoaded", initFacultyPage);
