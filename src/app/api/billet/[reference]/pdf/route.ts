import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/api-auth";
import { normalizeReference } from "@/lib/public-booking";
import { generateTicketPdf, type TicketView } from "@/lib/ticket-pdf";

export const runtime = "nodejs";

// Billet PDF téléchargeable — clé d'accès obligatoire et réservation confirmée
export async function GET(req: NextRequest, { params }: { params: { reference: string } }) {
  const reference = normalizeReference(params.reference);
  const key = req.nextUrl.searchParams.get("k");
  if (!reference || !key) {
    return NextResponse.json({ success: false, message: "Lien de billet invalide." }, { status: 400 });
  }

  const supabase = getServiceClient();
  if (!supabase) return NextResponse.json({ success: false, message: "Service non configuré." }, { status: 503 });

  const { data: view } = await supabase.rpc("nzk_ticket_view", { p_reference: reference, p_access_key: key });
  if (!view || !view.authorized) {
    return NextResponse.json({ success: false, message: "Billet introuvable." }, { status: 404 });
  }
  if (view.status !== "confirmed" || !(view.passengers ?? []).some((p: any) => p.ticket_code)) {
    return NextResponse.json({ success: false, message: "Le billet sera disponible après confirmation du paiement." }, { status: 409 });
  }

  const pdf = await generateTicketPdf(view as TicketView);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="billet-${reference}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
