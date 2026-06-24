import { html } from "../html.js";
import { formatXAF, formatDateLong } from "../format.js";

const STATUS_LABEL = {
  pending: "En attente de confirmation",
  confirmed: "Confirmé",
  rejected: "Refusé",
  cancelled: "Annulé",
};

export function Ticket({ booking }) {
  const t = booking.trip;
  return html`
    <div class=${"ticket ticket-" + booking.status}>
      <div class="ticket-head">
        <div>
          <span class="ticket-brand">NzelaBus</span>
          <span class="ticket-op">${t.operatorName}</span>
        </div>
        <span class=${"status-pill " + booking.status}>${STATUS_LABEL[booking.status]}</span>
      </div>

      <div class="ticket-route">
        <div class="tr-side">
          <span class="tr-time">${t.departTime}</span>
          <span class="tr-city">${t.fromName}</span>
        </div>
        <div class="tr-mid">
          <span class="tr-bus">🚌</span>
          <span class="tr-dash"></span>
        </div>
        <div class="tr-side end">
          <span class="tr-time">${t.arriveTime}${t.arriveDayShift > 0 ? html`<sup>+1j</sup>` : null}</span>
          <span class="tr-city">${t.toName}</span>
        </div>
      </div>

      <div class="ticket-grid">
        <div><span>Date</span><strong>${formatDateLong(t.date)}</strong></div>
        <div><span>Référence</span><strong>${booking.ref}</strong></div>
        <div><span>Sièges</span><strong>${booking.seats.join(", ")}</strong></div>
        <div><span>Bus</span><strong>${t.busType}</strong></div>
      </div>

      <div class="ticket-pax">
        <span class="ticket-label">Passagers</span>
        <ul>
          ${booking.passengers.map(
            (p) => html`<li key=${p.seat}><span class="seat-chip small">Siège ${p.seat}</span> ${p.fullName}</li>`
          )}
        </ul>
      </div>

      <div class="ticket-foot">
        <div>
          <span class="ticket-label">Paiement</span>
          <div>${booking.payment.methodLabel} · code <code>${booking.payment.transactionCode}</code></div>
        </div>
        <div class="ticket-total">
          <span class="ticket-label">Total</span>
          <strong>${formatXAF(booking.total)}</strong>
        </div>
      </div>
    </div>
  `;
}
