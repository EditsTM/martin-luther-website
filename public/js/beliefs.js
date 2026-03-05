/**
 * File: public\js\beliefs.js
 * Purpose: Implements carousel, expand toggle, and tab behavior for beliefs page.
 */
document.addEventListener("DOMContentLoaded", () => {
  const carousel = document.querySelector(".carousel");
  const track = document.querySelector(".carousel__track");
  const prevBtn = document.querySelector(".carousel__arrow--prev");
  const nextBtn = document.querySelector(".carousel__arrow--next");
  const cards = Array.from(document.querySelectorAll(".belief-card"));
  const toggleBtn = document.getElementById("expandToggle");

  let index = 0;
  let expanded = false;

  const perView = () => {
    if (window.matchMedia("(max-width: 680px)").matches) return 1;
    if (window.matchMedia("(max-width: 1024px)").matches) return 2;
    return 3;
  };

  const clampIndex = () => {
    const visible = perView();
    const maxIndex = Math.max(0, cards.length - visible);
    if (index > maxIndex) index = maxIndex;
    if (index < 0) index = 0;
  };

  const updateCarousel = () => {
    if (!track || !prevBtn || !nextBtn || cards.length === 0) return;

    if (expanded) {
      track.style.transform = "";
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    clampIndex();
    const styles = getComputedStyle(track);
    const gap = parseFloat(styles.columnGap || styles.gap) || 24;
    const cardWidth = cards[0].getBoundingClientRect().width;
    const offset = index * (cardWidth + gap);

    track.style.transform = `translateX(-${offset}px)`;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index >= cards.length - perView();
  };

  if (nextBtn && prevBtn && cards.length > 0) {
    nextBtn.addEventListener("click", () => {
      if (expanded) return;
      if (index < cards.length - perView()) index += 1;
      updateCarousel();
    });

    prevBtn.addEventListener("click", () => {
      if (expanded) return;
      if (index > 0) index -= 1;
      updateCarousel();
    });

    window.addEventListener("resize", updateCarousel);
    window.requestAnimationFrame(updateCarousel);
  }

  if (toggleBtn && carousel) {
    toggleBtn.addEventListener("click", () => {
      expanded = !expanded;
      carousel.classList.toggle("expanded", expanded);
      toggleBtn.textContent = expanded ? "Collapse" : "Expand All";
      updateCarousel();
    });
  }

  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.getAttribute("data-tab");
      if (!tab) return;

      document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((content) => content.classList.remove("active"));

      button.classList.add("active");
      const target = document.getElementById(tab);
      if (target) target.classList.add("active");
    });
  });
});
