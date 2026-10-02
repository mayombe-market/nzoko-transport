"use client";

// Jeton de blocage des sièges : identifie ce navigateur auprès du serveur
// pendant le parcours (les sièges bloqués lui appartiennent pendant 15 min).
export function getHoldToken(): string {
  try {
    let token = sessionStorage.getItem("nzoko_hold_token");
    if (!token) {
      token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
      sessionStorage.setItem("nzoko_hold_token", token);
    }
    return token;
  } catch {
    return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  }
}

export interface BookingDraft {
  tripId: string;
  from: string;
  to: string;
  fromTerminal?: string;
  toTerminal?: string;
  seats: string[];
  holdExpiresAt: string | null;
  passengers?: { fullName: string; phone: string }[];
}

export function saveDraft(draft: BookingDraft) {
  try {
    sessionStorage.setItem("nzoko_booking", JSON.stringify(draft));
  } catch {}
}

export function loadDraft(): BookingDraft | null {
  try {
    const raw = sessionStorage.getItem("nzoko_booking");
    return raw ? (JSON.parse(raw) as BookingDraft) : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem("nzoko_booking");
  } catch {}
}
