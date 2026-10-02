import { NextRequest, NextResponse } from "next/server";
import { requireAgent, isDenied } from "@/lib/api-auth";

// Validation d'un billet à l'embarquement (QR « NZK-T:<code> » ou code saisi à la main).
// Toute la règle est dans la base (nzk_scan_ticket) : un billet confirmé, du jour,
// n'est accepté qu'une seule fois ; chaque tentative est enregistrée dans ticket_scans.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body?.code ?? body?.reference ?? "").trim();
    if (!code) {
      return NextResponse.json({ success: false, message: "Code du billet manquant." }, { status: 400 });
    }

    const ctx = await requireAgent(req);
    if (isDenied(ctx)) return ctx;

    const { data, error } = await ctx.supabase.rpc("nzk_scan_ticket", { p_code: code.slice(0, 80), p_agent: ctx.userId });
    if (error) {
      console.error("nzk_scan_ticket:", error);
      return NextResponse.json({ success: false, message: "Erreur serveur. Réessayez." }, { status: 500 });
    }

    const t = data?.ticket;
    return NextResponse.json({
      success: !!data?.ok,
      result: data?.result,
      message: data?.message,
      booking: t
        ? {
            reference: t.reference,
            passengerName: t.passenger,
            seat: t.seat,
            from: t.from,
            to: t.to,
            date: t.date,
            departureTime: t.departure_time,
            usedAt: t.used_at,
          }
        : undefined,
    });
  } catch (err) {
    console.error("validate-ticket:", err);
    return NextResponse.json({ success: false, message: "Erreur serveur. Réessayez." }, { status: 500 });
  }
}
