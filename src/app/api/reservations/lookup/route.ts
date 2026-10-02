import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/api-auth";
import { PUBLIC_BOOKING_SELECT, toPublicBooking, normalizeReference } from "@/lib/public-booking";

// Recherche publique « Mes réservations » (visiteur non connecté).
// - par référence : réservation correspondante, noms complets (le billet les affiche)
// - par téléphone : réservations de ce numéro, noms masqués
// Jamais d'email, de téléphone complet ni de paiement.
export async function POST(req: NextRequest) {
  try {
    const { mode, value } = await req.json();
    const supabase = getServiceClient();
    if (!supabase) {
      return NextResponse.json({ success: false, message: "Service non configuré." }, { status: 503 });
    }

    if (mode === "reference") {
      const reference = normalizeReference(value);
      if (!reference) {
        return NextResponse.json({ success: true, bookings: [] });
      }
      const { data } = await supabase
        .from("bookings")
        .select(PUBLIC_BOOKING_SELECT)
        .eq("reference", reference)
        .limit(1);
      return NextResponse.json({ success: true, bookings: (data ?? []).map((row) => toPublicBooking(row)) });
    }

    if (mode === "phone") {
      const phone = String(value ?? "").trim();
      if (phone.replace(/\D/g, "").length < 8) {
        return NextResponse.json({ success: false, message: "Numéro de téléphone invalide." }, { status: 400 });
      }
      const { data } = await supabase
        .from("bookings")
        .select(PUBLIC_BOOKING_SELECT)
        .eq("customer_phone", phone)
        .order("created_at", { ascending: false })
        .limit(20);
      return NextResponse.json({
        success: true,
        bookings: (data ?? []).map((row) => toPublicBooking(row, { maskNames: true })),
      });
    }

    return NextResponse.json({ success: false, message: "Recherche invalide." }, { status: 400 });
  } catch (err) {
    console.error("Lookup error:", err);
    return NextResponse.json({ success: false, message: "Erreur serveur." }, { status: 500 });
  }
}
