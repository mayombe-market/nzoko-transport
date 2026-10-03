import { NextRequest, NextResponse } from "next/server";
import { requireAgent, isDenied } from "@/lib/api-auth";
import { bookingErrorMessage } from "@/lib/booking-errors";
import { normalizePhone } from "@/lib/phone";

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACTIONS = new Set(["assign", "unassign", "load", "unload", "cancel", "incident", "resolve"]);

const s = (v: unknown, max = 200) => (v == null ? "" : String(v).slice(0, max));
const uuid = (v: unknown) => (UUID.test(String(v ?? "")) ? String(v) : null);
const today = () => new Date(Date.now() + 3600_000).toISOString().slice(0, 10); // heure de Brazzaville (UTC+1)

// Espace colis des agents. Chaque opération sensible est exécutée par une fonction
// de la base (nzk_parcel_*) qui revérifie l'agent, son agence et l'état du colis.
export async function POST(req: NextRequest) {
  const ctx = await requireAgent(req);
  if (isDenied(ctx)) return ctx;
  const db = ctx.supabase;
  const agent = ctx.userId;
  const body = await req.json().catch(() => ({}));
  const op = s(body?.op, 40);

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) {
      console.error(`${fn}:`, error);
      return { failed: NextResponse.json({ success: false, message: "Erreur serveur." }, { status: 500 }) };
    }
    return { data };
  };
  const result = (data: any) =>
    data && data.ok === false
      ? NextResponse.json({ success: false, code: data.error, message: bookingErrorMessage(data.error), ...data }, { status: 409 })
      : NextResponse.json({ success: true, data });

  switch (op) {
    case "me": {
      const { data } = await db.from("agent_profiles").select("full_name, role, terminal_id, terminals(name, city_id)").eq("id", agent).single();
      const { data: terminals } = await db.from("terminals").select("id, name, city_id").eq("is_active", true).order("city_id");
      return NextResponse.json({ success: true, data: { ...data, terminals } });
    }
    case "categories": {
      const r = await rpc("nzk_parcel_categories", {});
      return r.failed ?? NextResponse.json({ success: true, data: r.data });
    }
    case "category_update": {
      const r = await rpc("nzk_parcel_category_update", {
        p_agent: agent,
        p_id: s(body.id, 40),
        p: {
          fare_percent: Number.isFinite(+body.fare_percent) ? Math.round(+body.fare_percent) : null,
          min_price: Number.isFinite(+body.min_price) ? Math.round(+body.min_price) : null,
          price_per_kg: Number.isFinite(+body.price_per_kg) ? Math.round(+body.price_per_kg) : null,
          is_active: typeof body.is_active === "boolean" ? body.is_active : null,
        },
      });
      return r.failed ?? result(r.data);
    }
    case "quote": {
      const r = await rpc("nzk_parcel_quote", {
        p_category: s(body.category_id, 40),
        p_from: s(body.from_city, 40),
        p_to: s(body.to_city, 40),
        p_weight: body.weight_kg === "" || body.weight_kg == null ? null : Number(body.weight_kg),
        p_quantity: Math.max(1, Math.min(100, Math.round(Number(body.quantity) || 1))),
      });
      return r.failed ?? result(r.data);
    }
    case "create": {
      const p = body.parcel ?? {};
      const senderPhone = normalizePhone(p.sender_phone);
      const recipientPhone = normalizePhone(p.recipient_phone);
      if (!senderPhone || !recipientPhone) {
        return NextResponse.json({ success: false, code: "TELEPHONE_INVALIDE", message: "Numéro de téléphone invalide (+242 05 ou 06)." }, { status: 400 });
      }
      const r = await rpc("nzk_parcel_create", {
        p_agent: agent,
        p: {
          sender_name: s(p.sender_name, 120),
          sender_phone: senderPhone,
          recipient_name: s(p.recipient_name, 120),
          recipient_phone: recipientPhone,
          from_terminal: s(p.from_terminal, 40),
          to_terminal: s(p.to_terminal, 40),
          category_id: s(p.category_id, 40),
          description: s(p.description, 200),
          quantity: s(p.quantity, 4),
          weight_kg: s(p.weight_kg, 10),
          declared_value: s(p.declared_value, 12),
          notes: s(p.notes, 500),
          payer: s(p.payer, 20),
          method: s(p.method, 20),
          transaction_code: s(p.transaction_code, 60),
          // Aucun prix n'est transmis : la base le calcule.
        },
      });
      return r.failed ?? result(r.data);
    }
    case "list": {
      const r = await rpc("nzk_parcel_list", {
        p_agent: agent,
        p_filter: s(body.filter, 20),
        p_query: s(body.query, 80),
        p_date: DATE.test(s(body.date)) ? s(body.date) : today(),
      });
      return r.failed ?? NextResponse.json({ success: true, data: r.data });
    }
    case "detail": {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ success: false, message: "Colis invalide." }, { status: 400 });
      const r = await rpc("nzk_parcel_detail", { p_agent: agent, p_parcel: id });
      if (r.failed) return r.failed;
      if (!r.data) return NextResponse.json({ success: false, message: "Colis introuvable ou hors de vos agences." }, { status: 404 });
      return NextResponse.json({ success: true, data: r.data });
    }
    case "trip_options": {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ success: false, message: "Colis invalide." }, { status: 400 });
      const r = await rpc("nzk_parcel_trip_options", { p_parcel: id, p_date: DATE.test(s(body.date)) ? s(body.date) : today() });
      return r.failed ?? NextResponse.json({ success: true, data: r.data });
    }
    case "action": {
      const id = uuid(body.id);
      const action = s(body.action, 20);
      if (!id || !ACTIONS.has(action)) return NextResponse.json({ success: false, message: "Action invalide." }, { status: 400 });
      const r = await rpc("nzk_parcel_transition", { p_agent: agent, p_parcel: id, p_action: action, p_trip: uuid(body.trip_id), p_note: s(body.note, 300) });
      return r.failed ?? result(r.data);
    }
    case "receive": {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ success: false, message: "Colis invalide." }, { status: 400 });
      const r = await rpc("nzk_parcel_receive", { p_agent: agent, p_parcel: id });
      return r.failed ?? result(r.data);
    }
    case "depart_trip": {
      const trip = uuid(body.trip_id);
      if (!trip) return NextResponse.json({ success: false, message: "Départ invalide." }, { status: 400 });
      const r = await rpc("nzk_trip_depart_parcels", { p_agent: agent, p_trip: trip });
      return r.failed ?? result(r.data);
    }
    case "pickup": {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ success: false, message: "Colis invalide." }, { status: 400 });
      const r = await rpc("nzk_parcel_pickup", {
        p_agent: agent,
        p_parcel: id,
        p_code: s(body.code, 6).replace(/\D/g, ""),
        p_method: body.method ? s(body.method, 20) : null,
        p_transaction_code: body.transaction_code ? s(body.transaction_code, 60) : null,
      });
      return r.failed ?? result(r.data);
    }
    case "reset_code": {
      const id = uuid(body.id);
      if (!id) return NextResponse.json({ success: false, message: "Colis invalide." }, { status: 400 });
      const r = await rpc("nzk_parcel_reset_code", { p_agent: agent, p_parcel: id, p_note: s(body.note, 200) });
      return r.failed ?? result(r.data);
    }
    case "scan": {
      const r = await rpc("nzk_parcel_scan", { p_agent: agent, p_code: s(body.code, 80) });
      return r.failed ?? result(r.data);
    }
    case "city_departures": {
      const city = s(body.city, 40);
      if (!/^[a-z-]+$/.test(city)) return NextResponse.json({ success: false, message: "Ville invalide." }, { status: 400 });
      const r = await rpc("nzk_city_departures", { p_city: city, p_date: DATE.test(s(body.date)) ? s(body.date) : today() });
      return r.failed ?? NextResponse.json({ success: true, data: r.data });
    }
    case "manifest": {
      const trip = uuid(body.trip_id);
      if (!trip) return NextResponse.json({ success: false, message: "Départ invalide." }, { status: 400 });
      const city = /^[a-z-]+$/.test(s(body.city, 40)) ? s(body.city, 40) : null;
      const r = await rpc("nzk_trip_manifest", { p_agent: agent, p_trip: trip, p_city: city });
      return r.failed ?? NextResponse.json({ success: true, data: r.data });
    }
    case "revenue": {
      if (ctx.role !== "admin") return NextResponse.json({ success: false, message: "Réservé aux administrateurs." }, { status: 403 });
      const from = DATE.test(s(body.from)) ? s(body.from) : today();
      const to = DATE.test(s(body.to)) ? s(body.to) : today();
      const r = await rpc("nzk_revenue_summary", { p_from: from, p_to: to });
      return r.failed ?? NextResponse.json({ success: true, data: r.data });
    }
    default:
      return NextResponse.json({ success: false, message: "Opération inconnue." }, { status: 400 });
  }
}
