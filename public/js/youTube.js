// ✅ public/js/youtube.js
// Front-end script that securely loads videos via your backend proxy.

document.addEventListener("DOMContentLoaded", async () => {
  const latestContainer = document.getElementById("latest-stream");
  const pastContainer = document.getElementById("past-streams");

  if (!latestContainer || !pastContainer) {
    console.error("❌ Missing video containers in HTML.");
    return;
  }

  try {
    // 🔒 Fetch video data from your backend
    const res = await fetch("/api/youtube");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    console.log("✅ YouTube API Data:", data);

    if (!data.items || data.items.length === 0) {
      latestContainer.innerHTML = "<p>No videos found.</p>";
      pastContainer.innerHTML = "<p>No past videos found.</p>";
      return;
    }

    // 🎥 Latest video
    const latest = data.items[0];
    const latestVideoId =
      latest.snippet?.resourceId?.videoId || latest.id?.videoId || null;

    if (latestVideoId) {
      latestContainer.innerHTML = `
        <iframe
          width="100%"
          height="600"
          src="https://www.youtube.com/embed/${latestVideoId}"
          frameborder="0"
          allow="autoplay; encrypted-media"
          allowfullscreen>
        </iframe>`;
    } else {
      latestContainer.innerHTML = "<p>Could not find latest video ID.</p>";
    }

    // 🕐 Past 3 videos
    const pastVideos = data.items.slice(1, 4);
    pastContainer.innerHTML = pastVideos
      .map((item) => {
        const vid =
          item.snippet?.resourceId?.videoId || item.id?.videoId || null;
        if (!vid) return "";
        return `
          <iframe
            width="360"
            height="215"
            src="https://www.youtube.com/embed/${vid}"
            frameborder="0"
            allow="autoplay; encrypted-media"
            allowfullscreen>
          </iframe>`;
      })
      .join("");
  } catch (err) {
    console.error("💥 Error fetching YouTube videos:", err);
    latestContainer.innerHTML = "<p>Could not load videos.</p>";
    pastContainer.innerHTML = "<p>Could not load videos.</p>";
  }
});
