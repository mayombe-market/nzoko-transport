import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function POST(req: NextRequest) {
  try {
    const { reference } = await req.json();

    if (!reference) {
      return NextResponse.json({
        success: false,
        message: "Référence manquante.",
      });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({
        success: false,
        message: "Service non configuré.",
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Chercher la réservation
    const { data: booking, error } = await supabase
      .from("bookings")
      .select("*, passengers(*)")
      .eq("reference", reference.toUpperCase())
      .single();

    if (error || !booking) {
      return NextResponse.json({
        success: false,
        message: `Billet introuvable : "${reference}". Vérifiez la référence.`,
      });
    }

    // Vérifier le statut
    if (booking.status === "cancelled") {
      return NextResponse.json({
        success: false,
        message: "Ce billet a été annulé.",
      });
    }

    if (booking.status !== "confirmed") {
      return NextResponse.json({
        success: false,
        message: "Ce billet n'a pas encore été confirmé (paiement en attente).",
      });
    }

    // Vérifier le nombre de scans (max 3)
    const currentScans = booking.scan_count || 0;
    if (currentScans >= 3) {
      return NextResponse.json({
        success: false,
        message: "Ce billet a déjà été validé 3 fois. Accès refusé.",
      });
    }

    // Incrémenter le compteur de scans
    const newScanCount = currentScans + 1;
    await supabase
      .from("bookings")
      .update({
        scan_count: newScanCount,
        last_scanned_at: new Date().toISOString(),
      })
      .eq("id", booking.id);

    // Récupérer le passager principal
    const primaryPassenger = booking.passengers?.find((p: any) => p.is_primary) || booking.passengers?.[0];

    // Récupérer les noms de villes
    const { data: fromCity } = await supabase.from("cities").select("name").eq("id", booking.from_city).single();
    const { data: toCity } = await supabase.from("cities").select("name").eq("id", booking.to_city).single();

    return NextResponse.json({
      success: true,
      message: newScanCount === 1
        ? "Première validation. Bon voyage !"
        : `Validation ${newScanCount}/3. Billet déjà scanné ${newScanCount - 1} fois avant.`,
      booking: {
        reference: booking.reference,
        passengerName: primaryPassenger?.full_name || "Inconnu",
        seat: primaryPassenger?.seat_number || "N/A",
        from: fromCity?.name || booking.from_city,
        to: toCity?.name || booking.to_city,
        date: booking.date,
        departureTime: booking.departure_time,
        scanCount: newScanCount,
      },
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      message: "Erreur serveur. Réessayez.",
    });
  }
}
