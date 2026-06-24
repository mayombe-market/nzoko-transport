import { html, useState, useMemo, useEffect } from "../html.js";
import { getTripById, cityName, preOccupiedSeats, busCapacity } from "../data.js";
import { bookedSeatsForTrip } from "../store.js";
import { formatXAF, formatDateLong } from "../format.js";
import { navigate } from "../router.js";
import { useApp } from "../app.js";

// Construit la disposition du bus en rangées
function buildLayout(bus) {
  const rows = [];
  const perRow = bus.seatsPerRow;
  const leftCount = Math.ceil(perRow / 2);
  const rightCount = perRow - leftCount;
  let seat = 1;
  for (let r = 0; r < bus.rows - 1; r++) {
    const left = [];
    const right = [];
    for (let i = 0; i < leftCount; i++) left.push(seat++);
    for (let i = 0; i < rightCount; i++) right.push(seat++);
    rows.push({ left, right });
  }
  // dernière rangée (banquette du fond)
  const back = [];
  for (let i = 0; i < bus.backRow; i++) back.push(seat++);
  return { rows, back };
}

function Seat({ n, state, onClick }) {
  const cls = "seat seat-" + state;
  return html`
    <button
      class=${cls}
      disabled=${state === "occupied"}
      onClick=${() => onClick(n)}
      title=${"Siège " + n + (state === "occupied" ? " (occupé)" : "")}
      aria-label=${"Siège " + n}
    >
      ${n}
    </button>
  `;
}

export function SeatSelection({ params }) {
  const app = useApp();
  const pax = Number(params.pax) || 1;
  const date = params.date || "";

  const trip = useMemo(() => {
    if (app.draft.trip && app.draft.trip.tripId === params.trip) return app.draft.trip;
    return getTripById(params.trip, date);
  }, [params.trip, date, app.draft.trip]);

  const [selected, setSelected] = useState(app.draft.seats || []);

  useEffect(() => {
    if (trip && (!app.draft.trip || app.draft.trip.tripId !== trip.tripId)) {
      app.setTrip(trip);
    }
    // eslint-disable-next-line
  }, [trip]);

  if (!trip) {
    return html`
      <div class="container narrow center-block">
        <h1>Trajet introuvable</h1>
        <p>Ce trajet n'est plus disponible. Relancez une recherche.</p>
        <a class="btn btn-primary" href="#/">Nouvelle recherche</a>
      </div>
    `;
  }

  const capacity = busCapacity(trip.bus);
  const layout = useMemo(() => buildLayout(trip.bus), [trip.tripId]);

  const occupied = useMemo(() => {
    const pre = preOccupiedSeats(trip.tripId, capacity);
    const booked = bookedSeatsForTrip(trip.tripId);
    booked.forEach((s) => pre.add(s));
    return pre;
  }, [trip.tripId, capacity]);

  const available = capacity - occupied.size;

  function toggle(n) {
    setSelected((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= pax) {
        // remplace le plus ancien si on a atteint le nombre de passagers
        return [...prev.slice(1), n];
      }
      return [...prev, n];
    });
  }

  function seatState(n) {
    if (occupied.has(n)) return "occupied";
    if (selected.includes(n)) return "selected";
    return "free";
  }

  function proceed() {
    if (selected.length !== pax) return;
    app.setSeats([...selected].sort((a, b) => a - b));
    navigate("/passagers");
  }

  const total = trip.price * selected.length;

  const renderSeatRow = (row, idx) =>
    html`
      <div class="seat-row" key=${idx}>
        <div class="seat-group">
          ${row.left.map((n) => html`<${Seat} key=${n} n=${n} state=${seatState(n)} onClick=${toggle} />`)}
        </div>
        <div class="aisle"></div>
        <div class="seat-group">
          ${row.right.map((n) => html`<${Seat} key=${n} n=${n} state=${seatState(n)} onClick=${toggle} />`)}
        </div>
      </div>
    `;

  return html`
    <div class="container booking-layout">
      <div class="booking-main">
        <a class="back-link" href="#/resultats?${new URLSearchParams({ from: trip.from, to: trip.to, date, pax: String(pax) }).toString()}">← Retour aux trajets</a>
        <h1>Choisissez ${pax > 1 ? "vos places" : "votre place"}</h1>
        <p class="muted">${pax > 1 ? `Sélectionnez ${pax} sièges` : "Sélectionnez 1 siège"} · ${available} place${available > 1 ? "s" : ""} disponible${available > 1 ? "s" : ""}</p>

        <div class="seat-legend">
          <span><i class="seat seat-free legend-box"></i> Libre</span>
          <span><i class="seat seat-selected legend-box"></i> Sélectionné</span>
          <span><i class="seat seat-occupied legend-box"></i> Occupé</span>
        </div>

        <div class="bus-frame">
          <div class="bus-front">
            <span class="steering">🚍 Avant du bus</span>
          </div>
          <div class="bus-seats">
            ${layout.rows.map((row, idx) => renderSeatRow(row, idx))}
            <div class="seat-row back-row">
              ${layout.back.map((n) => html`<${Seat} key=${n} n=${n} state=${seatState(n)} onClick=${toggle} />`)}
            </div>
          </div>
        </div>
      </div>

      <aside class="booking-side">
        <div class="summary-card">
          <h3>Récapitulatif</h3>
          <div class="summary-row"><span>Compagnie</span><strong>${trip.operatorName}</strong></div>
          <div class="summary-row"><span>Trajet</span><strong>${cityName(trip.from)} → ${cityName(trip.to)}</strong></div>
          <div class="summary-row"><span>Date</span><strong>${formatDateLong(date)}</strong></div>
          <div class="summary-row"><span>Départ</span><strong>${trip.departTime}</strong></div>
          <div class="summary-row"><span>Arrivée</span><strong>${trip.arriveTime}${trip.arriveDayShift > 0 ? " (+1j)" : ""}</strong></div>
          <hr />
          <div class="summary-row"><span>Sièges</span><strong>${selected.length ? [...selected].sort((a, b) => a - b).join(", ") : "—"}</strong></div>
          <div class="summary-row"><span>Prix unitaire</span><strong>${formatXAF(trip.price)}</strong></div>
          <div class="summary-total"><span>Total</span><strong>${formatXAF(total)}</strong></div>
          <button class="btn btn-primary btn-block" disabled=${selected.length !== pax} onClick=${proceed}>
            ${selected.length === pax ? "Continuer" : `Choisissez ${pax - selected.length} siège(s) de plus`}
          </button>
        </div>
      </aside>
    </div>
  `;
}
