// public/js/give.js
document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ Give page loaded successfully.");

  // The donation form is embedded via iframe. This script just confirms it loads.
  const iframe = document.querySelector("iframe");
  if (!iframe) return; // Prevent runtime errors if iframe is missing

  iframe.addEventListener("load", () => {
    console.log("✅ Donation form embedded successfully.");
  });
});
