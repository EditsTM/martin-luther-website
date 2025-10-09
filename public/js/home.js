// ✅ Rotating hero background images
// Make sure these image files are in your `/public/images` folder
const heroImages = [
  "../images/HomeRotatingImage1.webp",
  "../images/HomeRotatingImage2.webp",
  "../images/HomeRotatingImage3.webp"
];

// Get the hero section
const heroSection = document.querySelector(".hero");

// Debugging: confirm section presence
console.log("Hero section found:", !!heroSection);

if (heroSection) {
  let currentImage = 0;

  // ✅ Preload all images for smooth transitions
  heroImages.forEach((img) => {
    const preload = new Image();
    preload.src = img;
    preload.onload = () => console.log(`✅ Loaded: ${img}`);
    preload.onerror = () => console.error(`❌ Failed to load: ${img}`);
  });

  // ✅ Initial image
  heroSection.style.backgroundImage = `url('${heroImages[currentImage]}')`;

  // ✅ Fade effect for smoother transitions
  heroSection.style.transition = "background-image 1s ease-in-out";

  // Rotate every 5 seconds
  setInterval(() => {
    currentImage = (currentImage + 1) % heroImages.length;
    heroSection.style.backgroundImage = `url('${heroImages[currentImage]}')`;
  }, 5000);
} else {
  console.error("❌ Hero section not found in DOM");
}
