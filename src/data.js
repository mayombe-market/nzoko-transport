// ============================================================
//  NzelaBus - Données des lignes de bus (Congo-Brazzaville)
//  Axes routiers réels : RN1 (Brazzaville <-> Pointe-Noire),
//  RN2 (Brazzaville <-> Ouesso), axe des Plateaux, littoral.
// ============================================================

// ---- Villes desservies (avec région) ----
export const CITIES = {
  brazzaville: { name: "Brazzaville", region: "Brazzaville" },
  kinkala: { name: "Kinkala", region: "Pool" },
  mindouli: { name: "Mindouli", region: "Pool" },
  madingou: { name: "Madingou", region: "Bouenza" },
  nkayi: { name: "Nkayi", region: "Bouenza" },
  loudima: { name: "Loudima", region: "Bouenza" },
  dolisie: { name: "Dolisie", region: "Niari" },
  pointenoire: { name: "Pointe-Noire", region: "Pointe-Noire" },
  gamboma: { name: "Gamboma", region: "Plateaux" },
  oyo: { name: "Oyo", region: "Cuvette" },
  owando: { name: "Owando", region: "Cuvette" },
  makoua: { name: "Makoua", region: "Cuvette" },
  ouesso: { name: "Ouesso", region: "Sangha" },
  djambala: { name: "Djambala", region: "Plateaux" },
  sibiti: { name: "Sibiti", region: "Lékoumou" },
};

// ---- Opérateurs (compagnies de bus fictives) ----
export const OPERATORS = {
  nzela: { name: "Nzela Express", rating: 4.6, color: "#0a7d3b" },
  transcongo: { name: "Trans-Congo", rating: 4.3, color: "#c0392b" },
  etoilesud: { name: "Étoile du Sud", rating: 4.5, color: "#1e63c4" },
  cuvette: { name: "Cuvette Lignes", rating: 4.1, color: "#8e44ad" },
  littoral: { name: "Littoral Voyages", rating: 4.4, color: "#d68910" },
};

// Niveaux de confort
const COACH = { type: "Grand car climatisé", seatsPerRow: 4, rows: 12, backRow: 5 };
const MINI = { type: "Minibus", seatsPerRow: 3, rows: 5, backRow: 4 };

// ---- Corridors : suite ordonnée d'arrêts ----
// offset = minutes depuis le départ ; price = prix cumulé en XAF depuis le départ
const CORRIDORS = {
  rn1: {
    label: "RN1 — Brazzaville ↔ Pointe-Noire",
    stops: [
      { city: "brazzaville", offset: 0, km: 0, price: 0 },
      { city: "kinkala", offset: 75, km: 75, price: 2000 },
      { city: "mindouli", offset: 145, km: 140, price: 3500 },
      { city: "madingou", offset: 225, km: 240, price: 6000 },
      { city: "nkayi", offset: 270, km: 285, price: 7000 },
      { city: "loudima", offset: 310, km: 330, price: 8000 },
      { city: "dolisie", offset: 370, km: 390, price: 9500 },
      { city: "pointenoire", offset: 480, km: 540, price: 13000 },
    ],
  },
  rn2: {
    label: "RN2 — Brazzaville ↔ Ouesso",
    stops: [
      { city: "brazzaville", offset: 0, km: 0, price: 0 },
      { city: "gamboma", offset: 210, km: 300, price: 6000 },
      { city: "oyo", offset: 300, km: 400, price: 8000 },
      { city: "owando", offset: 480, km: 600, price: 12000 },
      { city: "makoua", offset: 560, km: 680, price: 14000 },
      { city: "ouesso", offset: 720, km: 840, price: 20000 },
    ],
  },
  plateaux: {
    label: "Axe des Plateaux — Brazzaville ↔ Djambala",
    stops: [
      { city: "brazzaville", offset: 0, km: 0, price: 0 },
      { city: "gamboma", offset: 210, km: 300, price: 6000 },
      { city: "djambala", offset: 330, km: 410, price: 8500 },
    ],
  },
  niari: {
    label: "Axe Niari — Dolisie ↔ Sibiti ↔ Pointe-Noire",
    stops: [
      { city: "pointenoire", offset: 0, km: 0, price: 0 },
      { city: "dolisie", offset: 150, km: 150, price: 4000 },
      { city: "sibiti", offset: 270, km: 270, price: 7000 },
    ],
  },
};

// ---- Services programmés (lignes) ----
// Chaque service circule tous les jours à des heures définies.
const SERVICES = [
  { id: "S1", corridor: "rn1", operator: "nzela", bus: COACH, times: ["06:00", "09:30", "14:00", "21:00"], amenities: ["clim", "wifi", "usb", "toilettes"] },
  { id: "S2", corridor: "rn1", operator: "etoilesud", bus: COACH, times: ["07:00", "12:00", "20:00"], amenities: ["clim", "usb", "collation"] },
  { id: "S3", corridor: "rn1", operator: "transcongo", bus: MINI, times: ["05:30", "08:00", "11:00", "16:00"], amenities: ["clim"] },
  { id: "S4", corridor: "rn1", operator: "littoral", bus: COACH, times: ["06:30", "22:30"], amenities: ["clim", "wifi", "usb", "toilettes", "collation"] },

  { id: "S5", corridor: "rn2", operator: "cuvette", bus: COACH, times: ["05:00", "18:00"], amenities: ["clim", "usb", "toilettes"] },
  { id: "S6", corridor: "rn2", operator: "nzela", bus: COACH, times: ["06:00", "19:30"], amenities: ["clim", "wifi", "usb"] },
  { id: "S7", corridor: "rn2", operator: "transcongo", bus: MINI, times: ["07:30"], amenities: ["clim"] },

  { id: "S8", corridor: "plateaux", operator: "cuvette", bus: MINI, times: ["07:00", "13:30"], amenities: ["clim"] },
  { id: "S9", corridor: "niari", operator: "littoral", bus: MINI, times: ["08:00", "15:00"], amenities: ["clim", "usb"] },
];

export const AMENITY_LABELS = {
  clim: "Climatisation",
  wifi: "Wi-Fi à bord",
  usb: "Prises USB",
  toilettes: "Toilettes",
  collation: "Collation offerte",
};

// ============================================================
//  Fonctions utilitaires
// ============================================================

export function cityName(id) {
  return CITIES[id] ? CITIES[id].name : id;
}

// Liste triée des villes pour les menus déroulants
export function cityOptions() {
  return Object.keys(CITIES)
    .map((id) => ({ id, name: CITIES[id].name, region: CITIES[id].region }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

// Capacité totale d'un bus
export function busCapacity(bus) {
  return bus.seatsPerRow * (bus.rows - 1) + bus.backRow;
}

// Convertit "HH:MM" + offset minutes -> "HH:MM" (avec gestion +1j)
function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const dayShift = Math.floor(total / (24 * 60));
  const norm = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(norm / 60)).padStart(2, "0");
  const mm = String(norm % 60).padStart(2, "0");
  return { time: `${hh}:${mm}`, dayShift };
}

// Hash déterministe (pour générer une occupation de sièges stable par trajet)
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Générateur pseudo-aléatoire déterministe
function seededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Sièges pré-occupés de façon déterministe pour un trajet donné
export function preOccupiedSeats(tripId, capacity) {
  const rand = seededRandom(hashStr(tripId));
  const count = Math.floor(rand() * (capacity * 0.45)); // jusqu'à ~45% occupés
  const taken = new Set();
  let guard = 0;
  while (taken.size < count && guard < capacity * 4) {
    const n = 1 + Math.floor(rand() * capacity);
    taken.add(n);
    guard++;
  }
  return taken;
}

// Recherche de trajets : from, to (ids de villes), date (YYYY-MM-DD)
export function searchTrips(fromId, toId, date) {
  const results = [];
  for (const service of SERVICES) {
    const corridor = CORRIDORS[service.corridor];
    const stops = corridor.stops;
    const fromIdx = stops.findIndex((s) => s.city === fromId);
    const toIdx = stops.findIndex((s) => s.city === toId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) continue;

    const segStops = stops.slice(fromIdx, toIdx + 1);
    const baseOffset = stops[fromIdx].offset;
    const price = stops[toIdx].price - stops[fromIdx].price;
    const durationMin = stops[toIdx].offset - stops[fromIdx].offset;
    const capacity = busCapacity(service.bus);

    for (const t of service.times) {
      const dep = addMinutes(t, 0); // heure de départ depuis la ville d'origine du corridor
      // Heure réelle au point d'embarquement = heure de départ + offset de la gare d'embarquement
      const boarding = addMinutes(t, stops[fromIdx].offset);
      const arrival = addMinutes(t, stops[toIdx].offset);

      const tripId = `${service.id}|${service.corridor}|${fromId}|${toId}|${date}|${t}`;
      results.push({
        tripId,
        serviceId: service.id,
        corridorLabel: corridor.label,
        operator: service.operator,
        operatorName: OPERATORS[service.operator].name,
        operatorColor: OPERATORS[service.operator].color,
        rating: OPERATORS[service.operator].rating,
        busType: service.bus.type,
        bus: service.bus,
        capacity,
        amenities: service.amenities,
        date,
        from: fromId,
        to: toId,
        departTime: boarding.time,
        arriveTime: arrival.time,
        arriveDayShift: arrival.dayShift,
        durationMin,
        price,
        stops: segStops.map((s) => ({
          city: s.city,
          name: cityName(s.city),
          time: addMinutes(t, s.offset).time,
        })),
        km: stops[toIdx].km - stops[fromIdx].km,
      });
    }
  }
  // tri par heure de départ
  results.sort((a, b) => a.departTime.localeCompare(b.departTime));
  return results;
}

// Retrouver un trajet précis par son id (reconstruit depuis l'id encodé)
export function getTripById(tripId, date) {
  const [serviceId, , fromId, toId, encDate] = tripId.split("|");
  const useDate = date || encDate;
  const all = searchTrips(fromId, toId, useDate);
  return all.find((t) => t.tripId === tripId) || null;
}

export function formatDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}
