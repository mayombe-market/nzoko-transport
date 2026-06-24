import { html, useState } from "../html.js";
import {
  getBookings,
  updateBooking,
  isAdminLogged,
  loginAdmin,
  logoutAdmin,
  getConfig,
  saveConfig,
} from "../store.js";
import { formatXAF, formatDateLong } from "../format.js";

function Login({ onOk }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  function submit(e) {
    e.preventDefault();
    if (loginAdmin(code)) onOk();
    else setErr("Code incorrect.");
  }
  return html`
    <div class="container narrow center-block">
      <div class="form-card admin-login">
        <h1>Espace agent</h1>
        <p class="muted">Réservé au personnel NzelaBus.</p>
        <form onSubmit=${submit}>
          <div class="field">
            <label>Code d'accès</label>
            <input type="password" value=${code} onInput=${(e) => setCode(e.target.value)} placeholder="Code agent" />
          </div>
          ${err && html`<p class="form-error">${err}</p>`}
          <button class="btn btn-primary btn-block" type="submit">Se connecter</button>
        </form>
        <p class="pay-note">Code par défaut (démo) : <code>${getConfig().adminPasscode}</code></p>
      </div>
    </div>
  `;
}

function BookingRow({ b, onChange }) {
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);

  function confirm() {
    updateBooking(b.ref, { status: "confirmed", confirmedAt: new Date().toISOString(), adminNote: "" });
    onChange();
  }
  function reject() {
    updateBooking(b.ref, { status: "rejected", adminNote: note || "Code de transaction non valide." });
    onChange();
  }

  return html`
    <div class=${"admin-card " + b.status}>
      <div class="admin-card-top">
        <div>
          <span class="admin-ref">${b.ref}</span>
          <span class=${"status-pill " + b.status}>${b.status === "pending" ? "En attente" : b.status === "confirmed" ? "Confirmé" : "Refusé"}</span>
        </div>
        <span class="admin-amount">${formatXAF(b.total)}</span>
      </div>

      <div class="admin-card-body">
        <div class="admin-col">
          <span class="lbl">Trajet</span>
          <strong>${b.trip.fromName} → ${b.trip.toName}</strong>
          <span class="muted">${formatDateLong(b.trip.date)} · ${b.trip.departTime} · ${b.trip.operatorName}</span>
          <span class="muted">Sièges : ${b.seats.join(", ")}</span>
        </div>
        <div class="admin-col">
          <span class="lbl">Paiement à vérifier</span>
          <strong>${b.payment.methodLabel}</strong>
          <span>Code : <code class="big-code">${b.payment.transactionCode}</code></span>
          <span class="muted">Envoyé par : ${b.payment.senderNumber}</span>
          <span class="muted">Reçu sur : ${b.payment.payNumber}</span>
        </div>
        <div class="admin-col">
          <span class="lbl">Passagers / contact</span>
          ${b.passengers.map((p) => html`<span key=${p.seat}>S${p.seat} — ${p.fullName}</span>`)}
          <span class="muted">Tél : ${b.contactPhone}</span>
          ${b.contactEmail && html`<span class="muted">${b.contactEmail}</span>`}
        </div>
      </div>

      ${b.status === "pending" &&
      html`
        <div class="admin-actions">
          <button class="btn btn-success" onClick=${confirm}>✅ Confirmer le paiement</button>
          <button class="btn btn-outline" onClick=${() => setShowNote((s) => !s)}>Refuser</button>
          ${showNote &&
          html`
            <div class="reject-box">
              <input type="text" placeholder="Motif (facultatif)" value=${note} onInput=${(e) => setNote(e.target.value)} />
              <button class="btn btn-danger" onClick=${reject}>Confirmer le refus</button>
            </div>
          `}
        </div>
      `}
      ${b.status === "rejected" && b.adminNote && html`<div class="admin-note">Motif : ${b.adminNote}</div>`}
    </div>
  `;
}

function ConfigPanel({ onSaved }) {
  const cfg = getConfig();
  const [form, setForm] = useState(cfg);
  const [saved, setSaved] = useState(false);
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); setSaved(false); }
  function save() { saveConfig(form); setSaved(true); onSaved && onSaved(); }
  return html`
    <div class="form-card config-panel">
      <h3>Paramètres de paiement</h3>
      <div class="field-grid">
        <div class="field"><label>Numéro MTN Mobile Money</label><input value=${form.mtnNumber} onInput=${(e) => set("mtnNumber", e.target.value)} /></div>
        <div class="field"><label>Numéro Airtel Money</label><input value=${form.airtelNumber} onInput=${(e) => set("airtelNumber", e.target.value)} /></div>
        <div class="field"><label>Nom du bénéficiaire</label><input value=${form.mtnAccountName} onInput=${(e) => set("mtnAccountName", e.target.value)} /></div>
        <div class="field"><label>Téléphone support</label><input value=${form.supportPhone} onInput=${(e) => set("supportPhone", e.target.value)} /></div>
        <div class="field"><label>Code d'accès agent</label><input value=${form.adminPasscode} onInput=${(e) => set("adminPasscode", e.target.value)} /></div>
      </div>
      <button class="btn btn-primary" onClick=${save}>Enregistrer</button>
      ${saved && html`<span class="saved-tag">Enregistré ✓</span>`}
    </div>
  `;
}

export function Admin() {
  const [logged, setLogged] = useState(isAdminLogged());
  const [, force] = useState(0);
  const [tab, setTab] = useState("pending");
  const refresh = () => force((n) => n + 1);

  if (!logged) return html`<${Login} onOk=${() => setLogged(true)} />`;

  const bookings = getBookings();
  const counts = {
    pending: bookings.filter((b) => b.status === "pending").length,
    confirmed: bookings.filter((b) => b.status === "confirmed").length,
    rejected: bookings.filter((b) => b.status === "rejected").length,
  };
  const list = tab === "config" ? [] : bookings.filter((b) => b.status === tab);

  return html`
    <div class="container admin-page">
      <div class="admin-header">
        <h1>Espace agent — Confirmations</h1>
        <button class="link-btn" onClick=${() => { logoutAdmin(); setLogged(false); }}>Déconnexion</button>
      </div>

      <div class="admin-tabs">
        <button class=${"admin-tab" + (tab === "pending" ? " active" : "")} onClick=${() => setTab("pending")}>En attente <span class="badge">${counts.pending}</span></button>
        <button class=${"admin-tab" + (tab === "confirmed" ? " active" : "")} onClick=${() => setTab("confirmed")}>Confirmés <span class="badge">${counts.confirmed}</span></button>
        <button class=${"admin-tab" + (tab === "rejected" ? " active" : "")} onClick=${() => setTab("rejected")}>Refusés <span class="badge">${counts.rejected}</span></button>
        <button class=${"admin-tab" + (tab === "config" ? " active" : "")} onClick=${() => setTab("config")}>⚙️ Paramètres</button>
      </div>

      ${tab === "config"
        ? html`<${ConfigPanel} onSaved=${refresh} />`
        : list.length === 0
        ? html`<div class="empty-state small"><p>Aucune réservation ${tab === "pending" ? "en attente" : tab === "confirmed" ? "confirmée" : "refusée"} pour le moment.</p></div>`
        : html`<div class="admin-list">${list.map((b) => html`<${BookingRow} key=${b.ref} b=${b} onChange=${refresh} />`)}</div>`}
    </div>
  `;
}
