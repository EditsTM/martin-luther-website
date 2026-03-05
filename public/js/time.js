/**
 * File: public\js\time.js
 * Purpose: Implements client-side behavior for the church time page.
 */
(() => {
  const DEFAULT_CARD = {
    id: null,
    title: "Service Times",
    note: "*Summer hours will differ",
    isAdminOnly: false,
    sections: [
      { label: "Sunday Mornings", timeText: "8:00am & 10:30am" },
      { label: "Monday Evenings", timeText: "6:00pm" },
    ],
  };

  let isAdmin = false;
  let serviceCards = [JSON.parse(JSON.stringify(DEFAULT_CARD))];
  let editingCardId = null;
  let modalSections = [];
  let serviceTimesLoadFailed = false;
  let isReorderingCards = false;

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta?.getAttribute("content") || "";
  }

  async function fetchJson(url, options = {}) {
    const res = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
    });

    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const err = await res.json();
          msg = err?.error || err?.message || msg;
        }
      } catch (_) {}
      msg = `${msg} [${options?.method || "GET"} ${url}]`;
      throw new Error(msg);
    }

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) throw new Error("Expected JSON response.");
    return res.json();
  }

  async function postJson(url, payload) {
    const csrf = getCsrfToken();
    const headers = { "Content-Type": "application/json" };
    if (csrf) headers["X-CSRF-Token"] = csrf;

    return fetchJson(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  }

  async function deleteJson(url) {
    const csrf = getCsrfToken();
    const headers = {};
    if (csrf) headers["X-CSRF-Token"] = csrf;

    return fetchJson(url, {
      method: "DELETE",
      headers,
    });
  }

  async function isAdminLoggedIn() {
    try {
      const data = await fetchJson("/admin/check");
      return !!data.loggedIn;
    } catch (err) {
      console.error("Failed admin check:", err);
      return false;
    }
  }

  function normalizeSection(raw, fallback = { label: "Service Label", timeText: "Service Time" }) {
    const src = raw && typeof raw === "object" ? raw : {};
    return {
      id: Number(src.id) || null,
      label: String(src.label || fallback.label).slice(0, 120),
      timeText: String(src.timeText || fallback.timeText).slice(0, 120),
    };
  }

  function normalizeCard(raw, fallback = DEFAULT_CARD) {
    const src = raw && typeof raw === "object" ? raw : {};
    const sectionsIn = Array.isArray(src.sections) ? src.sections : fallback.sections;
    const sections = sectionsIn.map((s) => normalizeSection(s)).slice(0, 12);

    return {
      id: Number(src.id) || null,
      title: String(src.title || fallback.title).slice(0, 80),
      note: String(src.note || "").slice(0, 200),
      isAdminOnly: !!src.isAdminOnly,
      sections: sections.length ? sections : fallback.sections.map((s) => normalizeSection(s)),
    };
  }

  function normalizeCardsResponse(data) {
    if (data && Array.isArray(data.cards)) {
      const cards = data.cards.map((card) => normalizeCard(card));
      return cards.length ? cards : [normalizeCard(DEFAULT_CARD)];
    }

    // Back-compat with the earlier single-card payload shape.
    if (data && typeof data === "object") {
      const card = normalizeCard({
        id: 1,
        title: data.title,
        note: data.note,
        isAdminOnly: false,
        sections: [
          { label: data.firstLabel, timeText: data.firstTime },
          { label: data.secondLabel, timeText: data.secondTime },
        ],
      });
      return [card];
    }

    return [normalizeCard(DEFAULT_CARD)];
  }

  function renderCardBody(bodyEl, card) {
    if (!bodyEl) return;
    bodyEl.innerHTML = "";

    card.sections.forEach((section, idx) => {
      const labelEl = document.createElement("h3");
      labelEl.textContent = section.label || "Service Label";
      const timeEl = document.createElement("p");
      timeEl.textContent = section.timeText || "Service Time";
      bodyEl.appendChild(labelEl);
      bodyEl.appendChild(timeEl);

      if (idx < card.sections.length - 1) {
        bodyEl.appendChild(document.createElement("hr"));
      }
    });

    const note = String(card.note || "").trim();
    if (note) {
      const noteEl = document.createElement("p");
      noteEl.className = "small-note";
      noteEl.textContent = note;
      bodyEl.appendChild(noteEl);
    }
  }

  function openModalForCard(cardId) {
    const modal = document.getElementById("service-times-modal");
    const titleInput = document.getElementById("service-modal-title");
    const noteInput = document.getElementById("service-modal-note");
    const deleteBtn = document.getElementById("service-modal-delete-btn");
    if (!modal || !titleInput || !noteInput || !deleteBtn) return;

    const card = serviceCards.find((c) => Number(c.id) === Number(cardId));
    if (!card) return;

    editingCardId = Number(card.id);
    if (!Number.isInteger(editingCardId) || editingCardId <= 0) {
      alert("Service times are not loaded from the server yet. Refresh and try again.");
      return;
    }
    modalSections = card.sections.map((s) => normalizeSection(s));

    titleInput.value = card.title;
    noteInput.value = card.note || "";
    deleteBtn.style.display = card.isAdminOnly ? "inline-block" : "none";

    renderModalSections();
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    const modal = document.getElementById("service-times-modal");
    if (!modal) return;
    modal.classList.remove("open");
    document.body.style.overflow = "";
    editingCardId = null;
    modalSections = [];
  }

  function renderModalSections() {
    const list = document.getElementById("service-modal-sections-list");
    if (!list) return;

    list.innerHTML = "";

    modalSections.forEach((section, idx) => {
      const sectionWrap = document.createElement("div");
      sectionWrap.className = "service-modal-section";
      sectionWrap.dataset.index = String(idx);

      const title = document.createElement("p");
      title.className = "service-modal-section-title";
      title.textContent = `Section ${idx + 1}`;

      const labelWrap = document.createElement("label");
      labelWrap.className = "modal-label";
      labelWrap.textContent = "Service Label";
      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.value = section.label || "";
      labelInput.addEventListener("input", () => {
        modalSections[idx].label = String(labelInput.value || "");
      });
      labelWrap.appendChild(labelInput);

      const timeWrap = document.createElement("label");
      timeWrap.className = "modal-label";
      timeWrap.textContent = "Service Time";
      const timeInput = document.createElement("input");
      timeInput.type = "text";
      timeInput.value = section.timeText || "";
      timeInput.addEventListener("input", () => {
        modalSections[idx].timeText = String(timeInput.value || "");
      });
      timeWrap.appendChild(timeInput);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "event-modal-delete service-modal-remove-section-btn";
      removeBtn.textContent = "Delete Section";
      removeBtn.disabled = modalSections.length <= 1;
      removeBtn.addEventListener("click", () => {
        if (modalSections.length <= 1) return;
        modalSections.splice(idx, 1);
        renderModalSections();
      });

      sectionWrap.appendChild(title);
      sectionWrap.appendChild(labelWrap);
      sectionWrap.appendChild(timeWrap);
      sectionWrap.appendChild(removeBtn);
      list.appendChild(sectionWrap);
    });
  }

  function renderPrimaryCard(card) {
    const titleEl = document.getElementById("service-title");
    const bodyEl = document.getElementById("service-times-body");
    const editBtn = document.getElementById("edit-service-times-btn");

    if (titleEl) titleEl.textContent = card.title;
    renderCardBody(bodyEl, card);

    if (editBtn) {
      if (isAdmin) {
        editBtn.classList.add("admin-only");
        editBtn.onclick = () => openModalForCard(card.id);
      } else {
        editBtn.style.display = "none";
      }
    }
  }

  function renderExtraCards() {
    const container = document.getElementById("service-times-extra-list");
    if (!container) return;
    container.innerHTML = "";

    const extras = serviceCards.slice(1);
    if (!extras.length) return;

    extras.forEach((card) => {
      const cardEl = document.createElement("div");
      cardEl.className = "time-card service-time-extra-card";
      cardEl.dataset.cardId = String(card.id ?? "");

      const header = document.createElement("div");
      header.className = "card-header";
      header.innerHTML = `
        <img src="/images/time.png" alt="Clock icon" />
        <h2>${card.title}</h2>
      `;

      const body = document.createElement("div");
      body.className = "card-body";
      renderCardBody(body, card);

      cardEl.appendChild(header);
      cardEl.appendChild(body);

      if (isAdmin) {
        cardEl.setAttribute("draggable", "true");

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "edit-btn admin-only";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", () => openModalForCard(card.id));
        cardEl.appendChild(editBtn);
      }

      container.appendChild(cardEl);
    });

    if (isAdmin) {
      wireExtraCardsDragAndDrop(container);
    }
  }

  function getExtraCardIdsFromDom(container) {
    return Array.from(container.querySelectorAll(".service-time-extra-card[data-card-id]"))
      .map((el) => Number(el.dataset.cardId))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  function getClosestDropTarget(container, x, y, draggingEl) {
    const cards = Array.from(container.querySelectorAll(".service-time-extra-card"));
    let closest = null;
    let closestDistance = Infinity;

    cards.forEach((card) => {
      if (card === draggingEl) return;
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = cx - x;
      const dy = cy - y;
      const dist = Math.hypot(dx, dy);
      if (dist < closestDistance) {
        closestDistance = dist;
        closest = card;
      }
    });

    return closest;
  }

  function wireExtraCardsDragAndDrop(container) {
    if (container.dataset.reorderBound === "1") return;
    container.dataset.reorderBound = "1";

    let draggingEl = null;
    let startOrder = [];

    container.addEventListener("dragstart", (e) => {
      if (!isAdmin) return;
      const card = e.target.closest(".service-time-extra-card");
      if (!card) return;
      draggingEl = card;
      startOrder = getExtraCardIdsFromDom(container);
      card.classList.add("is-dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", card.dataset.cardId || "");
      }
    });

    container.addEventListener("dragover", (e) => {
      if (!draggingEl) return;
      e.preventDefault();

      const target = getClosestDropTarget(container, e.clientX, e.clientY, draggingEl);
      if (!target || target === draggingEl) return;

      const rect = target.getBoundingClientRect();
      const placeAfter = e.clientY > rect.top + rect.height / 2;
      if (placeAfter) container.insertBefore(draggingEl, target.nextSibling);
      else container.insertBefore(draggingEl, target);
    });

    container.addEventListener("drop", (e) => {
      if (draggingEl) e.preventDefault();
    });

    container.addEventListener("dragend", async () => {
      if (!draggingEl) return;
      draggingEl.classList.remove("is-dragging");
      draggingEl = null;

      const endOrder = getExtraCardIdsFromDom(container);
      if (!endOrder.length || JSON.stringify(endOrder) === JSON.stringify(startOrder)) return;
      if (isReorderingCards) return;

      isReorderingCards = true;
      try {
        const out = await postJson("/admin/service-times/reorder", { cardIds: endOrder });
        if (!out?.success) throw new Error("Reorder failed");
        await loadServiceTimes();
      } catch (err) {
        console.error("Failed to reorder service time cards:", err);
        alert(`Error reordering service time cards.\n${err.message || "Unknown error"}`);
        await loadServiceTimes();
      } finally {
        isReorderingCards = false;
      }
    });
  }

  function renderAllCards() {
    const first = serviceCards[0] ? normalizeCard(serviceCards[0]) : normalizeCard(DEFAULT_CARD);
    renderPrimaryCard(first);
    renderExtraCards();
  }

  async function loadServiceTimes() {
    try {
      const data = await fetchJson("/content/service-times.json");
      serviceCards = normalizeCardsResponse(data);
      serviceTimesLoadFailed = false;
    } catch (err) {
      console.error("Failed to load service times:", err);
      serviceCards = [normalizeCard(DEFAULT_CARD)];
      serviceTimesLoadFailed = true;
    }
    renderAllCards();
  }

  function setupModalHandlers() {
    const modal = document.getElementById("service-times-modal");
    const closeBtn = document.getElementById("service-modal-close-btn");
    const saveBtn = document.getElementById("service-modal-save-btn");
    const addSectionBtn = document.getElementById("service-modal-add-section-btn");
    const deleteBtn = document.getElementById("service-modal-delete-btn");
    const titleInput = document.getElementById("service-modal-title");
    const noteInput = document.getElementById("service-modal-note");
    const addCardBtn = document.getElementById("add-service-time-btn");

    if (
      !modal ||
      !closeBtn ||
      !saveBtn ||
      !addSectionBtn ||
      !deleteBtn ||
      !titleInput ||
      !noteInput ||
      !addCardBtn
    ) {
      return;
    }

    let pointerDownOnOverlay = false;

    closeBtn.addEventListener("click", closeModal);

    modal.addEventListener("mousedown", (e) => {
      pointerDownOnOverlay = e.target === modal;
    });
    modal.addEventListener("click", (e) => {
      const overlayClick = e.target === modal && pointerDownOnOverlay;
      pointerDownOnOverlay = false;
      if (overlayClick) closeModal();
    });

    addCardBtn.addEventListener("click", async () => {
      if (!isAdmin) return;
      if (serviceTimesLoadFailed) {
        alert("Service times failed to load from the server. Refresh this page before adding a card.");
        return;
      }
      try {
        const out = await postJson("/admin/service-times/card", {});
        if (!out?.success || !out.card?.id) throw new Error("Card create failed");
        await loadServiceTimes();
        openModalForCard(out.card.id);
      } catch (err) {
        console.error("Failed to add service time card:", err);
        alert(`Error creating a new service time card.\n${err.message || "Unknown error"}`);
      }
    });

    addSectionBtn.addEventListener("click", () => {
      if (!isAdmin) return;
      modalSections.push({ label: "Service Label", timeText: "Service Time" });
      renderModalSections();
    });

    deleteBtn.addEventListener("click", async () => {
      if (!isAdmin || editingCardId === null) return;
      if (!confirm("Are you sure you want to delete this service time card?")) return;

      try {
        const out = await deleteJson(`/admin/service-times/card/${editingCardId}`);
        if (!out?.success) throw new Error("Delete failed");
        closeModal();
        await loadServiceTimes();
      } catch (err) {
        console.error("Failed to delete service time card:", err);
        alert("Error deleting service time card.");
      }
    });

    saveBtn.addEventListener("click", async () => {
      if (!isAdmin || editingCardId === null) return;
      if (!Number.isInteger(editingCardId) || editingCardId <= 0) {
        alert("This card does not have a valid server ID. Refresh and try again.");
        return;
      }

      const payload = {
        title: String(titleInput.value || "").trim() || "Service Times",
        note: String(noteInput.value || "").trim(),
        sections: modalSections.map((s) => ({
          label: String(s.label || "").trim() || "Service Label",
          timeText: String(s.timeText || "").trim() || "Service Time",
        })),
      };

      if (!payload.sections.length) {
        payload.sections = [{ label: "Service Label", timeText: "Service Time" }];
      }

      try {
        const out = await postJson(`/admin/service-times/card/${editingCardId}`, payload);
        if (!out?.success) throw new Error("Save failed");
        closeModal();
        await loadServiceTimes();
      } catch (err) {
        console.error("Failed to save service time card:", err);
        alert(`Error saving service time card.\n${err.message || "Unknown error"}`);
      }
    });
  }

  async function init() {
    isAdmin = await isAdminLoggedIn();
    if (isAdmin) document.body.classList.add("admin-mode");

    setupModalHandlers();
    await loadServiceTimes();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
