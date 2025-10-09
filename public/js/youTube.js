// ✅ public/js/youtube.js
// Front-end: Loads latest and past videos securely from your backend
// The API key is safely stored in your server's .env file — not here.

async function loadVideos() {
  const latestContainer = document.getElementById("latest-stream");
  const pastContainer = document.getElementById("past-streams");

  try {
    // 🔒 Fetch video data from your backend (which calls YouTube privately)
    const response = await fetch("/api/youtube");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      latestContainer.innerHTML = "<p>No videos found.</p>";
      pastContainer.innerHTML = "<p>No past videos found.</p>";
      return;
    }

    // 🎥 First video = most recent livestream or upload
    const latestVideo = data.items[0].snippet.resourceId.videoId;
    latestContainer.innerHTML = `
      <iframe
        width="100%"
        height="600"
        src="https://www.youtube.com/embed/${latestVideo}"
        frameborder="0"
        allow="autoplay; encrypted-media"
        allowfullscreen>
      </iframe>
    `;

    // 🕐 Next 3 = previous videos
    const pastVideos = data.items.slice(1, 4);
    pastContainer.innerHTML = pastVideos
      .map(
        (item) => `
        <iframe
          width="360"
          height="215"
          src="https://www.youtube.com/embed/${item.snippet.resourceId.videoId}"
          frameborder="0"
          allow="autoplay; encrypted-media"
          allowfullscreen>
        </iframe>`
      )
      .join("");
  } catch (err) {
    console.error("💥 Error fetching YouTube videos:", err);
    latestContainer.innerHTML = "<p>Could not load videos.</p>";
    pastContainer.innerHTML = "<p>Could not load videos.</p>";
  }
}

// 🚀 Run when the page loads
document.addEventListener("DOMContentLoaded", loadVideos);
