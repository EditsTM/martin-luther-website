/**
 * File: public\js\give.js
 * Purpose: Implements client-side behavior for the give experience.
 */
// public/js/give.js
document.addEventListener("DOMContentLoaded", () => {
  console.log("[OK] Give page loaded successfully.");

  // The donation form is embedded via iframe. This script just confirms it loads.
  const iframe = document.querySelector("iframe");
  if (!iframe) return; // Prevent runtime errors if iframe is missing

  iframe.addEventListener("load", () => {
    console.log("[OK] Donation form embedded successfully.");
  });
});
