// ============================================================
//  Stockage local (localStorage) : réservations + config paiement
//  -> permet à l'app de fonctionner sans backend pour la démo.
// ============================================================

const BOOKINGS_KEY = "nzela_bookings_v1";
const CONFIG_KEY = "nzela_config_v1";
const ADMIN_KEY = "nzela_admin_session";

// Configuration par défaut du paiement manuel MTN
const DEFAULT_CONFIG = {
  mtnNumber: "06 612 34 56",
  mtnAccountName: "NZELABUS SARL",
  airtelNumber: "05 045 67 89",
  adminPasscode: "nzela2026",
  supportPhone: "06 612 34 56",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* quota / mode privé : on ignore */
  }
}

// ---- Configuration ----
export function getConfig() {
  return { ...DEFAULT_CONFIG, ...read(CONFIG_KEY, {}) };
}
export function saveConfig(patch) {
  const next = { ...getConfig(), ...patch };
  write(CONFIG_KEY, next);
  return next;
}

// ---- Réservations ----
export function getBookings() {
  return read(BOOKINGS_KEY, []);
}

export function getBookingByRef(ref) {
  return getBookings().find((b) => b.ref === ref) || null;
}

export function addBooking(booking) {
  const all = getBookings();
  all.unshift(booking);
  write(BOOKINGS_KEY, all);
  return booking;
}

export function updateBooking(ref, patch) {
  const all = getBookings();
  const idx = all.findIndex((b) => b.ref === ref);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  write(BOOKINGS_KEY, all);
  return all[idx];
}

// Sièges déjà réservés (pending + confirmed) pour un trajet précis
export function bookedSeatsForTrip(tripId) {
  const set = new Set();
  for (const b of getBookings()) {
    if (b.tripId === tripId && b.status !== "rejected" && b.status !== "cancelled") {
      (b.seats || []).forEach((s) => set.add(s));
    }
  }
  return set;
}

// ---- Session admin ----
export function isAdminLogged() {
  try {
    return sessionStorage.getItem(ADMIN_KEY) === "1";
  } catch (e) {
    return false;
  }
}
export function loginAdmin(passcode) {
  if (passcode === getConfig().adminPasscode) {
    try { sessionStorage.setItem(ADMIN_KEY, "1"); } catch (e) {}
    return true;
  }
  return false;
}
export function logoutAdmin() {
  try { sessionStorage.removeItem(ADMIN_KEY); } catch (e) {}
}
