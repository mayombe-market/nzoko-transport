import { html, useState, useEffect } from "../html.js";
import { formatXAF, formatDateLong } from "../format.js";
import { getBookingByRef, getConfig } from "../store.js";
import { Ticket } from "../components/Ticket.js";

export function Confirmation({ params }) {
  const ref = params.ref;
  const [booking, setBooking] = useState(() => getBookingByRef(ref));
  const cfg = getConfig();

  // rafraîchit l'état (si l'agent confirme dans un autre onglet)
  useEffect(() => {
    const t = setInterval(() => setBooking(getBookingByRef(ref)), 2500);
    return () => clearInterval(t);
  }, [ref]);

  if (!booking) {
    return html`
      <div class="container narrow center-block">
        <h1>Réservation introuvable</h1>
        <p>Aucune réservation ne correspond à la référence ${ref}.</p>
        <a class="btn btn-primary" href="#/">Retour à l'accueil</a>
      </div>
    `;
  }

  return html`
    <div class="container narrow confirmation">
      <div class=${"confirm-banner " + booking.status}>
        ${booking.status === "pending" &&
        html`<div><span class="confirm-emoji">⏳</span><h1>Paiement soumis</h1><p>Votre billet est en attente de confirmation par notre agent.</p></div>`}
        ${booking.status === "confirmed" &&
        html`<div><span class="confirm-emoji">✅</span><h1>Billet confirmé !</h1><p>Bon voyage avec NzelaBus.</p></div>`}
        ${booking.status === "rejected" &&
        html`<div><span class="confirm-emoji">❌</span><h1>Paiement non validé</h1><p>${booking.adminNote || "Contactez le support pour régulariser."}</p></div>`}
      </div>

      <${Ticket} booking=${booking} />

      ${booking.status === "pending" &&
      html`
        <div class="info-note">
          <p>
            ⏳ Un agent vérifie le code de transaction
            <code>${booking.payment.transactionCode}</code> envoyé au numéro
            <b>${booking.payment.payNumber}</b>. Cette page se met à jour automatiquement.
          </p>
          <p class="muted">Besoin d'aide ? Appelez le ${cfg.supportPhone} en citant la référence ${booking.ref}.</p>
        </div>
      `}

      <div class="confirm-actions">
        <a class="btn btn-outline" href=${"#/mes-billets?ref=" + booking.ref}>Suivre dans « Mes billets »</a>
        <a class="btn btn-primary" href="#/">Réserver un autre trajet</a>
      </div>
    </div>
  `;
}
