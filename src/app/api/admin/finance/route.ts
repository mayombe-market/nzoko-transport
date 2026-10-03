import { NextRequest, NextResponse } from "next/server";
import { requireAgent, isDenied } from "@/lib/api-auth";
import { bookingErrorMessage } from "@/lib/booking-errors";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date(Date.now() + 3600_000).toISOString().slice(0, 10);

// Paiements et finances par agence. Le périmètre (agence / réseau) est appliqué par la base.
export async function POST(req: NextRequest) {
  const ctx = await requireAgent(req);
  if (isDenied(ctx)) return ctx;
  const body = await req.json().catch(() => ({}));
  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await ctx.supabase.rpc(fn, args);
    if (error) {
      console.error(`${fn}:`, error);
      return NextResponse.json({ success: false, message: "Erreur serveur." }, { status: 500 });
    }
    if (data && data.ok === false) {
      return NextResponse.json({ success: false, code: data.error, message: bookingErrorMessage(data.error) }, { status: 403 });
    }
    return NextResponse.json({ success: true, data });
  };

  switch (String(body?.op ?? "")) {
    case "payments":
      return call("nzk_pending_payments", {
        p_agent: ctx.userId,
        p_status: ["pending", "confirmed", "rejected"].includes(body.status) ? body.status : null,
      });
    case "report":
      return call("nzk_finance_report", {
        p_agent: ctx.userId,
        p_from: DATE.test(String(body.from)) ? body.from : today(),
        p_to: DATE.test(String(body.to)) ? body.to : today(),
      });
    case "accounts":
      return call("nzk_payment_accounts", { p_agent: ctx.userId });
    case "account_save":
      // Modification des numéros : admin central ou Finance uniquement (revérifié en base)
      if (!["admin", "finance"].includes(ctx.role)) {
        return NextResponse.json({ success: false, message: "Seul Nzoko central (admin ou Finance) peut modifier les comptes." }, { status: 403 });
      }
      return call("nzk_payment_account_save", {
        p_agent: ctx.userId,
        p: {
          id: body.id ? String(body.id) : null,
          terminal_id: String(body.terminal_id ?? "").slice(0, 40),
          provider: String(body.provider ?? ""),
          number: String(body.number ?? "").slice(0, 30),
          holder_name: String(body.holder_name ?? "").slice(0, 120),
          is_active: body.is_active !== false,
        },
      });
    default:
      return NextResponse.json({ success: false, message: "Opération inconnue." }, { status: 400 });
  }
}
