import { html, useState } from "../html.js";
import { cityName } from "../data.js";
import { formatXAF, formatDateLong, genBookingRef } from "../format.js";
import { navigate } from "../router.js";
import { useApp } from "../app.js";
import { getConfig, addBooking } from "../store.js";

export function Payment() {
  const app = useApp();
  const { trip, seats, passengers } = app.draft;
  const cfg = getConfig();

  if (!trip || !seats.length || !passengers.length) {
    return html`
      <div class="container narrow center-block">
        <h1>Aucune réservation en cours</h1>
        <a class="btn btn-primary" href="#/">Rechercher un trajet</a>
      </div>
    `;
  }

  const total = trip.price * seats.length;
  const [ref] = useState(genBookingRef);
  const [method, setMethod] = useState("mtn");
  const [txCode, setTxCode] = useState("");
  const [senderNumber, setSenderNumber] = useState(app.draft.contactPhone || "");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const payNumber = method === "mtn" ? cfg.mtnNumber : cfg.airtelNumber;
  const methodLabel = method === "mtn" ? "MTN Mobile Money" : "Airtel Money";

  function copy(text, key) {
    try {
      navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch (e) {}
  }

  function submit() {
    const clean = txCode.replace(/\s/g, "");
    if (clean.length < 6) {
      setError("Saisissez le code de transaction reçu par SMS (au moins 6 caractères).");
      return;
    }
    if (!senderNumber.replace(/\s/g, "")) {
      setError("Indiquez le numéro depuis lequel vous avez envoyé l'argent.");
      return;
    }
    setError("");

    const booking = {
      ref,
      tripId: trip.tripId,
      status: "pending", // en attente de confirmation par l'agent
      createdAt: new Date().toISOString(),
      // infos trajet (figées pour l'affichage du billet)
      trip: {
        operatorName: trip.operatorName,
        busType: trip.busType,
        from: trip.from,
        to: trip.to,
        fromName: cityName(trip.from),
        toName: cityName(trip.to),
        date: trip.date,
        departTime: trip.departTime,
        arriveTime: trip.arriveTime,
        arriveDayShift: trip.arriveDayShift,
      },
      seats: [...seats],
      passengers: passengers.map((p) => ({ seat: p.seat, fullName: p.fullName })),
      unitPrice: trip.price,
      total,
      contactPhone: app.draft.contactPhone || senderNumber,
      contactEmail: app.draft.contactEmail || "",
      payment: {
        method,
        methodLabel,
        payNumber,
        senderNumber,
        transactionCode: clean,
      },
    };

    addBooking(booking);
    app.reset();
    navigate("/confirmation", { ref });
  }

  return html`
    <div class="container booking-layout">
      <div class="booking-main">
        <h1>Paiement Mobile Money</h1>
        <p class="muted">Votre réservation est presque terminée. Suivez les étapes ci-dessous.</p>

        <div class="method-tabs">
          <button class=${"method-tab" + (method === "mtn" ? " active" : "")} onClick=${() => setMethod("mtn")}>
            <span class="mm-dot mtn"></span> MTN Mobile Money
          </button>
          <button class=${"method-tab" + (method === "airtel" ? " active" : "")} onClick=${() => setMethod("airtel")}>
            <span class="mm-dot airtel"></span> Airtel Money
          </button>
        </div>

        <div class="pay-steps">
          <div class="pay-step">
            <span class="pay-num">1</span>
            <div>
              <strong>Envoyez le montant exact</strong>
              <p class="muted">Depuis votre application ${methodLabel}, envoyez le montant ci-dessous au numéro NzelaBus.</p>
              <div class="pay-amount-box">
                <div class="pay-line">
                  <span>Montant à envoyer</span>
                  <span class="pay-strong">
                    ${formatXAF(total)}
                    <button class="copy-btn" onClick=${() => copy(String(total), "amt")}>${copied === "amt" ? "Copié ✓" : "Copier"}</button>
                  </span>
                </div>
                <div class="pay-line">
                  <span>Numéro ${methodLabel}</span>
                  <span class="pay-strong">
                    ${payNumber}
                    <button class="copy-btn" onClick=${() => copy(payNumber, "num")}>${copied === "num" ? "Copié ✓" : "Copier"}</button>
                  </span>
                </div>
                <div class="pay-line">
                  <span>Bénéficiaire</span>
                  <span>${cfg.mtnAccountName}</span>
                </div>
                <div class="pay-line">
                  <span>Référence à mentionner</span>
                  <span class="pay-strong">${ref}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="pay-step">
            <span class="pay-num">2</span>
            <div>
              <strong>Récupérez le code de transaction</strong>
              <p class="muted">
                Après l'envoi, vous recevez un SMS de ${methodLabel} avec un <b>code / ID de transaction</b>
                (ex. <code>MP240624.1530.A12345</code>). Saisissez-le ci-dessous.
              </p>
            </div>
          </div>

          <div class="pay-step">
            <span class="pay-num">3</span>
            <div class="pay-form">
              <strong>Confirmez votre paiement</strong>
              <div class="field">
                <label>Numéro ayant envoyé l'argent</label>
                <input type="tel" placeholder="06 612 34 56" value=${senderNumber} onInput=${(e) => setSenderNumber(e.target.value)} />
              </div>
              <div class="field">
                <label>Code / ID de transaction reçu par SMS</label>
                <input
                  type="text"
                  placeholder="Ex. MP240624.1530.A12345"
                  value=${txCode}
                  onInput=${(e) => setTxCode(e.target.value.toUpperCase())}
                />
              </div>
              ${error && html`<p class="form-error">${error}</p>`}
              <button class="btn btn-primary btn-block" onClick=${submit}>
                J'ai payé — Soumettre pour confirmation
              </button>
              <p class="pay-note">
                🔒 Un agent NzelaBus vérifie votre paiement puis confirme votre billet.
                Vous pouvez suivre l'état dans « Mes billets ».
              </p>
            </div>
          </div>
        </div>
      </div>

      <aside class="booking-side">
        <div class="summary-card">
          <h3>Votre voyage</h3>
          <div class="summary-row"><span>Réf.</span><strong>${ref}</strong></div>
          <div class="summary-row"><span>Compagnie</span><strong>${trip.operatorName}</strong></div>
          <div class="summary-row"><span>Trajet</span><strong>${cityName(trip.from)} → ${cityName(trip.to)}</strong></div>
          <div class="summary-row"><span>Date</span><strong>${formatDateLong(trip.date)}</strong></div>
          <div class="summary-row"><span>Départ</span><strong>${trip.departTime}</strong></div>
          <div class="summary-row"><span>Sièges</span><strong>${seats.join(", ")}</strong></div>
          <hr />
          <div class="summary-total"><span>Total à payer</span><strong>${formatXAF(total)}</strong></div>
        </div>
      </aside>
    </div>
  `;
}
