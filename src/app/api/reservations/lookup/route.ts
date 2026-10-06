import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/api-auth";
import { bookingErrorMessage } from "@/lib/booking-errors";
import { normalizeReference } from "@/lib/public-booking";
import { isValidPhone } from "@/lib/phone";

// Recherche publique « Mes réservations » (visiteur non connecté).
// Il faut la référence ET le numéro de téléphone utilisé lors de la réservation.
// Un numéro seul ne donne jamais accès à un trajet, un siège ni un billet.
// Les échecs répétés bloquent la recherche pendant une heure (géré par la base).
export async function POST(req: NextRequest) {
  try {
    const { reference, phone } = await req.json().catch(() => ({}));
    const ref = normalizeReference(reference);
    if (!ref || !isValidPhone(phone)) {
      return NextResponse.json({ success: false, message: bookingErrorMessage("RECHERCHE_INVALIDE") }, { status: 400 });
    }
    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ success: false, message: "Service non configuré." }, { status: 503 });
    }
    const { data, error } = await supabase.rpc("nzk_booking_lookup", { p_reference: ref, p_phone: String(phone) });
    if (error) {
      console.error("nzk_booking_lookup:", error);
      return NextResponse.json({ success: false, message: "Erreur serveur." }, { status: 500 });
    }
    if (!data?.ok) {
      const message =
        data?.error === "INTROUVABLE"
          ? "Aucune réservation ne correspond à cette référence et ce numéro."
          : bookingErrorMessage(data?.error);
      return NextResponse.json({ success: false, code: data?.error, message }, { status: data?.error === "TROP_DE_TENTATIVES" ? 429 : 404 });
    }
    return NextResponse.json({ success: true, bookings: [data.booking] });
  } catch (err) {
    console.error("Lookup error:", err);
    return NextResponse.json({ success: false, message: "Erreur serveur." }, { status: 500 });
  }
}
