import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/api-auth";
import { normalizeReference, maskPhone } from "@/lib/public-booking";

// Données de la page billet publique (/billet/[reference]?k=clé).
// Sans la clé d'accès secrète de la réservation : informations de base, jamais de QR.
export async function GET(req: NextRequest, { params }: { params: { reference: string } }) {
  const reference = normalizeReference(params.reference);
  if (!reference) {
    return NextResponse.json({ success: false, message: "Référence invalide." }, { status: 400 });
  }
  const key = req.nextUrl.searchParams.get("k");

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ success: false, message: "Service non configuré." }, { status: 503 });
  }

  const { data: view, error } = await supabase.rpc("nzk_ticket_view", { p_reference: reference, p_access_key: key });
  if (error) {
    console.error("nzk_ticket_view:", error);
    return NextResponse.json({ success: false, message: "Erreur serveur." }, { status: 500 });
  }
  if (!view) {
    return NextResponse.json({ success: false, message: "Billet introuvable." }, { status: 404 });
  }

  const { data: phoneRow } = await supabase.from("bookings").select("customer_phone").eq("reference", reference).maybeSingle();

  return NextResponse.json({
    success: true,
    booking: { ...view, customer_phone_masked: maskPhone(phoneRow?.customer_phone) },
  });
}
