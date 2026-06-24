import { html, useState } from "../html.js";
import { cityName } from "../data.js";
import { formatXAF, formatDateLong } from "../format.js";
import { navigate } from "../router.js";
import { useApp } from "../app.js";

export function Passengers() {
  const app = useApp();
  const { trip, seats } = app.draft;

  if (!trip || !seats.length) {
    return html`
      <div class="container narrow center-block">
        <h1>Aucune réservation en cours</h1>
        <p>Commencez par rechercher un trajet et choisir votre place.</p>
        <a class="btn btn-primary" href="#/">Rechercher un trajet</a>
      </div>
    `;
  }

  const [passengers, setPassengers] = useState(
    seats.map((s, i) => (app.draft.passengers[i] ? app.draft.passengers[i] : { seat: s, fullName: "" }))
  );
  const [phone, setPhone] = useState(app.draft.contactPhone || "");
  const [email, setEmail] = useState(app.draft.contactEmail || "");
  const [errors, setErrors] = useState({});

  function setName(i, value) {
    setPassengers((prev) => prev.map((p, idx) => (idx === i ? { ...p, fullName: value } : p)));
  }

  function validate() {
    const e = {};
    passengers.forEach((p, i) => {
      if (!p.fullName.trim()) e["p" + i] = "Nom requis";
    });
    const cleanPhone = phone.replace(/\s/g, "");
    if (!/^0?[0-9]{8,9}$/.test(cleanPhone)) e.phone = "Numéro de téléphone invalide (ex. 06 612 34 56)";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function proceed() {
    if (!validate()) return;
    app.setPassengers(passengers);
    app.draft.contactPhone = phone;
    app.draft.contactEmail = email;
    navigate("/paiement");
  }

  const total = trip.price * seats.length;

  return html`
    <div class="container booking-layout">
      <div class="booking-main">
        <a class="back-link" href=${"#/sieges?" + new URLSearchParams({ trip: trip.tripId, date: trip.date, pax: String(seats.length) }).toString()}>← Modifier les sièges</a>
        <h1>Informations des passagers</h1>

        <div class="form-card">
          ${passengers.map(
            (p, i) => html`
              <div class="passenger-block" key=${p.seat}>
                <div class="passenger-head">
                  <span class="seat-chip">Siège ${p.seat}</span>
                  <span>Passager ${i + 1}</span>
                </div>
                <div class="field">
                  <label>Nom complet</label>
                  <input
                    type="text"
                    placeholder="Ex. Jean Makaya"
                    value=${p.fullName}
                    onInput=${(e) => setName(i, e.target.value)}
                  />
                  ${errors["p" + i] && html`<span class="field-error">${errors["p" + i]}</span>`}
                </div>
              </div>
            `
          )}

          <h3 class="form-subtitle">Coordonnées de contact</h3>
          <div class="field-grid">
            <div class="field">
              <label>Téléphone (Mobile Money)</label>
              <input type="tel" placeholder="06 612 34 56" value=${phone} onInput=${(e) => setPhone(e.target.value)} />
              ${errors.phone && html`<span class="field-error">${errors.phone}</span>`}
            </div>
            <div class="field">
              <label>E-mail (facultatif)</label>
              <input type="email" placeholder="vous@exemple.cg" value=${email} onInput=${(e) => setEmail(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <aside class="booking-side">
        <div class="summary-card">
          <h3>Récapitulatif</h3>
          <div class="summary-row"><span>Compagnie</span><strong>${trip.operatorName}</strong></div>
          <div class="summary-row"><span>Trajet</span><strong>${cityName(trip.from)} → ${cityName(trip.to)}</strong></div>
          <div class="summary-row"><span>Date</span><strong>${formatDateLong(trip.date)}</strong></div>
          <div class="summary-row"><span>Départ</span><strong>${trip.departTime}</strong></div>
          <div class="summary-row"><span>Sièges</span><strong>${seats.join(", ")}</strong></div>
          <hr />
          <div class="summary-row"><span>${seats.length} × ${formatXAF(trip.price)}</span><strong></strong></div>
          <div class="summary-total"><span>Total</span><strong>${formatXAF(total)}</strong></div>
          <button class="btn btn-primary btn-block" onClick=${proceed}>Continuer vers le paiement</button>
        </div>
      </aside>
    </div>
  `;
}
