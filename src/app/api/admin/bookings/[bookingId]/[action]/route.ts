import { NextRequest, NextResponse } from "next/server";
import { requireAgent, isDenied } from "@/lib/api-auth";
import { bookingErrorMessage } from "@/lib/booking-errors";
import { sendTicketEmail } from "@/lib/ticket-email";

export const runtime = "nodejs";

const UUID = /^[0-9a-f-]{36}$/i;
const ACTIONS = {
  confirm: "nzk_confirm_payment",
  reject: "nzk_reject_payment",
  cancel: "nzk_cancel_booking",
} as const;

// Actions agent sur une réservation, chacune dans une seule transaction côté base :
// - confirm : paiement + réservation confirmés, billets (QR) créés, email envoyé si possible
// - reject  : paiement rejeté, réservation annulée, sièges libérés
// - cancel  : réservation annulée, billets annulés, sièges libérés
export async function POST(req: NextRequest, { params }: { params: { bookingId: string; action: string } }) {
  const fn = ACTIONS[params.action as keyof typeof ACTIONS];
  if (!fn || !UUID.test(params.bookingId)) {
    return NextResponse.json({ success: false, message: "Action invalide." }, { status: 400 });
  }

  const ctx = await requireAgent(req);
  if (isDenied(ctx)) return ctx;

  const body = await req.json().catch(() => ({}));
  const args: Record<string, unknown> = { p_booking: params.bookingId, p_agent: ctx.userId };
  if (params.action !== "confirm") args.p_reason = String(body?.reason ?? "").slice(0, 300);

  const { data, error } = await ctx.supabase.rpc(fn, args);
  if (error) {
    console.error(`${fn}:`, error);
    return NextResponse.json({ success: false, message: "Erreur serveur." }, { status: 500 });
  }
  if (!data?.ok) {
    return NextResponse.json({ success: false, code: data?.error, message: bookingErrorMessage(data?.error) }, { status: 409 });
  }

  let email: { sent: boolean; reason?: string } | undefined;
  if (params.action === "confirm") {
    email = await sendTicketEmail(ctx.supabase, data.reference).catch((err) => {
      console.error("sendTicketEmail:", err);
      return { sent: false, reason: "erreur d'envoi" };
    });
  }

  return NextResponse.json({ success: true, reference: data.reference, tickets: data.tickets, email });
}
