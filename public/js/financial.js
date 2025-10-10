// /public/js/financial.js
document.addEventListener("DOMContentLoaded", () => {
  const container = document.querySelector(".faq-container");
  if (!container) return;

  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".faq-question");
    if (!btn) return;
    e.preventDefault(); // stops button default behavior

    const item = btn.closest(".faq-item");
    const answer = item.querySelector(".faq-answer");
    const isOpen = item.classList.contains("active");

    // Close other open items
    container.querySelectorAll(".faq-item.active").forEach(openItem => {
      if (openItem !== item) {
        openItem.classList.remove("active");
        openItem.querySelector(".faq-answer").style.maxHeight = null;
      }
    });

    // Toggle current
    if (!isOpen) {
      item.classList.add("active");
      answer.style.maxHeight = answer.scrollHeight + "px";
    } else {
      item.classList.remove("active");
      answer.style.maxHeight = null;
    }
  });
});
