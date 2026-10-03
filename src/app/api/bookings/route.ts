import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/api-auth";
import { bookingErrorMessage } from "@/lib/booking-errors";

const UUID = /^[0-9a-f-]{36}$/i;

// Création d'une réservation. Le prix n'est JAMAIS reçu du navigateur :
// la base le calcule (tarif officiel du tronçon + supplément premium) et
// vérifie que les sièges sont bien bloqués par ce client.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !UUID.test(String(body.tripId)) || !Array.isArray(body.passengers)) {
    return NextResponse.json({ success: false, message: "Demande invalide." }, { status: 400 });
  }

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ success: false, message: "Service non configuré." }, { status: 503 });

  const passengers = body.passengers.slice(0, 10).map((p: any) => ({
    full_name: String(p?.fullName ?? "").slice(0, 120),
    phone: String(p?.phone ?? "").slice(0, 30),
    seat: String(p?.seat ?? "").slice(0, 4),
  }));

  const { data, error } = await supabase.rpc("nzk_create_booking", {
    p_trip: body.tripId,
    p_from: String(body.from ?? ""),
    p_to: String(body.to ?? ""),
    p_from_terminal: body.fromTerminal ? String(body.fromTerminal) : null,
    p_to_terminal: body.toTerminal ? String(body.toTerminal) : null,
    p_token: String(body.token ?? ""),
    p_passengers: passengers,
    p_customer_phone: String(body.customerPhone ?? "").slice(0, 30),
    p_customer_email: body.customerEmail ? String(body.customerEmail).slice(0, 200) : null,
    p_method: String(body.method ?? ""),
    p_transaction_code: String(body.transactionCode ?? "").slice(0, 60),
    p_phone_sender: String(body.phoneSender ?? "").slice(0, 30),
  });

  if (error) {
    console.error("nzk_create_booking:", error);
    return NextResponse.json({ success: false, message: "Erreur lors de l'enregistrement." }, { status: 500 });
  }
  if (!data?.ok) {
    return NextResponse.json({ success: false, code: data?.error, message: bookingErrorMessage(data?.error) }, { status: 409 });
  }

  return NextResponse.json({
    success: true,
    reference: data.reference,
    accessKey: data.access_key,
    totalPrice: data.total_price,
    unitPrice: data.unit_price,
    premiumSeats: data.premium_seats,
    agencyName: data.agency_name,
  });
}
