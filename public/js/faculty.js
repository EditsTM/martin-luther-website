// public/js/faculty.js

// ---------- ADMIN CHECK ----------
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

// ---------- LOAD FACULTY DATA ----------
async function loadFacultyData() {
  try {
    const res = await fetch("/admin/faculty.json");
    if (!res.ok) throw new Error("Failed to fetch faculty.json");
    const data = await res.json();

// 🔥 FIX #1 — FORCE correct admin array (backend uses "admin", frontend uses "admins")
data.admin = Array.isArray(data.admin) ? data.admin : [];
data.admins = data.admin; 


    if (!data.teachers) data.teachers = [];

    return data;
  } catch (e) {
    console.error("Failed to load faculty data:", e);
    return {
      principal: {
        name: "Name",
        subject: "Principal",
        image: "/images/faculty/PlaceHolder.jpg"
      },
      admins: [],
      teachers: []
    };
  }
}

// ---------- MODAL STATE ----------
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

  // Close handlers
  modalCloseBtn.addEventListener("click", closeEditModal);
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) closeEditModal();
  });

  // SAVE
  modalSaveBtn.addEventListener("click", async () => {
    if (!currentEditContext) return;

    const { role, index, cardElement } = currentEditContext;

    const name = modalNameInput.value.trim() || "Name";
    const subject =
      modalSubjectInput.value.trim() ||
      (role === "principal" ? "Principal" : "Subject");

    let url = "/admin/faculty/update";
    let payload = { role, name, subject };

    if (role === "principal") {
    } else if (role === "teacher") {
      payload.index = index;
    } else if (role === "admin") {
      url = "/admin/faculty/update-admin";
      payload = { index, name, subject };
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const out = await res.json();
      if (!out.success) {
        alert("Failed to save changes.");
        return;
      }

      cardElement.querySelector(".faculty-name").textContent = name;
      cardElement.querySelector(".faculty-subject").textContent = subject;

      closeEditModal();
    } catch (err) {
      console.error("Update error:", err);
      alert("Error saving.");
    }
  });

  // DELETE
  modalDeleteBtn.addEventListener("click", async () => {
    if (!currentEditContext) return;

    const { role, index, cardElement } = currentEditContext;

    if (role === "principal") return;

    if (!confirm("Are you sure you want to delete this entry?")) return;

    let url = "";
    const idx = Number(index);

    if (role === "teacher") {
      url = "/admin/faculty/delete";
    } else if (role === "admin") {
      url = "/admin/faculty/delete-admin";
    } else {
      return;
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: idx }),
      });

      const out = await res.json();
      if (!out.success) {
        alert("Failed to delete.");
        return;
      }

      cardElement.remove();

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

    const formData = new FormData();
    formData.append("image", file);
    formData.append("role", role);
    if (role !== "principal") formData.append("index", index);

    try {
      const res = await fetch("/admin/faculty/upload-image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!data.success) {
        alert("Failed to upload image.");
        return;
      }

      const newSrc = "/" + data.image + "?t=" + Date.now();

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
  if (!modalInitialized) {
    setupEditModal();
  }
  if (!modalEl) return;

  currentEditContext = context;

  modalNameInput.value = context.name || "";
  modalSubjectInput.value = context.subject || "";
  modalPhotoPreview.src =
    context.imageSrc || "/images/faculty/PlaceHolder.jpg";

  modalDeleteBtn.style.display =
    context.role === "principal" ? "none" : "inline-block";

  modalEl.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeEditModal() {
  if (!modalEl) return;
  modalEl.classList.remove("open");
  document.body.style.overflow = "";
  currentEditContext = null;
  modalPhotoInput.value = "";
}

// ---------- CARD CREATION ----------
function createFacultyCard(person, options) {
  const { role, index, isAdmin } = options;

  const card = document.createElement("article");
  card.className =
    "faculty-card" + (role === "principal" ? " principal-card" : "");
  card.dataset.role = role;

  if (role !== "principal") card.dataset.index = index;

  const imgWrapper = document.createElement("div");
  imgWrapper.className = "faculty-image-wrapper";

  const img = document.createElement("img");

  // 🔥 FIX #2 — Correct default image behavior (no double slash)
  img.src = person.image || "/images/faculty/PlaceHolder.jpg";

  img.alt = person.name ? `${person.name} photo` : "Faculty photo";
  imgWrapper.appendChild(img);

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
  const isAdmin = await isAdminLoggedIn();
  if (isAdmin) document.body.classList.add("admin-mode");

  const data = await loadFacultyData();

  const principalContainer = document.getElementById(
    "principal-card-container"
  );
  const adminGrid = document.getElementById("admin-grid");
  const facultyGrid = document.getElementById("faculty-grid");
  const addAdminBtn = document.getElementById("add-admin-btn");
  const addTeacherBtn = document.getElementById("add-teacher-btn");

  setupEditModal();

  // PRINCIPAL
  principalContainer.innerHTML = "";
  principalContainer.appendChild(
    createFacultyCard(data.principal, { role: "principal", isAdmin })
  );

  // ADMINS
  adminGrid.innerHTML = "";
  data.admins.forEach((a, idx) => {
    adminGrid.appendChild(
      createFacultyCard(a, { role: "admin", index: idx, isAdmin })
    );
  });

  // TEACHERS
  facultyGrid.innerHTML = "";
  data.teachers.forEach((t, idx) => {
    facultyGrid.appendChild(
      createFacultyCard(t, { role: "teacher", index: idx, isAdmin })
    );
  });

  // ADD ADMIN
  if (isAdmin && addAdminBtn) {
    addAdminBtn.style.display = "inline-block";
    addAdminBtn.addEventListener("click", async () => {
      try {
        const res = await fetch("/admin/faculty/add-admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const out = await res.json();
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
        const res = await fetch("/admin/faculty/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "teacher" }),
        });
        const out = await res.json();
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
}

document.addEventListener("DOMContentLoaded", initFacultyPage);
