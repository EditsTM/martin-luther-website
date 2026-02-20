// ✅ Rotating hero background images
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
    preload.onload = () => console.log(`✅ Loaded: ${img}`);
    preload.onerror = () => console.error(`❌ Failed to load: ${img}`);
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
  console.error("❌ Hero section not found in DOM");
}

//Load 3 events onto homepage
const container = document.querySelector(".events-cards");

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
        container.innerHTML = "";
        return;
      }

      //Render the cards
      container.innerHTML = top3
        .map(
          (ev) => `
            <div class="event-card">
              <img src="${ev.image}" alt="${ev.title}">
              <h3>${ev.title}</h3>
              <p>${ev.date}</p>
            </div>
          `
        )
        .join("");
    })
    .catch((err) => {
      console.error("❌ Failed to load events on homepage:", err);
    });
}
