/**
 * File: public\js\home.js
 * Purpose: Implements client-side behavior for the home experience.
 */
// Rotating hero background images
// These are relative to the page where this script runs.
// Make sure the files exist at these paths in /public/images.
const heroImages = [
  "../images/HomeRotatingImage1.webp",
  "../images/HomeRotatingImage2.webp",
  "../images/HomeRotatingImage3.png",
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
    preload.onload = () => console.log(`[OK] Loaded: ${img}`);
    preload.onerror = () => console.error(`[ERROR] Failed to load: ${img}`);
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
  console.error("[ERROR] Hero section not found in DOM");
}

//Load events onto homepage
const container = document.querySelector(".events-cards");
const prevEventsButton = document.querySelector(".events-arrow--prev");
const nextEventsButton = document.querySelector(".events-arrow--next");
const orangeBook = document.querySelector(".book-friend--three");

if (container) {
  fetch("/content/events.json")
    .then((res) => res.json())
    .then((data) => {
      const events = Array.isArray(data.events) ? data.events : [];

      const validEvents = events.filter((ev) => {
        const title = String(ev.title ?? "").trim();
        const date = String(ev.date ?? "").trim();
        return title !== "" || date !== "";
      });

      if (validEvents.length === 0) {
        container.replaceChildren();
        [prevEventsButton, nextEventsButton].forEach((button) => {
          if (!button) return;
          button.classList.add("is-hidden");
          button.disabled = true;
        });
        return;
      }

      const getPageSize = () => {
        if (window.matchMedia("(max-width: 640px)").matches) return 1;
        if (window.matchMedia("(max-width: 980px)").matches) return 2;
        return 3;
      };

      let pageStart = 0;
      let orangeBookTimeout = null;

      const placeOrangeBook = () => {
        if (!orangeBook) return;

        const cards = Array.from(container.querySelectorAll(".event-card"));
        const eventsSection = document.querySelector(".events-section");
        if (!cards.length || !eventsSection) return;

        orangeBook.classList.remove("is-peeking");

        const index = cards.length === 1 ? 0 : Math.floor(Math.random() * cards.length);
        const cardRect = cards[index].getBoundingClientRect();
        const sectionRect = eventsSection.getBoundingClientRect();
        const left = cardRect.left - sectionRect.left + cardRect.width / 2 - 27;
        const top = cardRect.top - sectionRect.top - 34;

        orangeBook.style.setProperty("--book-peek-left", `${left}px`);
        orangeBook.style.setProperty("--book-peek-top", `${top}px`);

        requestAnimationFrame(() => {
          orangeBook.classList.add("is-peeking");
        });
      };

      const scheduleOrangeBook = () => {
        if (!orangeBook) return;
        window.clearTimeout(orangeBookTimeout);

        const run = () => {
          placeOrangeBook();
          orangeBookTimeout = window.setTimeout(run, 5200 + Math.random() * 2800);
        };

        orangeBookTimeout = window.setTimeout(run, 900);
      };

      const renderEvents = () => {
        const pageSize = getPageSize();
        const visibleEvents = Array.from({ length: Math.min(pageSize, validEvents.length) }, (_, offset) => {
          const eventIndex = (pageStart + offset) % validEvents.length;
          return validEvents[eventIndex];
        });
        container.style.setProperty("--event-card-count", String(visibleEvents.length));

        container.replaceChildren(
          ...visibleEvents.map((ev) => {
          const card = document.createElement("div");
          card.className = "event-card";
          card.setAttribute("role", "link");
          card.tabIndex = 0;

          const title = String(ev.title ?? "");
          const date = String(ev.date ?? "");
          if (date) {
            const dateEl = document.createElement("p");
            dateEl.className = "event-date";
            dateEl.textContent = date;
            card.append(dateEl);
          }

          const h3 = document.createElement("h3");
          h3.className = "event-name";
          h3.textContent = title;
          card.append(h3);

          return card;
        })
        );

        container.querySelectorAll(".event-card").forEach((card) => {
          card.addEventListener("click", () => {
            window.location.href = "/html/church/events.html";
          });
          card.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            window.location.href = "/html/church/events.html";
          });
        });

        const showArrows = validEvents.length > pageSize;
        [prevEventsButton, nextEventsButton].forEach((button) => {
          if (!button) return;
          button.classList.toggle("is-hidden", !showArrows);
          button.disabled = !showArrows;
        });

        placeOrangeBook();
      };

      if (prevEventsButton) {
        prevEventsButton.addEventListener("click", () => {
          pageStart = (pageStart - getPageSize() + validEvents.length) % validEvents.length;
          renderEvents();
        });
      }

      if (nextEventsButton) {
        nextEventsButton.addEventListener("click", () => {
          pageStart = (pageStart + getPageSize()) % validEvents.length;
          renderEvents();
        });
      }

      window.addEventListener("resize", () => {
        renderEvents();
        scheduleOrangeBook();
      });
      renderEvents();
      scheduleOrangeBook();
    })
    .catch((err) => {
      console.error("[ERROR] Failed to load events on homepage:", err);
    });
}
