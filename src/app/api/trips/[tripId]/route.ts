import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/api-auth";
import { cityName } from "@/lib/cities";

const UUID = /^[0-9a-f-]{36}$/i;

function addMinutes(date: string, time: string, minutes: number) {
  const d = new Date(`${date}T${time}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}

// Détail d'un départ : bus, plan, sièges pris/bloqués, prix officiel du tronçon
export async function GET(req: NextRequest, { params }: { params: { tripId: string } }) {
  const from = req.nextUrl.searchParams.get("from") || "";
  const to = req.nextUrl.searchParams.get("to") || "";
  if (!UUID.test(params.tripId) || !/^[a-z-]+$/.test(from) || !/^[a-z-]+$/.test(to)) {
    return NextResponse.json({ success: false, message: "Départ invalide." }, { status: 400 });
  }

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ success: false, message: "Service non configuré." }, { status: 503 });

  const { data: d, error } = await supabase.rpc("nzk_trip_detail", { p_trip: params.tripId, p_from: from, p_to: to });
  if (error) {
    console.error("nzk_trip_detail:", error);
    return NextResponse.json({ success: false, message: "Erreur serveur." }, { status: 500 });
  }
  if (!d || d.price == null) {
    return NextResponse.json({ success: false, message: "Départ introuvable." }, { status: 404 });
  }

  const fromOff = d.direction === "aller" ? d.from_offset : d.max_offset - d.from_offset;
  const toOff = d.direction === "aller" ? d.to_offset : d.max_offset - d.to_offset;
  const depart = addMinutes(d.date, d.departure_time, fromOff);
  const arrive = addMinutes(d.date, d.departure_time, toOff);

  return NextResponse.json({
    success: true,
    trip: {
      tripId: d.trip_id,
      status: d.status,
      corridorLabel: d.corridor_label,
      from,
      to,
      fromName: cityName(from),
      toName: cityName(to),
      departDate: depart.date,
      departTime: depart.time,
      arriveDate: arrive.date,
      arriveTime: arrive.time,
      price: d.price,
      premiumSupplement: d.premium_supplement,
      bus: d.bus,
      taken: d.taken ?? [],
      booked: d.booked ?? d.taken ?? [],
      held: d.held ?? [],
    },
  });
}
