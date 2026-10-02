"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatXAF } from "@/lib/utils";
import { ACTION_LABEL, METHOD_LABEL, PARCEL_STATUS, colisApi, formatDateTime, openParcelPdf, todayBrazzaville, useAgent } from "@/lib/parcel-ui";
import { ParcelStatusBadge } from "@/components/colis/ParcelList";
import { ParcelNav } from "@/components/colis/ParcelNav";

interface Detail {
  id: string;
  reference: string;
  status: string;
  created_at: string;
  sender_name: string;
  sender_phone: string;
  recipient_name: string;
  recipient_phone: string;
  from_city_name: string;
  to_city_name: string;
  from_terminal_name: string;
  to_terminal_name: string;
  category_label: string;
  description: string;
  quantity: number;
  weight_kg: number | null;
  declared_value: number | null;
  notes: string | null;
  price: number;
  payer: string;
  payment_status: string;
  trip_id: string | null;
  trip: { date: string; departure_time: string; bus_name: string | null; corridor_label: string } | null;
  pickup_locked_until: string | null;
  pickup_failed_attempts: number;
  picked_up_at: string | null;
  can_origin: boolean;
  can_destination: boolean;
  events: { at: string; from_status: string | null; to_status: string; action: string; note: string | null; agent: string | null; terminal: string | null }[];
  payments: { amount: number; method: string; moment: string; transaction_code: string | null; at: string; agent: string | null }[];
}

interface TripOption {
  trip_id: string;
  boarding_at: string;
  bus_name: string;
  corridor_label: string;
}

export default function ParcelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { agent, ready } = useAgent();
  const [p, setP] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tripDate, setTripDate] = useState(todayBrazzaville());
  const [trips, setTrips] = useState<TripOption[] | null>(null);
  const [code, setCode] = useState("");
  const [payMethod, setPayMethod] = useState("especes");
  const [payTx, setPayTx] = useState("");
  const [newCode, setNewCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await colisApi<Detail>("detail", { id });
    if (r.success) setP(r.data!);
    else setError(r.message || "Colis introuvable.");
  }, [id]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  useEffect(() => {
    if (!p || !p.can_origin || !["depose", "affecte"].includes(p.status)) return;
    setTrips(null);
    colisApi<TripOption[]>("trip_options", { id, date: tripDate }).then((r) => setTrips(r.success ? r.data ?? [] : []));
  }, [p?.status, p?.can_origin, tripDate, id]);

  async function run(op: string, params: Record<string, unknown>, success: string) {
    setBusy(true);
    setMsg(null);
    const r = await colisApi(op, { id, ...params });
    setBusy(false);
    setMsg({ ok: r.success, text: r.success ? success : r.message || "Erreur." });
    if (r.success && op === "reset_code") setNewCode(r.data.pickup_code);
    if (r.success && op === "pickup") setCode("");
    await load();
    return r;
  }

  const ask = (q: string) => {
    const v = prompt(q);
    return v && v.trim().length >= 3 ? v.trim() : null;
  };

  if (!ready || (!p && !error)) return <div className="max-w-4xl mx-auto px-4 py-12 text-center text-gray-400">Chargement…</div>;
  if (error || !p) return <div className="max-w-4xl mx-auto px-4 py-12 text-center text-red-600">{error}</div>;

  const locked = p.pickup_locked_until && new Date(p.pickup_locked_until) > new Date();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <ParcelNav title={`Colis ${p.reference}`} isAdmin={agent?.role === "admin"} />

      {msg && <div className={`mb-4 rounded-lg border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}

      <div className="card mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xl font-bold text-night">{p.reference}</span>
              <ParcelStatusBadge status={p.status} />
            </div>
            <p className="text-lg font-semibold text-night mt-2">
              {p.from_city_name} ({p.from_terminal_name}) → {p.to_city_name} ({p.to_terminal_name})
            </p>
            <p className="text-sm text-gray-600">{p.quantity} × {p.category_label} — {p.description}{p.weight_kg ? ` · ${p.weight_kg} kg` : ""}</p>
            {p.notes && <p className="text-sm text-gray-600">Observations : {p.notes}</p>}
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-accent-700">{formatXAF(p.price)}</p>
            <p className={`text-sm font-semibold ${p.payment_status === "paye" ? "text-green-700" : "text-red-700"}`}>
              {p.payment_status === "paye" ? "Payé" : "Port dû — à encaisser au retrait"}
            </p>
            {p.declared_value ? <p className="text-xs text-gray-500">Valeur déclarée {formatXAF(p.declared_value)}</p> : null}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-4 pt-4 border-t text-sm">
          <div>
            <p className="text-xs text-gray-500">EXPÉDITEUR</p>
            <p className="font-semibold">{p.sender_name}</p>
            <p>{p.sender_phone}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">DESTINATAIRE</p>
            <p className="font-semibold">{p.recipient_name}</p>
            <p>{p.recipient_phone}</p>
          </div>
        </div>
        {p.trip && (
          <p className="mt-3 text-sm text-night bg-primary-50 rounded-lg px-3 py-2">
            🚌 Départ du {p.trip.date} à {p.trip.departure_time} · {p.trip.bus_name} · {p.trip.corridor_label}
          </p>
        )}
        <div className="flex gap-2 flex-wrap mt-4">
          <button onClick={() => openParcelPdf("label", p.id)} className="btn-outline text-sm px-4 py-2">🏷️ Étiquette</button>
          <button onClick={() => openParcelPdf("receipt", p.id, newCode ?? undefined)} className="btn-outline text-sm px-4 py-2">🧾 Reçu{newCode ? " (nouveau code)" : ""}</button>
        </div>
      </div>

      {/* ---------- Actions agence de départ ---------- */}
      {p.can_origin && ["depose", "affecte"].includes(p.status) && (
        <div className="card mb-4">
          <h3 className="font-bold text-night mb-3">{p.status === "depose" ? "Affecter à un départ" : "Changer de départ"}</h3>
          <div className="flex gap-2 items-center mb-3">
            <input type="date" className="input-field max-w-[200px]" value={tripDate} min={todayBrazzaville()} onChange={(e) => setTripDate(e.target.value)} />
          </div>
          {trips === null ? (
            <p className="text-sm text-gray-400">Recherche des départs…</p>
          ) : trips.length === 0 ? (
            <p className="text-sm text-gray-500">Aucun départ de ce trajet à cette date (vérifiez que la ligne est active).</p>
          ) : (
            <div className="space-y-2">
              {trips.map((t) => (
                <button
                  key={t.trip_id}
                  disabled={busy || t.trip_id === p.trip_id}
                  onClick={() => run("action", { action: "assign", trip_id: t.trip_id }, "Colis affecté au départ.")}
                  className={`w-full text-left p-3 rounded-lg border ${t.trip_id === p.trip_id ? "border-accent-500 bg-accent-50" : "border-gray-200 hover:border-accent-500"}`}
                >
                  <span className="font-bold text-night">{String(t.boarding_at).slice(11, 16)}</span> · {t.bus_name}{" "}
                  <span className="text-xs text-gray-500">{t.corridor_label}</span>
                  {t.trip_id === p.trip_id && <span className="text-xs font-semibold text-accent-800 ml-2">(départ actuel)</span>}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 flex-wrap mt-4">
            {p.status === "affecte" && (
              <>
                <button disabled={busy} onClick={() => run("action", { action: "load" }, "Colis chargé dans le bus.")} className="btn-accent text-sm px-4 py-2">📦 Marquer chargé</button>
                <button disabled={busy} onClick={() => run("action", { action: "unassign" }, "Colis retiré du départ.")} className="btn-outline text-sm px-4 py-2">Retirer du départ</button>
              </>
            )}
            <button
              disabled={busy}
              onClick={() => {
                const note = ask("Motif de l'annulation :");
                if (note) run("action", { action: "cancel", note }, "Colis annulé.");
              }}
              className="text-sm px-4 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
            >
              Annuler le colis
            </button>
          </div>
        </div>
      )}

      {p.can_origin && p.status === "charge" && (
        <div className="card mb-4 flex gap-2 flex-wrap items-center">
          <p className="text-sm text-gray-700 flex-1">Chargé. Le passage « en transit » se fait au départ du bus (page Départs & chargement).</p>
          <button disabled={busy} onClick={() => run("action", { action: "unload" }, "Colis déchargé.")} className="btn-outline text-sm px-4 py-2">Décharger</button>
        </div>
      )}

      {/* ---------- Actions agence d'arrivée ---------- */}
      {p.can_destination && ["en_transit", "arrive"].includes(p.status) && (
        <div className="card mb-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-gray-700">Le colis est {p.status === "en_transit" ? "en route vers votre agence" : "arrivé"}.</p>
          <button disabled={busy} onClick={() => run("receive", {}, "Colis réceptionné : prêt au retrait.")} className="btn-accent">
            ✅ Réceptionner — prêt au retrait
          </button>
        </div>
      )}

      {p.can_destination && p.status === "pret_au_retrait" && (
        <div className="card mb-4 border-2 border-green-300">
          <h3 className="font-bold text-night mb-1">Remise au destinataire</h3>
          <p className="text-sm text-gray-600 mb-3">Demandez au destinataire son code secret à 6 chiffres. Le QR seul ne suffit pas.</p>
          {locked ? (
            <p className="text-sm text-red-700 mb-3">Retrait bloqué jusqu&apos;à {formatDateTime(p.pickup_locked_until!)} après 5 codes incorrects. Générez un nouveau code si besoin.</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(
                  "pickup",
                  { code, ...(p.payment_status === "a_payer" ? { method: payMethod, transaction_code: payTx } : {}) },
                  "Colis remis au destinataire."
                );
              }}
              className="space-y-3"
            >
              <input
                className="input-field font-mono text-2xl tracking-[0.4em] text-center max-w-[260px]"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
              />
              {p.payment_status === "a_payer" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-semibold text-red-800">Encaisser {formatXAF(p.price)} avant la remise</p>
                  <div className="flex gap-2 flex-wrap">
                    <select className="input-field max-w-[200px]" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                      <option value="especes">Espèces</option>
                      <option value="mtn">MTN MoMo</option>
                      <option value="airtel">Airtel Money</option>
                    </select>
                    {payMethod !== "especes" && (
                      <input className="input-field font-mono flex-1" placeholder="Code de transaction" value={payTx} onChange={(e) => setPayTx(e.target.value)} required />
                    )}
                  </div>
                </div>
              )}
              <button disabled={busy || code.length !== 6} className="btn-accent disabled:opacity-50">Vérifier le code et remettre le colis</button>
              {p.pickup_failed_attempts > 0 && <p className="text-xs text-red-600">{p.pickup_failed_attempts}/5 tentative(s) incorrecte(s)</p>}
            </form>
          )}
        </div>
      )}

      {/* ---------- Code, incidents ---------- */}
      {(p.can_origin || p.can_destination) && !["retire", "annule"].includes(p.status) && (
        <div className="card mb-4">
          {newCode && (
            <div className="bg-night text-white rounded-xl p-4 mb-3 text-center">
              <p className="text-xs text-gray-300">NOUVEAU CODE DE RETRAIT — l&apos;ancien ne fonctionne plus</p>
              <p className="font-mono text-3xl font-bold text-accent-500 tracking-widest">{newCode.replace(/(\d{3})(\d{3})/, "$1 $2")}</p>
              <p className="text-[11px] text-gray-400">Imprimez le reçu pour le remettre à l&apos;expéditeur.</p>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <button
              disabled={busy}
              onClick={() => {
                const note = ask("Motif (code perdu, bloqué…) — vérifiez l'identité de l'expéditeur ou du destinataire :");
                if (note) run("reset_code", { note }, "Nouveau code généré.");
              }}
              className="btn-outline text-sm px-4 py-2"
            >
              🔑 Générer un nouveau code de retrait
            </button>
            {p.status !== "incident" ? (
              <button
                disabled={busy}
                onClick={() => {
                  const note = ask("Décrivez l'incident :");
                  if (note) run("action", { action: "incident", note }, "Incident signalé.");
                }}
                className="text-sm px-4 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
              >
                ⚠️ Signaler un incident
              </button>
            ) : (
              <button
                disabled={busy}
                onClick={() => {
                  const note = ask("Résolution de l'incident :");
                  if (note) run("action", { action: "resolve", note }, "Incident résolu.");
                }}
                className="btn-primary text-sm px-4 py-2"
              >
                Incident résolu
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---------- Historique ---------- */}
      <div className="card">
        <h3 className="font-bold text-night mb-3">Historique</h3>
        <ol className="space-y-3">
          {p.events.map((e, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="mt-1 w-2.5 h-2.5 rounded-full bg-accent-500 shrink-0" />
              <div>
                <p className="font-semibold text-night">
                  {ACTION_LABEL[e.action] ?? e.action}
                  {e.from_status !== e.to_status && (
                    <span className="font-normal text-gray-500"> · {e.from_status ? `${PARCEL_STATUS[e.from_status]?.label ?? e.from_status} → ` : ""}{PARCEL_STATUS[e.to_status]?.label ?? e.to_status}</span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {formatDateTime(e.at)}{e.agent ? ` · ${e.agent}` : ""}{e.terminal ? ` · agence ${e.terminal}` : ""}
                </p>
                {e.note && <p className="text-xs text-gray-700">{e.note}</p>}
              </div>
            </li>
          ))}
        </ol>
        {p.payments.length > 0 && (
          <div className="mt-4 pt-4 border-t text-sm">
            <p className="font-semibold text-night mb-1">Encaissements</p>
            {p.payments.map((pay, i) => (
              <p key={i} className="text-gray-700">
                {formatXAF(pay.amount)} · {METHOD_LABEL[pay.method] ?? pay.method} · {pay.moment === "depot" ? "au dépôt" : "au retrait"} · {formatDateTime(pay.at)}{pay.agent ? ` · ${pay.agent}` : ""}
                {pay.transaction_code ? ` · ${pay.transaction_code}` : ""}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
