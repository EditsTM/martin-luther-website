// ✅ public/js/eventsLoader.js
// Loads events from events.json and renders them.
// If the user is an admin, it also enables inline editing + image uploads.

document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Escapes user-controlled strings before injecting into innerHTML.
    // This helps prevent XSS when building HTML as strings.
    const escapeHTML = (v) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    // 🧩 Step 1: Verify admin session
    // credentials: "same-origin" ensures your session cookie is included.
    // cache: "no-store" avoids stale admin status being cached.
    const sessionRes = await fetch("/admin/check", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const sessionData = await sessionRes.json();
    const isAdmin = sessionData.loggedIn === true;

    // 🧩 Step 2: Load events.json
    // This is your source of truth for event list content.
    const res = await fetch("/admin/events.json", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) throw new Error("Failed to load events.json");
    const data = await res.json();

    // Supports two layouts:
    // - grid layout (#events-grid) for your main Events page
    // - card layout (.events-cards) for a smaller list/section
    const grid = document.getElementById("events-grid");
    const cards = document.querySelector(".events-cards");
    if (!grid && !cards) return;

    // 🧩 Step 3: Build event HTML (escaped)
    // NOTE: Because we inject via innerHTML, we escape text fields and sanitize image paths.
    const eventHTML = (data.events || [])
      .map((ev, index) => {
        const isEven = index % 2 === 0;

        // Escape all text content that will land inside HTML
        const title = escapeHTML(ev.title);
        const date = escapeHTML(ev.date);
        const desc = escapeHTML(ev.description || "");

        // Normalize image path to always start with "/"
        let imgPathRaw = String(ev.image || "");
        imgPathRaw = imgPathRaw.startsWith("/") ? imgPathRaw : "/" + imgPathRaw;

        // Basic safety allowlist: only accept site-relative images under /images/
        // Falls back to a placeholder if the path looks unexpected.
        const imgPath = imgPathRaw.startsWith("/images/")
          ? imgPathRaw
          : "/images/Placeholder.jpg";

        // Admin-only text edit controls (only rendered on the grid page)
        const adminTextButtons =
          isAdmin && grid
            ? `
              <div class="event-admin-section">
                <button class="edit-title-btn" data-index="${index}">✏️ Edit Title</button>
                <button class="edit-date-btn" data-index="${index}">📅 Edit Date</button>
              </div>
            `
            : "";

        // Admin-only overlay used to trigger file input for image upload
        const imageOverlayButton =
          isAdmin && grid
            ? `
              <div class="image-edit-overlay" data-index="${index}">
                🖼️ Edit Image
                <input type="file" accept="image/*" class="hidden-file" data-index="${index}" />
              </div>
            `
            : "";

        // Grid layout markup (full events page)
        if (grid) {
          return `
            <div class="event-row ${isEven ? "even" : "odd"}">
              <div class="grid-item grey">
                <div class="text-box">
                  <div class="event-header">
                    <h2 id="event-title-${index}">${title}</h2>
                    <p id="event-date-${index}" class="event-date">${date}</p>
                  </div>
                  <p>${desc}</p>
                  ${adminTextButtons}
                </div>
              </div>

              <div class="grid-item white" style="position:relative;">
                <img src="${imgPath}"
                     alt="${title}"
                     id="event-image-${index}"
                     class="event-img"
                     style="width:100%;height:100%;object-fit:cover;display:block;">
                ${imageOverlayButton}
              </div>
            </div>
          `;
        }

        // Card layout markup (smaller events section)
        return `
          <div class="event-card">
            <img src="${imgPath}" alt="${title}">
            <h3>${title}</h3>
            <p>${date}</p>
          </div>
        `;
      })
      .join("");

    // Render HTML into whichever container exists
    if (grid) grid.innerHTML = eventHTML;
    if (cards) cards.innerHTML = eventHTML;

    // If not admin, stop here (no edit wiring needed).
    // Also: edits are only enabled on the grid version of the page.
    if (!isAdmin || !grid) return;

    // 🧠 Step 5: Hook up edit buttons
    // We rely on data-index to map each button to an event index in events.json
    document.querySelectorAll(".edit-title-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const i = Number(btn.dataset.index);

        // Defensive checks: ensure index is a valid non-negative integer
        if (!Number.isInteger(i) || i < 0) return;

        const newTitle = prompt("Enter new event title:");
        if (!newTitle) return;

        // Only update the title; leave other fields unchanged (null)
        await updateEvent(i, newTitle, null, null);
      });
    });

    document.querySelectorAll(".edit-date-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const i = Number(btn.dataset.index);
        if (!Number.isInteger(i) || i < 0) return;

        const newDate = prompt("Enter new event date:");
        if (!newDate) return;

        // Only update the date; leave other fields unchanged (null)
        await updateEvent(i, null, newDate, null);
      });
    });

    // 🖼️ Step 6: Hook up image overlay for file upload
    // Clicking the overlay triggers the hidden file input.
    document.querySelectorAll(".image-edit-overlay").forEach((overlay) => {
      const fileInput = overlay.querySelector(".hidden-file");

      overlay.addEventListener("click", () => fileInput.click());

      fileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Quick client-side guard (server must still enforce type/size validation)
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
          // credentials ensures admin session cookie is included.
          const res = await fetch("/admin/upload-image", {
            method: "POST",
            body: formData,
            credentials: "same-origin",
          });

          const result = await res.json();
          if (result.success) {
            // Cache-bust so the browser immediately shows the new upload
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

    async function updateEvent(index, title, date, image) {
      // Sends an update request to the server.
      // NOTE: The server should verify admin permissions (UI checks are not security).
      try {
        const res = await fetch("/admin/update-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ index, title, date, image }),
        });

        const result = await res.json();
        if (result.success) {
          // Simple approach: reload to re-render from updated events.json
          alert("✅ Event updated successfully!");
          location.reload();
        } else {
          alert("❌ Update failed: " + (result.error || "Unknown error"));
        }
      } catch (err) {
        console.error("❌ Update error:", err);
        alert("❌ Failed to update event.");
      }
    }
  } catch (err) {
    // Catch-all so the page doesn’t die silently if JSON/network fails
    console.error("❌ Error loading events:", err);
  }
});
