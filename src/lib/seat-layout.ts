// ============================================================
// Plan de sièges d'un bus — mêmes règles que les fonctions SQL
// nzk_seat_valid / nzk_seat_premium (la base reste la référence).
//
// Siège « A1 » : lettre = colonne, nombre = rangée.
// Rangées 1..rows-1 : seats_per_row places (allée au milieu),
// dernière rangée : banquette de back_row_seats places.
// Premium : fenêtres + rangée 1 côté droit (derrière le chauffeur).
// ============================================================

export interface BusLayoutConfig {
  seats_per_row: number;
  rows: number;
  back_row_seats: number;
}

export interface LayoutSeat {
  label: string;
  premium: boolean;
}

export interface LayoutRow {
  number: number;
  isBackRow: boolean;
  left: LayoutSeat[];
  right: LayoutSeat[];
}

const letter = (index: number) => String.fromCharCode(65 + index);

export function isPremiumSeat(config: BusLayoutConfig, row: number, colIndex: number): boolean {
  const isBack = row === config.rows;
  const last = isBack ? config.back_row_seats - 1 : config.seats_per_row - 1;
  return colIndex === 0 || colIndex === last || (row === 1 && colIndex >= Math.floor(config.seats_per_row / 2));
}

export function buildLayout(config: BusLayoutConfig): LayoutRow[] {
  const leftCount = Math.floor(config.seats_per_row / 2);
  const rows: LayoutRow[] = [];

  for (let row = 1; row <= config.rows; row++) {
    const isBackRow = row === config.rows;
    const count = isBackRow ? config.back_row_seats : config.seats_per_row;
    const seats: LayoutSeat[] = Array.from({ length: count }, (_, col) => ({
      label: `${letter(col)}${row}`,
      premium: isPremiumSeat(config, row, col),
    }));
    // La banquette arrière est d'un seul tenant ; les autres rangées ont une allée
    rows.push({
      number: row,
      isBackRow,
      left: isBackRow ? seats : seats.slice(0, leftCount),
      right: isBackRow ? [] : seats.slice(leftCount),
    });
  }
  return rows;
}

export function seatIsPremium(config: BusLayoutConfig, label: string): boolean {
  const match = /^([A-Z])(\d{1,2})$/.exec(label);
  if (!match) return false;
  return isPremiumSeat(config, Number(match[2]), match[1].charCodeAt(0) - 65);
}

export function busCapacity(config: BusLayoutConfig): number {
  return config.seats_per_row * (config.rows - 1) + config.back_row_seats;
}
