import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/api-auth";

// Départs réels pour une recherche (lignes actives configurées dans l'admin)
export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from") || "";
  const to = req.nextUrl.searchParams.get("to") || "";
  const date = req.nextUrl.searchParams.get("date") || "";

  if (!/^[a-z-]+$/.test(from) || !/^[a-z-]+$/.test(to) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, message: "Recherche invalide." }, { status: 400 });
  }

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ success: false, message: "Service non configuré." }, { status: 503 });

  const { data, error } = await supabase.rpc("nzk_get_departures", { p_from: from, p_to: to, p_date: date });
  if (error) {
    console.error("nzk_get_departures:", error);
    return NextResponse.json({ success: false, message: "Erreur lors de la recherche." }, { status: 500 });
  }

  const departures = (data ?? []).map((d: any) => ({
    tripId: d.trip_id,
    corridorLabel: d.corridor_label,
    direction: d.direction,
    departTime: String(d.boarding_at).slice(11, 16),
    departDate: String(d.boarding_at).slice(0, 10),
    arriveTime: String(d.arrival_at).slice(11, 16),
    arriveDate: String(d.arrival_at).slice(0, 10),
    durationMin: d.duration_min,
    km: d.distance_km,
    price: d.price,
    premiumSupplement: d.premium_supplement,
    busName: d.bus_name,
    busType: d.bus_type,
    amenities: d.amenities ?? [],
    seatsTotal: d.seats_total,
    seatsLeft: Math.max(0, d.seats_total - d.seats_taken),
    status: d.trip_status ?? "scheduled",
    delayMinutes: d.delay_minutes ?? 0,
    statusReason: d.status_reason ?? null,
  }));

  // Noms des villes lus en base (aucune liste écrite en dur)
  const { data: cities } = await supabase.from("cities").select("id, name").in("id", [from, to]);
  const cityName = (id: string) => cities?.find((c) => c.id === id)?.name ?? id;

  return NextResponse.json({ success: true, from, to, fromName: cityName(from), toName: cityName(to), date, departures });
}
