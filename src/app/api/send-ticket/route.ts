import { NextRequest, NextResponse } from "next/server";
import { requireAgent, isDenied } from "@/lib/api-auth";
import { normalizeReference } from "@/lib/public-booking";
import { sendTicketEmail } from "@/lib/ticket-email";

export const runtime = "nodejs";

// Renvoi du billet par email (agents uniquement). Le destinataire et le contenu
// sont toujours relus en base à partir de la référence ; PDF en pièce jointe.
export async function POST(req: NextRequest) {
  const { reference } = await req.json().catch(() => ({}));
  const ctx = await requireAgent(req);
  if (isDenied(ctx)) return ctx;

  const ref = normalizeReference(reference);
  if (!ref) return NextResponse.json({ success: false, message: "Référence invalide." }, { status: 400 });

  const result = await sendTicketEmail(ctx.supabase, ref);
  return NextResponse.json({
    success: result.sent,
    message: result.sent ? "Email envoyé." : `Email non envoyé : ${result.reason}.`,
  });
}
