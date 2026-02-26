/**
 * File: public\js\youtube.js
 * Purpose: Implements client-side behavior for the youtube experience.
 */
// [OK] public/js/youtube.js
// Safely fetch and render latest and past YouTube videos

function escapeHTML(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isValidYouTubeId(id) {
  // Typical YouTube video IDs are 11 chars: letters, numbers, _ and -
  return /^[A-Za-z0-9_-]{11}$/.test(String(id || ""));
}

async function loadVideos() {
  const latestContainer = document.getElementById("latest-stream");
  const pastContainer = document.getElementById("past-streams");

  if (!latestContainer || !pastContainer) {
    console.error("[WARNING] YouTube containers not found in DOM");
    return;
  }

  try {
    console.log("📡 Fetching /api/youtube...");
    const response = await fetch("/api/youtube", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    console.log("[OK] YouTube data received:", data);

    if (!data.items || data.items.length === 0) {
      latestContainer.textContent = "No videos found.";
      pastContainer.textContent = "No past videos found.";
      return;
    }

    // 🎥 First = latest video
    const latestId = data.items[0]?.snippet?.resourceId?.videoId;
    const latestTitle = data.items[0]?.snippet?.title || "Latest Video";

    if (isValidYouTubeId(latestId)) {
      latestContainer.innerHTML = `
        <iframe
          width="100%"
          height="600"
          src="https://www.youtube-nocookie.com/embed/${latestId}"
          title="${escapeHTML(latestTitle)}"
          frameborder="0"
          allow="autoplay; encrypted-media"
          allowfullscreen
          sandbox="allow-scripts allow-same-origin allow-presentation"
          referrerpolicy="strict-origin-when-cross-origin">
        </iframe>
      `;
    } else {
      latestContainer.textContent = "Could not load latest video.";
    }

    // 🕐 Past videos
    const pastVideos = data.items.slice(1, 4);
    const pastHtml = pastVideos
      .map((item) => {
        const id = item?.snippet?.resourceId?.videoId;
        const title = item?.snippet?.title || "Untitled Video";

        if (!isValidYouTubeId(id)) return "";

        return `
          <iframe
            width="360"
            height="215"
            src="https://www.youtube-nocookie.com/embed/${id}"
            title="${escapeHTML(title)}"
            frameborder="0"
            allow="autoplay; encrypted-media"
            allowfullscreen
            sandbox="allow-scripts allow-same-origin allow-presentation"
            referrerpolicy="strict-origin-when-cross-origin">
          </iframe>
        `;
      })
      .join("");

    if (pastHtml) {
      pastContainer.innerHTML = pastHtml;
    } else {
      pastContainer.textContent = "No past videos found.";
    }
  } catch (err) {
    console.error("💥 Error fetching YouTube videos:", err);
    latestContainer.textContent = "Could not load videos.";
    pastContainer.textContent = "Could not load videos.";
  }
}

// [OK] Wait until page fully loaded before running
window.addEventListener("DOMContentLoaded", loadVideos);
