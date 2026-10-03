import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/api-auth";
import { PUBLIC_BOOKING_SELECT, toPublicBooking, normalizeReference } from "@/lib/public-booking";
import { phoneVariants } from "@/lib/phone";

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
      const variants = phoneVariants(String(value ?? ""));
      if (variants.length === 0) {
        return NextResponse.json({ success: false, message: "Numéro de téléphone invalide." }, { status: 400 });
      }
      const { data } = await supabase
        .from("bookings")
        .select(`${PUBLIC_BOOKING_SELECT}, access_key`)
        .in("customer_phone", variants)
        .order("created_at", { ascending: false })
        .limit(20);
      // Le numéro du client sert de preuve : on renvoie le lien d'accès à chaque billet
      return NextResponse.json({
        success: true,
        bookings: (data ?? []).map((row: any) => ({
          ...toPublicBooking(row, { maskNames: true }),
          access_key: row.access_key ?? null,
        })),
      });
    }

    return NextResponse.json({ success: false, message: "Recherche invalide." }, { status: 400 });
  } catch (err) {
    console.error("Lookup error:", err);
    return NextResponse.json({ success: false, message: "Erreur serveur." }, { status: 500 });
  }
}
