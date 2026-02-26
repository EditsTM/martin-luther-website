/**
 * File: public\js\financial.js
 * Purpose: Implements client-side behavior for the financial experience.
 */
// /public/js/financial.js
// Handles accordion-style behavior for the Financial FAQ section

document.addEventListener("DOMContentLoaded", () => {
  // Find the main FAQ container on the page
  // Exit early if this script runs on a page without FAQs
  const container = document.querySelector(".faq-container");
  if (!container) return;

  // Use event delegation so one listener handles all FAQ questions
  container.addEventListener("click", (e) => {
    // Check if the click happened on (or inside) a FAQ question button
    const btn = e.target.closest(".faq-question");
    if (!btn) return;

    // Prevent default button behavior (e.g., form submit or page jump)
    e.preventDefault();

    // Get the full FAQ item and its answer section
    const item = btn.closest(".faq-item");
    const answer = item.querySelector(".faq-answer");

    // Determine whether this FAQ item is currently open
    const isOpen = item.classList.contains("active");

    // Close any other FAQ items that are currently open
    // This ensures only one item is expanded at a time
    container.querySelectorAll(".faq-item.active").forEach((openItem) => {
      if (openItem !== item) {
        openItem.classList.remove("active");
        openItem.querySelector(".faq-answer").style.maxHeight = null;
      }
    });

    // Toggle the clicked FAQ item
    if (!isOpen) {
      // Open the item and expand its answer with a smooth animation
      item.classList.add("active");
      answer.style.maxHeight = answer.scrollHeight + "px";
    } else {
      // Close the item and collapse its answer
      item.classList.remove("active");
      answer.style.maxHeight = null;
    }
  });
});
