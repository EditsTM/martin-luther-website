// ✅ public/js/eventsLoader.js
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // 🧩 Step 1: Verify admin session
    const sessionRes = await fetch("/admin/check", { cache: "no-store" });
    const sessionData = await sessionRes.json();
    const isAdmin = sessionData.loggedIn === true;
    console.log("🔑 Admin logged in:", isAdmin);

    // 🧩 Step 2: Load events.json
    const res = await fetch("/admin/events.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load events.json");
    const data = await res.json();

    const grid = document.getElementById("events-grid");
    const cards = document.querySelector(".events-cards");

    if (!grid && !cards) {
      console.warn("⚠️ No events container found on this page.");
      return;
    }

    // 🧩 Step 3: Build event HTML
    const eventHTML = data.events
      .map((ev, index) => {
        const isEven = index % 2 === 0;

        // ⭐ FIX: Normalize image path so it ALWAYS has exactly ONE leading slash
        const imgPath = ev.image.startsWith("/") ? ev.image : "/" + ev.image;

        // Admin-only buttons for title/date
        const adminTextButtons =
          isAdmin && grid
            ? `
              <div class="event-admin-section">
                <button class="edit-title-btn" data-index="${index}">✏️ Edit Title</button>
                <button class="edit-date-btn" data-index="${index}">📅 Edit Date</button>
              </div>
            `
            : "";

        // 🖼️ Centered overlay with hidden file input (admin only)
        const imageOverlayButton =
          isAdmin && grid
            ? `
              <div class="image-edit-overlay" data-index="${index}">
                🖼️ Edit Image
                <input type="file" accept="image/*" class="hidden-file" data-index="${index}" />
              </div>
            `
            : "";

        // 🧱 Events Page layout
        if (grid) {
          return `
            <div class="event-row ${isEven ? "even" : "odd"}">
              <div class="grid-item grey">
                <div class="text-box">
                  <div class="event-header">
                    <h2 id="event-title-${index}">${ev.title}</h2>
                    <p id="event-date-${index}" class="event-date">${ev.date}</p>
                  </div>
                  <p>${ev.description || ""}</p>
                  ${adminTextButtons}
                </div>
              </div>

              <div class="grid-item white" style="position:relative;">
                <img src="${imgPath}" 
                     alt="${ev.title}" 
                     id="event-image-${index}"
                     class="event-img"
                     style="width:100%;height:100%;object-fit:cover;display:block;">
                ${imageOverlayButton}
              </div>
            </div>
          `;
        }

        // 🏠 Homepage cards
        return `
          <div class="event-card">
            <img src="${imgPath}" alt="${ev.title}">
            <h3>${ev.title}</h3>
            <p>${ev.date}</p>
          </div>
        `;
      })
      .join("");

    // 🧩 Step 4: Inject markup
    if (grid) grid.innerHTML = eventHTML;
    if (cards) cards.innerHTML = eventHTML;

    // 🚫 Stop here if not admin
    if (!isAdmin || !grid) return;

    // 🧠 Step 5: Hook up all edit buttons
    document.querySelectorAll(".edit-title-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const i = btn.dataset.index;
        const newTitle = prompt("Enter new event title:");
        if (!newTitle) return;
        await updateEvent(i, newTitle, null, null);
      });
    });

    document.querySelectorAll(".edit-date-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const i = btn.dataset.index;
        const newDate = prompt("Enter new event date:");
        if (!newDate) return;
        await updateEvent(i, null, newDate, null);
      });
    });

    // 🖼️ Step 6: Hook up image overlay for file upload
    document.querySelectorAll(".image-edit-overlay").forEach((overlay) => {
      const fileInput = overlay.querySelector(".hidden-file");

      ["dragenter", "dragover", "dragleave", "drop"].forEach((evtName) => {
        overlay.addEventListener(evtName, (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
      });

      overlay.addEventListener("click", () => fileInput.click());

      overlay.addEventListener("dragover", () => {
        overlay.classList.add("dragover");
        overlay.style.background = "rgba(66,121,188,0.95)";
      });

      overlay.addEventListener("dragleave", () => {
        overlay.classList.remove("dragover");
        overlay.style.background = "rgba(66,121,188,0.85)";
      });

      overlay.addEventListener("drop", async (e) => {
        overlay.classList.remove("dragover");
        overlay.style.background = "rgba(66,121,188,0.85)";

        const dt = e.dataTransfer;
        const files = dt.files;
        if (!files || files.length === 0) {
          console.warn("⚠️ No file detected in drop event");
          return;
        }

        const file = files[0];
        await uploadImage(fileInput.dataset.index, file);
      });

      fileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        await uploadImage(fileInput.dataset.index, file);
      });

      async function uploadImage(index, file) {
        const formData = new FormData();
        formData.append("image", file);
        formData.append("index", index);
        try {
          const res = await fetch("/admin/upload-image", {
            method: "POST",
            body: formData,
          });
          const result = await res.json();
          if (result.success) {
            const img = document.getElementById(`event-image-${index}`);
            if (img) {
              img.src = "/" + result.image + "?t=" + Date.now();
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

    // 🔁 Step 7: Unified update function for title/date
    async function updateEvent(index, title, date, image) {
      try {
        const res = await fetch("/admin/update-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index, title, date, image }),
        });

        const result = await res.json();
        if (result.success) {
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
    console.error("❌ Error loading events:", err);
  }
});
