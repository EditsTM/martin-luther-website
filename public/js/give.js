// give.js
document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ Give page loaded successfully.");

  // Optional: confirm iframe loaded
  const iframe = document.querySelector("iframe");
  iframe.addEventListener("load", () => {
    console.log("✅ Donation form embedded successfully.");
  });
});
