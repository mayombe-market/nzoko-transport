// ============================================================
// Vue publique d'une réservation (côté serveur uniquement)
// Les tables bookings / passengers / payments ne sont plus lisibles
// par les visiteurs : les pages publiques passent par nos routes API,
// qui ne renvoient que le strict nécessaire (jamais d'email, de
// téléphone complet ni de données de paiement).
// ============================================================

export interface PublicPassenger {
  full_name: string;
  seat_number: string | null;
  is_primary: boolean;
}

export interface PublicBooking {
  id: string;
  reference: string;
  from_city: string;
  to_city: string;
  from_terminal: string | null;
  to_terminal: string | null;
  date: string;
  departure_time: string;
  total_price: number;
  passenger_count: number;
  status: string;
  created_at: string;
  customer_phone_masked: string | null;
  passengers: PublicPassenger[];
}

export const PUBLIC_BOOKING_SELECT =
  "id, reference, from_city, to_city, from_terminal, to_terminal, date, departure_time, total_price, passenger_count, status, created_at, customer_phone, passengers(full_name, seat_number, is_primary)";

import { maskPhone } from "./phone";
export { maskPhone };

/** "Jean Kouba Mbemba" → "Jean K. M." */
export function maskName(name: string | null | undefined): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Passager";
  return [parts[0], ...parts.slice(1).map((p) => `${p.charAt(0).toUpperCase()}.`)].join(" ");
}

export function toPublicBooking(row: any, options: { maskNames?: boolean } = {}): PublicBooking {
  return {
    id: row.id,
    reference: row.reference,
    from_city: row.from_city,
    to_city: row.to_city,
    from_terminal: row.from_terminal ?? null,
    to_terminal: row.to_terminal ?? null,
    date: row.date,
    departure_time: row.departure_time,
    total_price: row.total_price,
    passenger_count: row.passenger_count,
    status: row.status,
    created_at: row.created_at,
    customer_phone_masked: maskPhone(row.customer_phone),
    passengers: (row.passengers ?? []).map((p: any) => ({
      full_name: options.maskNames ? maskName(p.full_name) : p.full_name,
      seat_number: p.seat_number ?? null,
      is_primary: !!p.is_primary,
    })),
  };
}

const REFERENCE_PATTERN = /^NZK-\d{6}-[A-Z0-9]{4}$/;

export function normalizeReference(value: unknown): string | null {
  const ref = String(value ?? "").trim().toUpperCase();
  return REFERENCE_PATTERN.test(ref) ? ref : null;
}
