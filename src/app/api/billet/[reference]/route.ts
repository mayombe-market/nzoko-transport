import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/api-auth";
import { PUBLIC_BOOKING_SELECT, toPublicBooking, normalizeReference } from "@/lib/public-booking";

// Données affichées sur la page billet publique (/billet/[reference]).
export async function GET(_req: NextRequest, { params }: { params: { reference: string } }) {
  const reference = normalizeReference(params.reference);
  if (!reference) {
    return NextResponse.json({ success: false, message: "Référence invalide." }, { status: 400 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ success: false, message: "Service non configuré." }, { status: 503 });
  }

  const { data: row } = await supabase
    .from("bookings")
    .select(PUBLIC_BOOKING_SELECT)
    .eq("reference", reference)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ success: false, message: "Billet introuvable." }, { status: 404 });
  }

  const { data: cities } = await supabase
    .from("cities")
    .select("id, name")
    .in("id", [row.from_city, row.to_city].filter(Boolean));
  const cityName = (id: string) => cities?.find((c: any) => c.id === id)?.name || id;

  return NextResponse.json({
    success: true,
    booking: {
      ...toPublicBooking(row),
      from_city_name: cityName(row.from_city),
      to_city_name: cityName(row.to_city),
    },
  });
}
