// ✅ Rotating hero background images
// These are relative to the page where this script runs.
// Make sure the files exist at these paths in /public/images.
const heroImages = [
  "../images/HomeRotatingImage1.webp",
  "../images/HomeRotatingImage2.webp",
  "../images/HomeRotatingImage3.webp",
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
