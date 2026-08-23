/**
 * Dashboard corporativo de AgroRoot.
 *
 * Flujo: lista PIVs pendientes → al comprar muestra la cotización de gas en
 * USD₮ (criterio explícito del jurado) → confirma y dispara el pago gasless.
 */

const state = {
  filter: "pending",
  pivs: [],
  priceUsdt: "25",
  selected: null,
  quote: null,
  busy: false,
};

const el = {
  grid: document.getElementById("grid"),
  feedback: document.getElementById("feedback"),
  statPending: document.getElementById("stat-pending"),
  statPrice: document.getElementById("stat-price"),
  statFunded: document.getElementById("stat-funded"),
  statTotal: document.getElementById("stat-total"),
  filters: document.getElementById("filters"),
  modal: document.getElementById("modal"),
  modalSub: document.getElementById("modal-sub"),
  modalError: document.getElementById("modal-error"),
  quoteAmount: document.getElementById("quote-amount"),
  quoteFee: document.getElementById("quote-fee"),
  quoteTotal: document.getElementById("quote-total"),
  btnCancel: document.getElementById("btn-cancel"),
  btnConfirm: document.getElementById("btn-confirm"),
};

const STATUS_LABEL = {
  pending: "Pendiente",
  funding: "Pagando",
  funded: "Comprado",
  failed: "Falló",
};

function showFeedback(message, kind = "ok") {
  el.feedback.className = `feedback ${kind}`;
  el.feedback.innerHTML = message;
  el.feedback.hidden = false;
}

function clearFeedback() {
  el.feedback.hidden = true;
}

function formatCoords(piv) {
  if (piv.latitude === null || piv.longitude === null) {
    return piv.location || "Ubicación no registrada";
  }
  return `${piv.latitude.toFixed(5)}, ${piv.longitude.toFixed(5)}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("es-BO", { dateStyle: "medium", timeStyle: "short" });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
}

async function loadPivs() {
  const url = state.filter === "all" ? "/api/pivs" : `/api/pivs?status=${state.filter}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "No se pudo cargar la lista");

    state.pivs = data.pivs;
    state.priceUsdt = data.priceUsdt || state.priceUsdt;
    render();
  } catch (error) {
    el.grid.innerHTML = `<p class="empty">No se pudo conectar con el servidor: ${escapeHtml(error.message)}</p>`;
  }

  loadStats();
}

async function loadStats() {
  try {
    const response = await fetch("/api/pivs");
    const data = await response.json();
    if (!data.ok) return;

    const pending = data.pivs.filter((p) => p.status === "pending").length;
    const funded = data.pivs.filter((p) => p.status === "funded");
    const total = funded.reduce((sum, p) => sum + Number(p.amountUsdt || 0), 0);

    el.statPending.textContent = pending;
    el.statPrice.textContent = `${data.priceUsdt} USD₮`;
    el.statFunded.textContent = funded.length;
    el.statTotal.textContent = `${total} USD₮`;
  } catch {
    /* los stats son informativos; si fallan la lista igual sirve */
  }
}

function cardTemplate(piv) {
  const photo = piv.hasPhoto
    ? `<img class="card-photo" src="${piv.photoUrl}" alt="Parcela del PIV #${piv.id}" loading="lazy"
         onerror="this.outerHTML='<div class=&quot;card-photo-missing&quot;>Foto no disponible</div>'" />`
    : `<div class="card-photo-missing">Sin foto</div>`;

  const mapLink =
    piv.latitude !== null && piv.longitude !== null
      ? `<a href="https://www.openstreetmap.org/?mlat=${piv.latitude}&mlon=${piv.longitude}#map=16/${piv.latitude}/${piv.longitude}" target="_blank" rel="noopener">Ver en mapa ↗</a>`
      : "";

  const action =
    piv.status === "pending"
      ? `<button class="btn btn-primary btn-block" data-buy="${piv.id}">Comprar por ${state.priceUsdt} USD₮</button>`
      : piv.txHash
        ? `<a class="tx-link" href="${piv.explorerUrl}" target="_blank" rel="noopener">Tx: ${piv.txHash.slice(0, 18)}… ↗</a>`
        : "";

  return `
    <article class="card">
      ${photo}
      <div class="card-body">
        <div class="card-top">
          <span class="card-id">PIV #${piv.id}</span>
          <span class="badge ${piv.status}">${STATUS_LABEL[piv.status] || piv.status}</span>
        </div>
        <div class="card-meta">
          <span>👤 ${escapeHtml(piv.farmerName || `Agricultor ${piv.chatId}`)}</span>
          <span>📍 ${escapeHtml(formatCoords(piv))} ${mapLink}</span>
          <span>🕓 ${escapeHtml(formatDate(piv.createdAt))}</span>
        </div>
        <div class="card-foot">${action}</div>
      </div>
    </article>`;
}

function render() {
  if (state.pivs.length === 0) {
    const label =
      state.filter === "pending"
        ? "No hay PIV pendientes. Manda una foto y ubicación al bot de Telegram para crear uno."
        : "No hay PIV para este filtro todavía.";
    el.grid.innerHTML = `<p class="empty">${label}</p>`;
    return;
  }

  el.grid.innerHTML = state.pivs.map(cardTemplate).join("");
}

/* ---------- Compra: cotización + confirmación ---------- */

function openModal(piv) {
  state.selected = piv;
  state.quote = null;

  el.modalSub.textContent = `PIV #${piv.id} · ${piv.farmerName || `Agricultor ${piv.chatId}`}`;
  el.quoteAmount.textContent = `${state.priceUsdt} USD₮`;
  el.quoteFee.textContent = "calculando…";
  el.quoteTotal.textContent = "—";
  el.modalError.hidden = true;
  el.btnConfirm.disabled = true;
  el.modal.hidden = false;

  fetchQuote(piv);
}

function closeModal() {
  if (state.busy) return;
  el.modal.hidden = true;
  state.selected = null;
}

async function fetchQuote(piv) {
  try {
    const response = await fetch(`/api/pivs/quote?amount=${encodeURIComponent(state.priceUsdt)}`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "No se pudo cotizar el gas");
    if (state.selected?.id !== piv.id) return; // el usuario ya cerró o cambió de PIV

    state.quote = data;
    el.quoteFee.textContent = `${data.feeUsdt} USD₮`;
    el.quoteTotal.textContent = `${Number(state.priceUsdt) + Number(data.feeUsdt)} USD₮`;
    el.btnConfirm.disabled = false;
  } catch (error) {
    if (state.selected?.id !== piv.id) return;
    el.quoteFee.textContent = "no disponible";
    el.modalError.textContent = `No se pudo cotizar el gas: ${error.message}. Revisa las credenciales de WDK/Sepolia en .env.`;
    el.modalError.hidden = false;
    el.btnConfirm.disabled = false; // el pago puede intentarse igual
  }
}

async function confirmPurchase() {
  const piv = state.selected;
  if (!piv) return;

  state.busy = true;
  el.btnConfirm.disabled = true;
  el.btnCancel.disabled = true;
  el.btnConfirm.textContent = "Pagando…";
  el.modalError.hidden = true;

  try {
    const response = await fetch(`/api/pivs/fund/${piv.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: state.priceUsdt }),
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "El pago falló");

    el.modal.hidden = true;
    state.selected = null;
    showFeedback(
      `✅ PIV #${data.pivId} pagado: ${data.amountUsdt} USD₮ al agricultor (gas ${data.feeUsdt} USD₮ cubierto por el paymaster). ` +
        `<a href="${data.explorerUrl}" target="_blank" rel="noopener">Ver transacción ↗</a>` +
        (data.notified ? " · Agricultor notificado por Telegram." : " · No se pudo notificar por Telegram."),
      "ok",
    );
    loadPivs();
  } catch (error) {
    el.modalError.textContent = error.message;
    el.modalError.hidden = false;
  } finally {
    state.busy = false;
    el.btnConfirm.disabled = false;
    el.btnCancel.disabled = false;
    el.btnConfirm.textContent = "Confirmar y pagar";
  }
}

/* ---------- Eventos ---------- */

el.grid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-buy]");
  if (!button) return;

  const piv = state.pivs.find((p) => p.id === Number(button.dataset.buy));
  if (piv) {
    clearFeedback();
    openModal(piv);
  }
});

el.filters.addEventListener("click", (event) => {
  const button = event.target.closest(".filter");
  if (!button) return;

  state.filter = button.dataset.filter;
  el.filters.querySelectorAll(".filter").forEach((f) => f.classList.toggle("is-active", f === button));
  loadPivs();
});

el.btnCancel.addEventListener("click", closeModal);
el.btnConfirm.addEventListener("click", confirmPurchase);
el.modal.addEventListener("click", (event) => {
  if (event.target === el.modal) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !el.modal.hidden) closeModal();
});

loadPivs();
setInterval(() => {
  if (el.modal.hidden && !state.busy) loadPivs();
}, 15000);
