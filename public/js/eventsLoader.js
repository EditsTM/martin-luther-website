// ✅ public/js/eventsLoader.js
// Loads events and renders them.
// If admin: shows an "Edit" button that opens a modal like your screenshot (photo + Change Photo + fields + Save).

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const escapeHTML = (v) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const escapeHTMLWithBreaks = (v) => escapeHTML(v).replace(/\n/g, "<br>");

    const getTextareaValueExact = (el) => {
      if (!el) return "";
      return String(el.value ?? "").replace(/\r\n/g, "\n"); // normalize newlines
    };

    // ✅ Check admin session
    const sessionRes = await fetch("/admin/check", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const sessionData = await sessionRes.json();
    const isAdmin = sessionData.loggedIn === true;

    // ✅ Load events.json
    const res = await fetch("/content/events.json", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) throw new Error("Failed to load events.json");
    const data = await res.json();

    const grid = document.getElementById("events-grid");
    if (!grid) return;

    const events = Array.isArray(data.events) ? data.events : [];

    // ✅ Modal elements (added in events.html below)
    const modalOverlay = document.getElementById("eventModalOverlay");
    const modal = document.getElementById("eventModal");
    const modalClose = document.getElementById("eventModalClose");
    const modalTitle = document.getElementById("eventModalTitle");

    const modalImg = document.getElementById("eventModalImg");
    const modalChangePhotoBtn = document.getElementById("eventModalChangePhotoBtn");
    const modalFileInput = document.getElementById("eventModalFileInput");
    const modalRemovePhotoBtn = document.getElementById("eventModalRemovePhotoBtn");


    const modalFieldTitle = document.getElementById("eventModalFieldTitle");
    const modalFieldDate = document.getElementById("eventModalFieldDate");
    const modalFieldNotes = document.getElementById("eventModalFieldNotes");

    const modalSaveBtn = document.getElementById("eventModalSaveBtn");
    const modalDeleteBtn = document.getElementById("eventModalDeleteBtn");

    let currentIndex = null;
    let pendingFile = null;

    function openModal(index) {
      currentIndex = index;
      pendingFile = null;
      if (modalFileInput) modalFileInput.value = "";

      const ev = events[index];
      if (!ev) return;

      // image
      let imgPathRaw = String(ev.image || "");
      imgPathRaw = imgPathRaw.startsWith("/") ? imgPathRaw : "/" + imgPathRaw;
      const imgPath = imgPathRaw.startsWith("/images/") ? imgPathRaw : "";
      if (modalImg) modalImg.src = imgPath;

      // fields
      if (modalFieldTitle) modalFieldTitle.value = String(ev.title ?? "");
      if (modalFieldDate) modalFieldDate.value = String(ev.date ?? "");
      if (modalFieldNotes) modalFieldNotes.value = String(ev.notes ?? "");

      if (modalTitle) modalTitle.textContent = "Edit Event";

      if (modalOverlay) modalOverlay.style.display = "flex";
      if (modal) modal.style.display = "block";

      // prevent background scroll
      document.body.style.overflow = "hidden";
    }

// ✅ Allow TAB to indent inside Notes textarea
if (modalFieldNotes) {
  modalFieldNotes.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault(); // stop focus cycling

      const start = modalFieldNotes.selectionStart;
      const end = modalFieldNotes.selectionEnd;

      // Insert 2 spaces (or use "\t" for real tab)
      const indent = "  ";

      // Update textarea value
      modalFieldNotes.value =
        modalFieldNotes.value.substring(0, start) +
        indent +
        modalFieldNotes.value.substring(end);

      // Move cursor forward
      modalFieldNotes.selectionStart = modalFieldNotes.selectionEnd =
        start + indent.length;
    }
  });
}


    function closeModal() {
      if (modalOverlay) modalOverlay.style.display = "none";
      if (modal) modal.style.display = "none";
      document.body.style.overflow = "";
      currentIndex = null;
      pendingFile = null;
    }

    if (modalClose) modalClose.addEventListener("click", closeModal);
    if (modalOverlay) {
      modalOverlay.addEventListener("click", (e) => {
        if (e.target === modalOverlay) closeModal();
      });
    }

    // Change Photo -> open file picker
    if (modalChangePhotoBtn && modalFileInput) {
      modalChangePhotoBtn.addEventListener("click", () => modalFileInput.click());

      modalFileInput.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
          alert("Please select an image file.");
          return;
        }
        pendingFile = file;

        // preview
        if (modalImg) {
          const url = URL.createObjectURL(file);
          modalImg.src = url;
        }
      });
    }

// ✅ Remove Photo button (sets image to blank)
if (modalRemovePhotoBtn) {
  modalRemovePhotoBtn.addEventListener("click", async () => {
    try {
      if (currentIndex === null) return;

      // ✅ clear any pending upload
      pendingFile = null;
      if (modalFileInput) modalFileInput.value = "";

      // ✅ clear preview
      if (modalImg) modalImg.src = "";

      // ✅ update local copy
      events[currentIndex].image = "";

      // ✅ save BLANK image to events.json
      const res = await fetch("/admin/update-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          index: currentIndex,
          image: "",
        }),
      });

      const result = await res.json();
      if (!result.success) {
        throw new Error(result.error || "Failed to remove photo");
      }

      alert("✅ Photo removed!");
    } catch (err) {
      console.error(err);
      alert("❌ Failed to remove photo.");
    }
  });
}

    async function uploadImage(index, file) {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("index", index);

      const res = await fetch("/admin/upload-image", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });

      const result = await res.json();
      if (!result.success) {
        throw new Error(result.error || "Upload failed");
      }

      // update local copy so modal stays accurate
      events[index].image = result.image;
    }

    async function updateEvent(index, title, date, notes) {
      const res = await fetch("/admin/update-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          index,
          title,
          date,
          notes,
        }),
      });

      const result = await res.json();
      if (!result.success) {
        throw new Error(result.error || "Save failed");
      }
    }

    // Save button
    if (modalSaveBtn) {
      modalSaveBtn.addEventListener("click", async () => {
        try {
          if (currentIndex === null) return;

          // 1) upload image if changed
          if (pendingFile) {
            await uploadImage(currentIndex, pendingFile);
          }

          // 2) save text fields
          const newTitle = String(modalFieldTitle?.value ?? "");
          const newDate = String(modalFieldDate?.value ?? "");
          const newNotes = getTextareaValueExact(modalFieldNotes);

          await updateEvent(currentIndex, newTitle, newDate, newNotes);

          alert("✅ Saved!");
          closeModal();
          location.reload();
        } catch (err) {
          console.error(err);
          alert("❌ " + (err.message || "Failed to save"));
        }
      });
    }

    // (Optional) Delete button – disabled by default
    if (modalDeleteBtn) {
      modalDeleteBtn.addEventListener("click", () => {
        alert("Delete isn’t wired for events yet (no delete endpoint).");
      });
    }

    // ✅ Render events
    const eventHTML = events
      .map((ev, index) => {
        const isEven = index % 2 === 0;

        const title = escapeHTML(ev.title);
        const date = escapeHTML(ev.date);
        const desc = escapeHTML(ev.description || "");

        let imgPathRaw = String(ev.image || "");
        imgPathRaw = imgPathRaw.startsWith("/") ? imgPathRaw : "/" + imgPathRaw;

        const imgPath = imgPathRaw.startsWith("/images/") ? imgPathRaw : "";
        
        let notesRaw = String(ev.notes ?? "");
        notesRaw = notesRaw.replace(/\n{3,}/g, "\n\n").trim();



        const adminEditBtn =
          isAdmin
            ? `
              <button class="ml-edit-btn" type="button" data-edit-index="${index}">
                Edit
              </button>
            `
            : "";

        const notesBlock = `
          <div class="event-notes">
            ${escapeHTMLWithBreaks(notesRaw)}
          </div>
        `;

        const textBlock = `
          <div class="grid-item grey">
            <div class="text-box">
              <div class="event-header">
                <h2 id="event-title-${index}">${title}</h2>
                <p id="event-date-${index}" class="event-date">${date}</p>
              </div>

              <p>${desc}</p>

              ${notesBlock}
              ${adminEditBtn}
            </div>
          </div>
        `;

        const imageBlock = `
         <div class="grid-item white" style="position:relative;">
         ${
        imgPath
        ? `<img src="${imgPath}" alt="${title}" id="event-image-${index}" class="event-img">`
        : `<div class="no-event-image"></div>`
          }
         </div>
          `;


        return `
  <div
    class="event-row ${isEven ? "even" : "odd"}"
    data-event-index="${index}"
    ${isAdmin ? 'draggable="true"' : ""}
  >
    ${isEven ? textBlock + imageBlock : imageBlock + textBlock}
  </div>
`;

      })
      .join("");

    grid.innerHTML = eventHTML;

// ✅ Drag & Drop reorder (ADMIN ONLY)
if (isAdmin) {
  const rows = () => Array.from(grid.querySelectorAll(".event-row"));

  // Make sure rows are draggable
  rows().forEach((r) => r.setAttribute("draggable", "true"));

  let isDragging = false;

  // ✅ Save current DOM order to server
  async function saveOrderToServer() {
    const order = rows().map((r) => Number(r.getAttribute("data-event-index")));

    const res = await fetch("/admin/reorder-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ order }),
    });

    const result = await res.json();
    if (!result.success) throw new Error(result.error || "Failed to save order");
  }

  // ✅ Wheel/trackpad scroll while dragging
  const onWheelWhileDragging = (e) => {
    if (!isDragging) return;

    window.scrollBy({
      top: e.deltaY,
      left: e.deltaX,
      behavior: "auto",
    });

    e.preventDefault();
  };

  document.addEventListener("wheel", onWheelWhileDragging, { passive: false });

  // ✅ Auto-scroll near edges
  const EDGE = 140;      // bigger = easier to trigger
  const SPEED = 22;      // bigger = faster scroll
  let autoScrollTimer = null;

  function startAutoScroll() {
    if (autoScrollTimer) return;
    autoScrollTimer = setInterval(() => {
      if (!isDragging) return;
      if (typeof window.__dragY !== "number") return;

      const y = window.__dragY;
      const vh = window.innerHeight;

      if (y < EDGE) window.scrollBy(0, -SPEED);
      else if (y > vh - EDGE) window.scrollBy(0, SPEED);
    }, 16);
  }

  function stopAutoScroll() {
    if (autoScrollTimer) clearInterval(autoScrollTimer);
    autoScrollTimer = null;
    window.__dragY = undefined;
  }

  // ✅ Drag start / end
  rows().forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      row.classList.add("dragging");
      isDragging = true;
      e.dataTransfer.effectAllowed = "move";
      startAutoScroll();
    });

    row.addEventListener("dragend", async () => {
      row.classList.remove("dragging");
      isDragging = false;
      stopAutoScroll();

      // Save after drop
      try {
        await saveOrderToServer();
        location.reload(); // reload so indices match new JSON order
      } catch (err) {
        console.error(err);
        alert("❌ Couldn't save new order: " + (err.message || "error"));
      }
    });
  });

  // ✅ BIG IMPROVEMENT: dragover on the GRID (not per-row)
  // Much less “exact”
  grid.addEventListener("dragover", (e) => {
    e.preventDefault();

    // Used for auto-scroll
    window.__dragY = e.clientY;

    const dragging = grid.querySelector(".event-row.dragging");
    if (!dragging) return;

    const allRows = Array.from(grid.querySelectorAll(".event-row:not(.dragging)"));
    if (allRows.length === 0) return;

    // Find the row whose CENTER is closest to mouse Y
    let closestRow = null;
    let closestDist = Infinity;

    for (const r of allRows) {
      const rect = r.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const dist = Math.abs(e.clientY - centerY);
      if (dist < closestDist) {
        closestDist = dist;
        closestRow = r;
      }
    }

    if (!closestRow) return;

    const rect = closestRow.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;

    if (e.clientY < centerY) {
      grid.insertBefore(dragging, closestRow);
    } else {
      grid.insertBefore(dragging, closestRow.nextSibling);
    }
  });
}


    // ✅ Hook up Edit buttons -> open modal
    if (isAdmin) {
      document.querySelectorAll("[data-edit-index]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const i = Number(btn.getAttribute("data-edit-index"));
          if (!Number.isInteger(i) || i < 0) return;
          openModal(i);
        });
      });
    }
  } catch (err) {
    console.error("❌ Error loading events:", err);
  }
});
