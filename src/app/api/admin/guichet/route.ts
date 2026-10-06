import { NextRequest, NextResponse } from "next/server";
import { requireAgent, isDenied } from "@/lib/api-auth";
import { bookingErrorMessage } from "@/lib/booking-errors";
import { normalizePhone } from "@/lib/phone";

const UUID = /^[0-9a-f-]{36}$/i;
const CITY = /^[a-z-]+$/;

// Vente au guichet, paiement en espèces : réservation confirmée et billets émis immédiatement.
// Un agent / responsable vend uniquement depuis sa propre agence (revérifié en base).
export async function POST(req: NextRequest) {
  const ctx = await requireAgent(req);
  if (isDenied(ctx)) return ctx;
  const body = await req.json().catch(() => null);
  if (!body || !UUID.test(String(body.tripId)) || !CITY.test(String(body.from)) || !CITY.test(String(body.to)) || !Array.isArray(body.passengers)) {
    return NextResponse.json({ success: false, message: "Demande invalide." }, { status: 400 });
  }
  if (body.customerPhone && !normalizePhone(body.customerPhone)) {
    return NextResponse.json({ success: false, code: "TELEPHONE_INVALIDE", message: "Numéro de téléphone invalide (+242 05 ou 06)." }, { status: 400 });
  }
  const passengers = body.passengers.slice(0, 10).map((p: any) => ({
    full_name: String(p?.fullName ?? "").slice(0, 120),
    seat: String(p?.seat ?? "").slice(0, 4),
  }));

  const { data, error } = await ctx.supabase.rpc("nzk_counter_sale", {
    p_agent: ctx.userId,
    p_trip: body.tripId,
    p_from: body.from,
    p_to: body.to,
    p_from_terminal: body.fromTerminal && CITY.test(String(body.fromTerminal)) ? body.fromTerminal : null,
    p_to_terminal: body.toTerminal && CITY.test(String(body.toTerminal)) ? body.toTerminal : null,
    p_token: String(body.token ?? ""),
    p_passengers: passengers,
    p_customer_phone: body.customerPhone ? normalizePhone(body.customerPhone) : null,
  });
  if (error) {
    console.error("nzk_counter_sale:", error);
    return NextResponse.json({ success: false, message: "Erreur serveur." }, { status: 500 });
  }
  if (!data?.ok) {
    return NextResponse.json({ success: false, code: data?.error, message: bookingErrorMessage(data?.error) }, { status: 409 });
  }
  return NextResponse.json({
    success: true,
    reference: data.reference,
    accessKey: data.access_key,
    totalPrice: data.total_price,
    tickets: data.tickets,
    agencyName: data.agency_name,
  });
}
