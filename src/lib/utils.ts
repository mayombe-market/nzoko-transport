// ============================================================
// Utilitaires — Nzoko Transport
// ============================================================

/**
 * Formate un prix en Francs CFA
 */
export function formatXAF(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
}

/**
 * Formate une durée en minutes -> "Xh XXmin"
 */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}min`;
}

/**
 * Formate une date en français
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Génère une référence unique pour une réservation
 * Format: NZK-YYMMDD-XXXX
 */
export function generateReference(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `NZK-${yy}${mm}${dd}-${rand}`;
}

/**
 * Ajoute des minutes à une heure HH:MM
 */
export function addMinutes(hhmm: string, minutes: number): { time: string; dayShift: number } {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const dayShift = Math.floor(total / (24 * 60));
  const norm = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(norm / 60)).padStart(2, "0");
  const mm = String(norm % 60).padStart(2, "0");
  return { time: `${hh}:${mm}`, dayShift };
}

/**
 * Capacité totale d'un bus
 */
export function busCapacity(seatsPerRow: number, rows: number, backRowSeats: number): number {
  return seatsPerRow * (rows - 1) + backRowSeats;
}

/**
 * Labels des équipements
 */
export const AMENITY_LABELS: Record<string, string> = {
  clim: "Climatisation",
  wifi: "Wi-Fi à bord",
  usb: "Prises USB",
  toilettes: "Toilettes",
  collation: "Collation offerte",
};

/**
 * Icônes des équipements (emoji)
 */
export const AMENITY_ICONS: Record<string, string> = {
  clim: "❄️",
  wifi: "📶",
  usb: "🔌",
  toilettes: "🚻",
  collation: "☕",
};
