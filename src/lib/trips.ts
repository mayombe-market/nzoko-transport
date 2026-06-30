// ============================================================
// Logique de recherche de trajets — Nzoko Transport
// Migré depuis l'ancien data.js, adapté pour la nouvelle structure
// À terme, ces données viendront de Supabase
// ============================================================

import { addMinutes, busCapacity } from "./utils";

// Types locaux pour les trajets
export interface TripResult {
  tripId: string;
  corridorLabel: string;
  busType: string;
  busConfig: { seatsPerRow: number; rows: number; backRowSeats: number };
  capacity: number;
  amenities: string[];
  date: string;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  departTime: string;
  arriveTime: string;
  arriveDayShift: number;
  durationMin: number;
  price: number;
  km: number;
  stops: { city: string; name: string; time: string }[];
}

// ---- Données statiques (seront remplacées par Supabase) ----

const CITIES: Record<string, { name: string; region: string }> = {
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

interface Stop {
  city: string;
  offset: number;
  km: number;
  price: number;
}

interface Corridor {
  label: string;
  stops: Stop[];
}

const CORRIDORS: Record<string, Corridor> = {
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
    label: "Axe Niari — Pointe-Noire ↔ Sibiti",
    stops: [
      { city: "pointenoire", offset: 0, km: 0, price: 0 },
      { city: "dolisie", offset: 150, km: 150, price: 4000 },
      { city: "sibiti", offset: 270, km: 270, price: 7000 },
    ],
  },
};

interface BusConfig {
  type: string;
  seatsPerRow: number;
  rows: number;
  backRow: number;
}

const COACH: BusConfig = { type: "Grand car climatisé", seatsPerRow: 4, rows: 12, backRow: 5 };
const MINI: BusConfig = { type: "Minibus", seatsPerRow: 3, rows: 5, backRow: 4 };

interface ServiceDef {
  id: string;
  corridor: string;
  bus: BusConfig;
  times: string[];
  amenities: string[];
}

const SERVICES: ServiceDef[] = [
  { id: "S1", corridor: "rn1", bus: COACH, times: ["06:00", "09:30", "14:00", "21:00"], amenities: ["clim", "wifi", "usb", "toilettes"] },
  { id: "S2", corridor: "rn1", bus: COACH, times: ["07:00", "12:00", "20:00"], amenities: ["clim", "usb", "collation"] },
  { id: "S3", corridor: "rn1", bus: MINI, times: ["05:30", "08:00", "11:00", "16:00"], amenities: ["clim"] },
  { id: "S4", corridor: "rn2", bus: COACH, times: ["05:00", "18:00"], amenities: ["clim", "usb", "toilettes"] },
  { id: "S5", corridor: "rn2", bus: COACH, times: ["06:00", "19:30"], amenities: ["clim", "wifi", "usb"] },
  { id: "S6", corridor: "rn2", bus: MINI, times: ["07:30"], amenities: ["clim"] },
  { id: "S7", corridor: "plateaux", bus: MINI, times: ["07:00", "13:30"], amenities: ["clim"] },
  { id: "S8", corridor: "niari", bus: MINI, times: ["08:00", "15:00"], amenities: ["clim", "usb"] },
];

// ---- Recherche ----

export function cityName(id: string): string {
  return CITIES[id]?.name ?? id;
}

export function searchTrips(fromId: string, toId: string, date: string): TripResult[] {
  const results: TripResult[] = [];

  for (const service of SERVICES) {
    const corridor = CORRIDORS[service.corridor];
    const stops = corridor.stops;
    let fromIdx = stops.findIndex((s) => s.city === fromId);
    let toIdx = stops.findIndex((s) => s.city === toId);

    // Si les deux villes sont sur ce corridor mais dans l'autre sens,
    // on inverse pour permettre le trajet retour
    let reversed = false;
    if (fromIdx !== -1 && toIdx !== -1 && fromIdx > toIdx) {
      // Trajet en sens inverse
      const temp = fromIdx;
      fromIdx = toIdx;
      toIdx = temp;
      reversed = true;
    }

    if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) continue;

    const price = stops[toIdx].price - stops[fromIdx].price;
    const durationMin = stops[toIdx].offset - stops[fromIdx].offset;
    const capacity = busCapacity(service.bus.seatsPerRow, service.bus.rows - 1, service.bus.backRow);

    for (const t of service.times) {
      const boarding = addMinutes(t, stops[reversed ? toIdx : fromIdx].offset);
      const arrival = addMinutes(t, stops[reversed ? fromIdx : toIdx].offset);

      const tripId = `${service.id}|${service.corridor}|${fromId}|${toId}|${date}|${t}`;

      results.push({
        tripId,
        corridorLabel: corridor.label,
        busType: service.bus.type,
        busConfig: {
          seatsPerRow: service.bus.seatsPerRow,
          rows: service.bus.rows,
          backRowSeats: service.bus.backRow,
        },
        capacity,
        amenities: service.amenities,
        date,
        from: fromId,
        fromName: cityName(fromId),
        to: toId,
        toName: cityName(toId),
        departTime: boarding.time,
        arriveTime: arrival.time,
        arriveDayShift: arrival.dayShift,
        durationMin,
        price,
        km: stops[toIdx].km - stops[fromIdx].km,
        stops: stops.slice(fromIdx, toIdx + 1).map((s) => ({
          city: s.city,
          name: cityName(s.city),
          time: addMinutes(t, s.offset).time,
        })),
      });
    }
  }

  results.sort((a, b) => a.departTime.localeCompare(b.departTime));
  return results;
}

export function getTripById(tripId: string): TripResult | null {
  const [, , fromId, toId, date] = tripId.split("|");
  const all = searchTrips(fromId, toId, date);
  return all.find((t) => t.tripId === tripId) ?? null;
}
