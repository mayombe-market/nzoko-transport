import { NextRequest, NextResponse } from "next/server";
import { requireAgent, isDenied } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  try {
    const { reference } = await req.json();

    if (!reference) {
      return NextResponse.json({
        success: false,
        message: "Référence manquante.",
      });
    }

    // Seuls les agents/admins connectés peuvent valider un billet
    const ctx = await requireAgent(req);
    if (isDenied(ctx)) return ctx;
    const supabase = ctx.supabase;

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
    // (la condition sur l'ancienne valeur évite que deux scans simultanés comptent pour un seul)
    const newScanCount = currentScans + 1;
    const updateQuery = supabase
      .from("bookings")
      .update({
        scan_count: newScanCount,
        last_scanned_at: new Date().toISOString(),
      })
      .eq("id", booking.id);
    const { data: updated } = await (booking.scan_count == null
      ? updateQuery.is("scan_count", null)
      : updateQuery.eq("scan_count", currentScans)
    ).select("id");

    if (!updated || updated.length === 0) {
      return NextResponse.json({
        success: false,
        message: "Billet en cours de validation sur un autre appareil. Réessayez.",
      }, { status: 409 });
    }

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
