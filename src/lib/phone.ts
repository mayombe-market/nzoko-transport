// ============================================================
// Téléphones congolais — règle unique pour tout le site
// Saisie / affichage : +242 06 123 45 67   ·   Stockage : +242061234567
// Préfixes acceptés : 05 (Airtel) et 06 (MTN). 9 chiffres après +242.
// Lecture compatible avec les anciens formats (061234567, 06 123 45 67, 242…).
// ============================================================

export const PHONE_PREFIX = "+242";

/** Chiffres locaux (sans indicatif) à partir de n'importe quelle saisie, au plus 9 chiffres */
export function localDigits(input: string | null | undefined): string {
  let d = String(input ?? "").replace(/\D/g, "");
  if (d.startsWith("00242")) d = d.slice(5);
  else if (d.startsWith("242") && d.length > 9) d = d.slice(3);
  return d.slice(0, 9);
}

/** « 061234567 » → « 06 123 45 67 » (formatage progressif pendant la saisie) */
export function formatLocal(digits: string): string {
  const d = digits.slice(0, 9);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return parts.join(" ");
}

/** Message d'erreur (null si valide). Rien tant que l'utilisateur n'a rien saisi. */
export function phoneError(input: string | null | undefined): string | null {
  const d = localDigits(input);
  if (!d) return null;
  if (d.length >= 1 && d[0] !== "0") return "Le numéro doit commencer par 05 ou 06";
  if (d.length >= 2 && d[1] !== "5" && d[1] !== "6") return "Le numéro doit commencer par 05 ou 06";
  if (d.length < 9) return "Numéro incomplet";
  return null;
}

export function isValidPhone(input: string | null | undefined): boolean {
  const d = localDigits(input);
  return d.length === 9 && /^0[56]\d{7}$/.test(d);
}

/** Format de stockage : +242061234567 (null si invalide) */
export function normalizePhone(input: string | null | undefined): string | null {
  return isValidPhone(input) ? `${PHONE_PREFIX}${localDigits(input)}` : null;
}

/** Affichage : +242 06 123 45 67 (ancien format illisible : renvoyé tel quel) */
export function displayPhone(input: string | null | undefined): string {
  if (!input) return "";
  return isValidPhone(input) ? `${PHONE_PREFIX} ${formatLocal(localDigits(input))}` : String(input);
}

/** Masqué : +242 06 ••• •• 67 */
export function maskPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const d = localDigits(input);
  if (d.length < 4) return "••";
  return `${PHONE_PREFIX} ${d.slice(0, 2)} ••• •• ${d.slice(-2)}`;
}

/** Variantes possibles en base pour un même numéro (recherche compatible avec les anciennes données) */
export function phoneVariants(input: string | null | undefined): string[] {
  const d = localDigits(input);
  if (d.length !== 9) return [];
  const f = formatLocal(d);
  return Array.from(new Set([`${PHONE_PREFIX}${d}`, d, `242${d}`, `00242${d}`, f, `${PHONE_PREFIX} ${f}`, `${PHONE_PREFIX}${f}`, d.slice(1)]));
}
