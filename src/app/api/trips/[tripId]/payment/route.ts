import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, optionalAgent } from "@/lib/api-auth";

const UUID = /^[0-9a-f-]{36}$/i;

// Agence de départ (déterminée par le serveur) et ses comptes MTN / Airtel actifs
export async function GET(req: NextRequest, { params }: { params: { tripId: string } }) {
  const from = req.nextUrl.searchParams.get("from") || "";
  const to = req.nextUrl.searchParams.get("to") || "";
  const fromTerminal = req.nextUrl.searchParams.get("fromTerminal") || null;
  if (!UUID.test(params.tripId) || !/^[a-z-]+$/.test(from) || !/^[a-z-]+$/.test(to)) {
    return NextResponse.json({ success: false, message: "Départ invalide." }, { status: 400 });
  }
  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ success: false, message: "Service non configuré." }, { status: 503 });

  const { data, error } = await supabase.rpc("nzk_trip_payment_info", {
    p_trip: params.tripId,
    p_from: from,
    p_to: to,
    p_from_terminal: fromTerminal && /^[a-z-]+$/.test(fromTerminal) ? fromTerminal : null,
    // Les comptes de démonstration ne sont jamais montrés au public
    p_include_demo: (await optionalAgent(req))?.role === "admin",
  });
  if (error) {
    console.error("nzk_trip_payment_info:", error);
    return NextResponse.json({ success: false, message: "Erreur serveur." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ success: false, message: "Aucune agence pour ce départ." }, { status: 404 });
  return NextResponse.json({ success: true, payment: data });
}
