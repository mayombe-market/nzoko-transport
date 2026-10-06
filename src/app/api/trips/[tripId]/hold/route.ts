import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, optionalAgent, clientHash } from "@/lib/api-auth";
import { bookingErrorMessage } from "@/lib/booking-errors";

const UUID = /^[0-9a-f-]{36}$/i;
const SEAT = /^[A-Z]\d{1,2}$/;

function parse(body: any) {
  const seats: string[] = Array.isArray(body?.seats) ? body.seats : body?.seat ? [body.seat] : [];
  const token = String(body?.token ?? "");
  return { seats: seats.filter((s) => SEAT.test(String(s))).slice(0, 10), token };
}

// Bloque (ou renouvelle) temporairement un ou plusieurs sièges pour ce client — 15 minutes
export async function POST(req: NextRequest, { params }: { params: { tripId: string } }) {
  const { seats, token } = parse(await req.json().catch(() => null));
  if (!UUID.test(params.tripId) || seats.length === 0 || token.length < 16) {
    return NextResponse.json({ success: false, message: "Demande invalide." }, { status: 400 });
  }
  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ success: false, message: "Service non configuré." }, { status: 503 });

  // Limite par appareil (10 sièges bloqués par départ) — sauf personnel connecté (vente au guichet)
  const staff = await optionalAgent(req);
  const client = staff ? null : clientHash(req);
  let expiresAt: string | null = null;
  for (const seat of seats) {
    const { data, error } = await supabase.rpc("nzk_hold_seat", { p_trip: params.tripId, p_seat: seat, p_token: token, p_client: client });
    if (error) {
      console.error("nzk_hold_seat:", error);
      return NextResponse.json({ success: false, message: "Erreur serveur." }, { status: 500 });
    }
    if (!data?.ok) {
      return NextResponse.json({ success: false, seat, code: data?.error, message: bookingErrorMessage(data?.error) }, { status: 409 });
    }
    expiresAt = data.expires_at;
  }
  return NextResponse.json({ success: true, seats, expiresAt });
}

// Libère un siège bloqué par ce client
export async function DELETE(req: NextRequest, { params }: { params: { tripId: string } }) {
  const { seats, token } = parse(await req.json().catch(() => null));
  if (!UUID.test(params.tripId) || seats.length === 0 || token.length < 16) {
    return NextResponse.json({ success: false, message: "Demande invalide." }, { status: 400 });
  }
  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ success: false, message: "Service non configuré." }, { status: 503 });

  for (const seat of seats) {
    await supabase.rpc("nzk_release_seat", { p_trip: params.tripId, p_seat: seat, p_token: token });
  }
  return NextResponse.json({ success: true });
}
