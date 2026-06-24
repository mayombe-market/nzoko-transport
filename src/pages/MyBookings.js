import { html, useState } from "../html.js";
import { getBookings, getBookingByRef } from "../store.js";
import { Ticket } from "../components/Ticket.js";
import { navigate } from "../router.js";

export function MyBookings({ params }) {
  const [query, setQuery] = useState(params.ref || "");
  const [result, setResult] = useState(() => (params.ref ? getBookingByRef(params.ref.trim().toUpperCase()) : undefined));
  const all = getBookings();

  function search(e) {
    e && e.preventDefault();
    const ref = query.trim().toUpperCase();
    setResult(getBookingByRef(ref));
    navigate("/mes-billets", { ref });
  }

  return html`
    <div class="container narrow section">
      <h1>Mes billets</h1>
      <p class="muted">Retrouvez un billet grâce à sa référence (ex. NZ-AB12CD).</p>

      <form class="lookup-form" onSubmit=${search}>
        <input
          type="text"
          placeholder="Référence du billet"
          value=${query}
          onInput=${(e) => setQuery(e.target.value.toUpperCase())}
        />
        <button class="btn btn-primary" type="submit">Rechercher</button>
      </form>

      ${result === null && html`<p class="form-error">Aucun billet trouvé pour cette référence.</p>`}
      ${result && html`<div class="mt-2"><${Ticket} booking=${result} /></div>`}

      ${all.length > 0 &&
      html`
        <div class="recent-bookings">
          <h2>Réservations récentes (cet appareil)</h2>
          <div class="recent-list">
            ${all.slice(0, 8).map(
              (b) => html`
                <button class="recent-item" key=${b.ref} onClick=${() => { setQuery(b.ref); setResult(b); navigate("/mes-billets", { ref: b.ref }); }}>
                  <span class="recent-ref">${b.ref}</span>
                  <span class="recent-route">${b.trip.fromName} → ${b.trip.toName}</span>
                  <span class=${"status-pill " + b.status}>${b.status === "pending" ? "En attente" : b.status === "confirmed" ? "Confirmé" : b.status === "rejected" ? "Refusé" : b.status}</span>
                </button>
              `
            )}
          </div>
        </div>
      `}
    </div>
  `;
}
