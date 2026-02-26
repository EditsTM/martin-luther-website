document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contactForm");
  const msgBox = document.getElementById("rateLimitMsg");
  if (!form || !msgBox) return;

  const phoneInput = form.querySelector('input[name="phone"]');
  if (phoneInput) {
    phoneInput.addEventListener("input", () => {
      phoneInput.value = String(phoneInput.value || "").replace(/\D+/g, "");
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgBox.style.display = "none";

    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    try {
      const res = await fetch("/contact/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.status === 429) {
        const result = await res.json().catch(() => ({}));
        const retry = result.retryAfter ? parseInt(result.retryAfter, 10) : 600;
        startCountdown(retry);
        return;
      }

      const result = await res.json().catch(() => ({}));
      if (result.ok) {
        window.location.href = "/html/thankYou.html";
      } else {
        msgBox.style.display = "block";
        msgBox.textContent = result.error || "Error sending message.";
      }
    } catch (err) {
      console.error("Contact form network error:", err);
      msgBox.style.display = "block";
      msgBox.textContent = "Network error. Please try again later.";
    }
  });

  function startCountdown(seconds) {
    let remaining = seconds;
    msgBox.style.display = "block";
    const tick = () => {
      const minutes = Math.floor(remaining / 60);
      const secs = remaining % 60;
      msgBox.textContent = `Too many messages. Try again in ${minutes}:${secs
        .toString()
        .padStart(2, "0")}`;
      if (remaining > 0) {
        remaining -= 1;
        setTimeout(tick, 1000);
      } else {
        msgBox.style.display = "none";
      }
    };
    tick();
  }
});
