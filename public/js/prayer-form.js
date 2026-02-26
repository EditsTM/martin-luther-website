document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("prayerForm");
  const msg = document.getElementById("form-msg");
  if (!form || !msg) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const share = form.querySelector('input[name="share"]:checked');
    if (!share) {
      msg.style.display = "block";
      msg.textContent = "Please select Yes or No.";
      return;
    }

    const data = {
      name: form.name.value,
      email: form.email.value,
      prayer: form.prayer.value,
      share: share.value,
      website: form.website.value,
    };

    try {
      const res = await fetch("/prayer/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        window.location.href = "/html/thankYou.html";
        return;
      }

      const err = await res.json().catch(() => ({}));
      msg.style.display = "block";
      msg.textContent = err.error || "Error sending prayer request.";
    } catch (error) {
      console.error("Prayer form network error:", error);
      msg.style.display = "block";
      msg.textContent = "Network error. Please try again later.";
    }
  });
});
