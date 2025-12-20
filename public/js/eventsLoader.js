// ✅ public/js/eventsLoader.js
// Loads events from events.json and renders them.
// If the user is an admin, it also enables inline editing + image uploads + notes.

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const escapeHTML = (v) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    // ✅ Render text safely but keep line breaks
    const escapeHTMLWithBreaks = (v) => escapeHTML(v).replace(/\n/g, "<br>");

    // ✅ IMPORTANT:
    // innerText matches what you SEE in contenteditable (blank lines included) better than textContent.
    const getEditableNotesExactlyAsSeen = (el) => {
      if (!el) return "";
      let text = String(el.innerText ?? "");
      text = text.replace(/\r\n/g, "\n"); // normalize windows -> unix newlines
      return text; // NO trim
    };

    // 🧩 Step 1: Verify admin session
    const sessionRes = await fetch("/admin/check", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const sessionData = await sessionRes.json();
    const isAdmin = sessionData.loggedIn === true;

    // 🧩 Step 2: Load events.json
    const res = await fetch("/content/events.json", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) throw new Error("Failed to load events.json");
    const data = await res.json();

    const grid = document.getElementById("events-grid");
    const cards = document.querySelector(".events-cards");
    if (!grid && !cards) return;

    const events = data.events || [];

    const eventHTML = events
      .map((ev, index) => {
        const isEven = index % 2 === 0;

        const title = escapeHTML(ev.title);
        const date = escapeHTML(ev.date);
        const desc = escapeHTML(ev.description || "");

        let imgPathRaw = String(ev.image || "");
        imgPathRaw = imgPathRaw.startsWith("/") ? imgPathRaw : "/" + imgPathRaw;

        const imgPath = imgPathRaw.startsWith("/images/")
          ? imgPathRaw
          : "/images/Placeholder.jpg";

        // ✅ Notes come from SERVER (events.json) so all devices see them
        const notesRaw = String(ev.notes ?? "*Insert text here*");

        // ✅ Show notes for everyone (as HTML with <br>), but only editable for admin
        const notesBlock = `
          <div class="event-admin-section">
            <div
              id="admin-text-${index}"
              class="admin-display-text"
              ${isAdmin ? 'contenteditable="true" spellcheck="true"' : ""}
            >${escapeHTMLWithBreaks(notesRaw)}</div>

            <button
              class="save-notes-btn"
              data-index="${index}"
              style="display:${isAdmin ? "inline-block" : "none"};"
              type="button"
            >
              Save Notes
            </button>
          </div>
        `;

        const adminTextButtons =
          isAdmin && grid
            ? `
              <div class="event-admin-section">
                <button class="edit-title-btn" data-index="${index}" type="button">✏️ Edit Title</button>
                <button class="edit-date-btn" data-index="${index}" type="button">📅 Edit Date</button>
              </div>
            `
            : "";

        const imageOverlayButton =
          isAdmin && grid
            ? `
              <div class="image-edit-overlay" data-index="${index}">
                🖼️ Edit Image
                <input type="file" accept="image/*" class="hidden-file" data-index="${index}" />
              </div>
            `
            : "";

        const textBlock = `
          <div class="grid-item grey">
            <div class="text-box">
              <div class="event-header">
                <h2 id="event-title-${index}">${title}</h2>
                <p id="event-date-${index}" class="event-date">${date}</p>
              </div>

              <p>${desc}</p>

              ${notesBlock}
              ${adminTextButtons}
            </div>
          </div>
        `;

        const imageBlock = `
          <div class="grid-item white" style="position:relative;">
            <img src="${imgPath}"
                 alt="${title}"
                 id="event-image-${index}"
                 class="event-img">
            ${imageOverlayButton}
          </div>
        `;

        if (grid) {
          return `
            <div class="event-row ${isEven ? "even" : "odd"}">
              ${isEven ? textBlock + imageBlock : imageBlock + textBlock}
            </div>
          `;
        }

        // If you use a mobile cards layout elsewhere:
        return `
          <div class="event-card">
            <img src="${imgPath}" alt="${title}">
            <h3>${title}</h3>
            <p>${date}</p>
          </div>
        `;
      })
      .join("");

    if (grid) grid.innerHTML = eventHTML;
    if (cards) cards.innerHTML = eventHTML;

    // ✅ Notes saving wired for admin (NOW SAVES TO SERVER)
    if (isAdmin && grid) {
      document.querySelectorAll(".save-notes-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const i = Number(btn.dataset.index);
          if (!Number.isInteger(i) || i < 0) return;

          const div = document.getElementById(`admin-text-${i}`);
          if (!div) return;

          const notes = getEditableNotesExactlyAsSeen(div); // ✅ preserves blank lines

          await updateEvent(i, null, null, null, notes);
        });
      });
    }

    // If not admin, stop here
    if (!isAdmin || !grid) return;

    // ✏️ Title edits
    document.querySelectorAll(".edit-title-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const i = Number(btn.dataset.index);
        if (!Number.isInteger(i) || i < 0) return;

        const newTitle = prompt("Enter new event title:");
        if (!newTitle) return;

        await updateEvent(i, newTitle, null, null, null);
      });
    });

    // 📅 Date edits
    document.querySelectorAll(".edit-date-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const i = Number(btn.dataset.index);
        if (!Number.isInteger(i) || i < 0) return;

        const newDate = prompt("Enter new event date:");
        if (!newDate) return;

        await updateEvent(i, null, newDate, null, null);
      });
    });

    // 🖼️ Image upload
    document.querySelectorAll(".image-edit-overlay").forEach((overlay) => {
      const fileInput = overlay.querySelector(".hidden-file");
      overlay.addEventListener("click", () => fileInput.click());

      fileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
          alert("Please upload an image file.");
          return;
        }

        await uploadImage(Number(fileInput.dataset.index), file);
      });

      async function uploadImage(index, file) {
        if (!Number.isInteger(index) || index < 0) return;

        const formData = new FormData();
        formData.append("image", file);
        formData.append("index", index);

        try {
          const res = await fetch("/admin/upload-image", {
            method: "POST",
            body: formData,
            credentials: "same-origin",
          });

          const result = await res.json();
          if (result.success) {
            const img = document.getElementById(`event-image-${index}`);
            if (img) {
              img.src =
                "/" +
                String(result.image).replace(/^\/+/, "") +
                "?t=" +
                Date.now();
            }
            alert("✅ Image updated successfully!");
          } else {
            alert("❌ Upload failed: " + (result.error || "Unknown error"));
          }
        } catch (err) {
          console.error("❌ Upload error:", err);
          alert("❌ Failed to upload image.");
        }
      }
    });

    // ✅ UPDATED: supports notes
    async function updateEvent(index, title, date, image, notes) {
      try {
        const res = await fetch("/admin/update-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ index, title, date, image, notes }),
        });

        const result = await res.json();
        if (result.success) {
          alert("✅ Saved!");
          location.reload();
        } else {
          alert("❌ Save failed: " + (result.error || "Unknown error"));
        }
      } catch (err) {
        console.error("❌ Update error:", err);
        alert("❌ Failed to save.");
      }
    }
  } catch (err) {
    console.error("❌ Error loading events:", err);
  }
});
