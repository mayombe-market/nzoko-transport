import { NextRequest, NextResponse } from "next/server";
import { requireAgent, isDenied } from "@/lib/api-auth";
import { bookingErrorMessage } from "@/lib/booking-errors";
import { normalizePhone } from "@/lib/phone";

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
      // Les réservations non confirmées dans les 30 minutes expirent avant l'affichage
      await ctx.supabase.rpc("nzk_expire_pending", { p_trip: null });
      return call("nzk_pending_payments", {
        p_agent: ctx.userId,
        p_status: ["pending", "confirmed", "rejected", "expired"].includes(body.status) ? body.status : null,
      });
    case "dashboard":
      await ctx.supabase.rpc("nzk_expire_pending", { p_trip: null });
      return call("nzk_dashboard", { p_agent: ctx.userId });
    case "recent_bookings":
      return call("nzk_recent_bookings", { p_agent: ctx.userId, p_date: DATE.test(String(body.date)) ? body.date : today() });
    case "trip_manage": {
      // Changement de bus, retard, annulation d'un départ précis (admin ou responsable de l'agence d'origine, revérifié en base)
      const UUID = /^[0-9a-f-]{36}$/i;
      if (!UUID.test(String(body.trip_id)) || !["bus", "delay", "cancel", "reopen"].includes(String(body.action))) {
        return NextResponse.json({ success: false, message: "Demande invalide." }, { status: 400 });
      }
      const { data, error } = await ctx.supabase.rpc("nzk_trip_manage", {
        p_agent: ctx.userId,
        p_trip: body.trip_id,
        p_action: body.action,
        p: {
          bus_id: body.bus_id && UUID.test(String(body.bus_id)) ? body.bus_id : null,
          delay_minutes: Number.isFinite(+body.delay_minutes) ? Math.round(+body.delay_minutes) : null,
          reason: String(body.reason ?? "").slice(0, 200),
          note: String(body.note ?? "").slice(0, 500),
        },
      });
      if (error) {
        console.error("nzk_trip_manage:", error);
        return NextResponse.json({ success: false, message: "Erreur serveur." }, { status: 500 });
      }
      if (!data?.ok) {
        return NextResponse.json({ success: false, code: data?.error, message: bookingErrorMessage(data?.error), ...data }, { status: 409 });
      }
      return NextResponse.json({ success: true, data: data.trip });
    }
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
      if (!normalizePhone(body.number)) {
        return NextResponse.json({ success: false, message: "Numéro de téléphone invalide (+242 05 ou 06)." }, { status: 400 });
      }
      return call("nzk_payment_account_save", {
        p_agent: ctx.userId,
        p: {
          id: body.id ? String(body.id) : null,
          terminal_id: String(body.terminal_id ?? "").slice(0, 40),
          provider: String(body.provider ?? ""),
          number: normalizePhone(body.number),
          holder_name: String(body.holder_name ?? "").slice(0, 120),
          is_active: body.is_active !== false,
          is_demo: body.is_demo === true,
        },
      });
    default:
      return NextResponse.json({ success: false, message: "Opération inconnue." }, { status: 400 });
  }
}
