




const heroImages = [
  "/images/HomeRotatingImage1.webp",
  "/images/HomeRotatingImage2.webp",
  "/images/HomeRotatingImage3.webp",
];


const heroSection = document.querySelector(".hero");

if (heroSection) {
  let currentImage = 0;


  heroImages.slice(1, 2).forEach((img) => {
    const preload = new Image();
    preload.decoding = "async";
    preload.src = img;

    preload.onerror = () => console.error(`[ERROR] Failed to load: ${img}`);
  });


  heroSection.style.backgroundImage = `url('${heroImages[currentImage]}')`;




  heroSection.style.transition = "background-image 1s ease-in-out";



  setInterval(() => {
    currentImage = (currentImage + 1) % heroImages.length;
    heroSection.style.backgroundImage = `url('${heroImages[currentImage]}')`;
  }, 5000);
} else {

  console.error("[ERROR] Hero section not found in DOM");
}


const container = document.querySelector(".events-cards");

if (container) {
  const normalizeEventImagePath = (path) => {
    const raw = String(path ?? "").trim();
    if (!raw) return "";

    const noOrigin = raw.replace(/^https?:\/\/[^/]+/i, "");
    const noQuery = noOrigin.split(/[?#]/, 1)[0];
    const normalizedSlashes = noQuery.replace(/\\/g, "/");
    const withoutPublicPrefix = normalizedSlashes.replace(/^\/?public\//i, "/");
    const rel = withoutPublicPrefix.startsWith("/")
      ? withoutPublicPrefix
      : "/" + withoutPublicPrefix.replace(/^\.?\//, "");

    return rel.startsWith("/images/") ? rel : "";
  };

  fetch("/content/events.json")
    .then((res) => res.json())
    .then((data) => {
      const events = Array.isArray(data.events) ? data.events : [];

      const validEvents = events.filter((ev) => {
        const title = String(ev.title ?? "").trim();
        const imgPath = normalizeEventImagePath(ev.image);
        return title !== "" && imgPath !== "";
      });

      const top3 = validEvents.slice(0, 3);

      if (top3.length === 0) {
        container.replaceChildren();
        return;
      }

      container.replaceChildren(
        ...top3.map((ev) => {
          const card = document.createElement("div");
          card.className = "event-card";
          card.setAttribute("role", "link");
          card.tabIndex = 0;

          const imgPath = normalizeEventImagePath(ev.image);
          const img = document.createElement("img");
          img.src = imgPath;
          img.alt = String(ev.title ?? "Martin Luther event");
          img.loading = "lazy";
          img.decoding = "async";
          card.append(img);

          const title = String(ev.title ?? "");
          const h3 = document.createElement("h3");
          h3.className = "event-name";
          h3.textContent = title;
          card.append(h3);

          const date = String(ev.date ?? "");
          const dateEl = document.createElement("p");
          dateEl.className = "event-date";
          dateEl.textContent = date;
          card.append(dateEl);

          card.addEventListener("click", () => {
            window.location.href = "/html/church/events.html";
          });
          card.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            window.location.href = "/html/church/events.html";
          });

          return card;
        })
      );
    })
    .catch((err) => {
      console.error("[ERROR] Failed to load events on homepage:", err);
    });
}
