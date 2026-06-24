import { html, useState, useMemo, useEffect } from "../html.js";
import { searchTrips, cityName, formatDuration, AMENITY_LABELS, OPERATORS } from "../data.js";
import { formatXAF, formatDateLong, todayISO } from "../format.js";
import { SearchForm } from "../components/SearchForm.js";
import { navigate } from "../router.js";
import { useApp } from "../app.js";

function Stars({ rating }) {
  return html`<span class="stars" title=${rating + " / 5"}>★ ${rating.toFixed(1)}</span>`;
}

function TripCard({ trip, pax, onSelect }) {
  const [open, setOpen] = useState(false);
  return html`
    <div class="trip-card">
      <div class="trip-main">
        <div class="trip-operator">
          <span class="op-badge" style=${{ background: trip.operatorColor }}></span>
          <div>
            <strong>${trip.operatorName}</strong>
            <div class="trip-bus">${trip.busType} · <${Stars} rating=${trip.rating} /></div>
          </div>
        </div>

        <div class="trip-times">
          <div class="time-block">
            <span class="time">${trip.departTime}</span>
            <span class="city">${cityName(trip.from)}</span>
          </div>
          <div class="time-arrow">
            <span class="duration">${formatDuration(trip.durationMin)}</span>
            <span class="line"></span>
            <span class="km">${trip.km} km</span>
          </div>
          <div class="time-block end">
            <span class="time">
              ${trip.arriveTime}${trip.arriveDayShift > 0 ? html`<sup class="next-day">+1j</sup>` : null}
            </span>
            <span class="city">${cityName(trip.to)}</span>
          </div>
        </div>

        <div class="trip-price">
          <span class="price">${formatXAF(trip.price)}</span>
          <span class="price-sub">par passager</span>
          <button class="btn btn-primary" onClick=${() => onSelect(trip)}>Choisir</button>
        </div>
      </div>

      <div class="trip-foot">
        <div class="amenities">
          ${trip.amenities.map((a) => html`<span class="amenity" key=${a}>${AMENITY_LABELS[a] || a}</span>`)}
        </div>
        <button class="link-btn" onClick=${() => setOpen((o) => !o)}>
          ${open ? "Masquer les arrêts ▲" : "Voir les arrêts ▼"}
        </button>
      </div>

      ${open &&
      html`
        <div class="stops-list">
          ${trip.stops.map(
            (s, i) => html`
              <div class="stop-item" key=${s.city}>
                <span class="stop-time">${s.time}</span>
                <span class="stop-dot ${i === 0 ? "first" : i === trip.stops.length - 1 ? "last" : ""}"></span>
                <span class="stop-name">${s.name}</span>
              </div>
            `
          )}
        </div>
      `}
    </div>
  `;
}

export function Results({ params }) {
  const app = useApp();
  const from = params.from || "brazzaville";
  const to = params.to || "pointenoire";
  const date = params.date || todayISO();
  const pax = Number(params.pax) || 1;

  const [sort, setSort] = useState("depart");
  const [opFilter, setOpFilter] = useState("all");

  useEffect(() => {
    app.setSearch({ from, to, date, pax });
    // eslint-disable-next-line
  }, [from, to, date, pax]);

  const trips = useMemo(() => searchTrips(from, to, date), [from, to, date]);

  const operatorsPresent = useMemo(() => {
    const ids = [...new Set(trips.map((t) => t.operator))];
    return ids.map((id) => ({ id, name: OPERATORS[id].name }));
  }, [trips]);

  const filtered = useMemo(() => {
    let list = trips.slice();
    if (opFilter !== "all") list = list.filter((t) => t.operator === opFilter);
    if (sort === "prix") list.sort((a, b) => a.price - b.price);
    else if (sort === "duree") list.sort((a, b) => a.durationMin - b.durationMin);
    else list.sort((a, b) => a.departTime.localeCompare(b.departTime));
    return list;
  }, [trips, sort, opFilter]);

  function selectTrip(trip) {
    app.setTrip(trip);
    navigate("/sieges", { trip: trip.tripId, date, pax: String(pax) });
  }

  return html`
    <div class="results-bar">
      <div class="container">
        <${SearchForm} initial=${{ from, to, date, pax }} compact=${true} />
      </div>
    </div>

    <div class="container results-body">
      <div class="results-head">
        <h1>${cityName(from)} → ${cityName(to)}</h1>
        <p class="results-meta">${formatDateLong(date)} · ${pax} passager${pax > 1 ? "s" : ""} · ${filtered.length} trajet${filtered.length > 1 ? "s" : ""}</p>
      </div>

      ${trips.length === 0
        ? html`
            <div class="empty-state">
              <h2>Aucun trajet direct sur cet axe</h2>
              <p>Essayez une autre combinaison de villes. Nos lignes couvrent surtout les axes RN1 (Brazzaville–Pointe-Noire) et RN2 (Brazzaville–Ouesso).</p>
              <a class="btn btn-primary" href="#/">Nouvelle recherche</a>
            </div>
          `
        : html`
            <div class="results-toolbar">
              <div class="toolbar-group">
                <label>Trier&nbsp;:</label>
                <select value=${sort} onChange=${(e) => setSort(e.target.value)}>
                  <option value="depart">Heure de départ</option>
                  <option value="prix">Prix le plus bas</option>
                  <option value="duree">Durée la plus courte</option>
                </select>
              </div>
              <div class="toolbar-group">
                <label>Compagnie&nbsp;:</label>
                <select value=${opFilter} onChange=${(e) => setOpFilter(e.target.value)}>
                  <option value="all">Toutes</option>
                  ${operatorsPresent.map((o) => html`<option key=${o.id} value=${o.id}>${o.name}</option>`)}
                </select>
              </div>
            </div>

            <div class="trip-list">
              ${filtered.map((t) => html`<${TripCard} key=${t.tripId} trip=${t} pax=${pax} onSelect=${selectTrip} />`)}
            </div>
          `}
    </div>
  `;
}
