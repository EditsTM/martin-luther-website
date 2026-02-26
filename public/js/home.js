/**
 * File: public\js\home.js
 * Purpose: Implements client-side behavior for the home experience.
 */
// Rotating hero background images
// These are relative to the page where this script runs.
// Make sure the files exist at these paths in /public/images.
const heroImages = [
  "../images/HomeRotatingImage1.webp",
  "../images/HomeRotatingImage2.webp",
  "../images/HomeRotatingImage3.png",
];

// Grab the hero section element that gets the rotating background
const heroSection = document.querySelector(".hero");

// Debug helper: lets you confirm the selector is correct
console.log("Hero section found:", !!heroSection);

if (heroSection) {
  let currentImage = 0;

  // Preload images so the first time they appear there’s less flicker/blank loading
  // (Browser caches them after load, making rotation smoother.)
  heroImages.forEach((img) => {
    const preload = new Image();
    preload.src = img;

    // Optional logs to verify files/paths are correct
    preload.onload = () => console.log(`[OK] Loaded: ${img}`);
    preload.onerror = () => console.error(`[ERROR] Failed to load: ${img}`);
  });

  // Set the initial background image immediately on page load
  heroSection.style.backgroundImage = `url('${heroImages[currentImage]}')`;

  // Add a transition for smoother swaps
  // NOTE: background-image transitions can be inconsistent across browsers.
  // If you ever want a guaranteed smooth fade, you’d use an overlay or pseudo-element.
  heroSection.style.transition = "background-image 1s ease-in-out";

  // Rotate images on a fixed interval
  // Mod (%) wraps the index back to 0 when it reaches the end of the array.
  setInterval(() => {
    currentImage = (currentImage + 1) % heroImages.length;
    heroSection.style.backgroundImage = `url('${heroImages[currentImage]}')`;
  }, 5000);
} else {
  // If the hero isn't on this page, avoid runtime errors
  console.error("[ERROR] Hero section not found in DOM");
}

//Load 3 events onto homepage
const container = document.querySelector(".events-cards");

function normalizeEventImagePath(path) {
  const raw = String(path ?? "").trim();
  if (!raw) return "/images/Placeholder.jpg";

  const noOrigin = raw.replace(/^https?:\/\/[^/]+/i, "");
  const rel = noOrigin.startsWith("/") ? noOrigin : "/" + noOrigin;
  return rel.startsWith("/images/") ? rel : "/images/Placeholder.jpg";
}

if (container) {
  fetch("/content/events.json")
    .then((res) => res.json())
    .then((data) => {
      const events = Array.isArray(data.events) ? data.events : [];

      //Keep events if they have AT LEAST a title OR date OR image
      const validEvents = events.filter((ev) => {
        const title = String(ev.title ?? "").trim();
        const date = String(ev.date ?? "").trim();
        const image = String(ev.image ?? "").trim();

        // Show it if ANY of these exist
        return title !== "" || date !== "" || image !== "";
      });

      //Show only the first 3 valid events
      const top3 = validEvents.slice(0, 3);

      //If nothing valid exists, show nothing
      if (top3.length === 0) {
        container.replaceChildren();
        return;
      }

      // Render cards with safe DOM APIs to avoid HTML injection.
      container.replaceChildren(
        ...top3.map((ev) => {
          const card = document.createElement("div");
          card.className = "event-card";

          const title = String(ev.title ?? "");
          const date = String(ev.date ?? "");

          const img = document.createElement("img");
          img.src = normalizeEventImagePath(ev.image);
          img.alt = title;

          const h3 = document.createElement("h3");
          h3.textContent = title;

          const p = document.createElement("p");
          p.textContent = date;

          card.append(img, h3, p);
          return card;
        })
      );
    })
    .catch((err) => {
      console.error("[ERROR] Failed to load events on homepage:", err);
    });
}
