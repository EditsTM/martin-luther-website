// ✅ public/js/youtube.js
// Safely fetch and render latest and past YouTube videos

async function loadVideos() {
  const latestContainer = document.getElementById("latest-stream");
  const pastContainer = document.getElementById("past-streams");

  if (!latestContainer || !pastContainer) {
    console.error("⚠️ YouTube containers not found in DOM");
    return;
  }

  try {
    console.log("📡 Fetching /api/youtube...");
    const response = await fetch("/api/youtube");

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    console.log("✅ YouTube data received:", data);

    if (!data.items || data.items.length === 0) {
      latestContainer.innerHTML = "<p>No videos found.</p>";
      pastContainer.innerHTML = "<p>No past videos found.</p>";
      return;
    }

    // 🎥 First = latest video
    const latestVideo = data.items[0]?.snippet?.resourceId?.videoId;
    if (latestVideo) {
      latestContainer.innerHTML = `
        <iframe
          width="100%"
          height="600"
          src="https://www.youtube-nocookie.com/embed/${latestVideo}"
          title="${data.items[0].snippet.title}"
          frameborder="0"
          allow="autoplay; encrypted-media"
          allowfullscreen
          referrerpolicy="strict-origin-when-cross-origin">
        </iframe>
      `;
    } else {
      latestContainer.innerHTML = "<p>Could not load latest video.</p>";
    }

    // 🕐 Past videos
    const pastVideos = data.items.slice(1, 4);
    if (pastVideos.length > 0) {
      pastContainer.innerHTML = pastVideos
        .map((item) => {
          const id = item?.snippet?.resourceId?.videoId;
          const title = item?.snippet?.title || "Untitled Video";
          return id
            ? `
            <iframe
              width="360"
              height="215"
              src="https://www.youtube-nocookie.com/embed/${id}"
              title="${title}"
              frameborder="0"
              allow="autoplay; encrypted-media"
              allowfullscreen
              referrerpolicy="strict-origin-when-cross-origin">
            </iframe>`
            : "";
        })
        .join("");
    } else {
      pastContainer.innerHTML = "<p>No past videos found.</p>";
    }
  } catch (err) {
    console.error("💥 Error fetching YouTube videos:", err);
    latestContainer.innerHTML = "<p>Could not load videos.</p>";
    pastContainer.innerHTML = "<p>Could not load videos.</p>";
  }
}

// ✅ Wait until page fully loaded before running
window.addEventListener("DOMContentLoaded", loadVideos);
