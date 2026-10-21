






document.addEventListener("DOMContentLoaded", () => {


  const container = document.querySelector(".faq-container");
  if (!container) return;


  container.addEventListener("click", (e) => {

    const btn = e.target.closest(".faq-question");
    if (!btn) return;


    e.preventDefault();


    const item = btn.closest(".faq-item");
    const answer = item.querySelector(".faq-answer");


    const isOpen = item.classList.contains("active");



    container.querySelectorAll(".faq-item.active").forEach((openItem) => {
      if (openItem !== item) {
        openItem.classList.remove("active");
        openItem.querySelector(".faq-answer").style.maxHeight = null;
      }
    });


    if (!isOpen) {

      item.classList.add("active");
      answer.style.maxHeight = answer.scrollHeight + "px";
    } else {

      item.classList.remove("active");
      answer.style.maxHeight = null;
    }
  });
});
