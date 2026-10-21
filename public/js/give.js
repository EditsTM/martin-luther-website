




document.addEventListener("DOMContentLoaded", () => {
  console.log("[OK] Give page loaded successfully.");


  const iframe = document.querySelector("iframe");
  if (!iframe) return;

  iframe.addEventListener("load", () => {
    console.log("[OK] Donation form embedded successfully.");
  });
});
