"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth-fetch";
import { formatXAF } from "@/lib/utils";
import { formatDateTime, useAgent } from "@/lib/parcel-ui";
import { LogoIcon } from "@/components/Logo";

interface PaymentRow {
  payment_id: string;
  booking_id: string;
  reference: string;
  status: string;
  method: string;
  amount: number;
  transaction_code: string | null;
  phone_sender: string | null;
  declared_at: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  agency_name: string | null;
  account_number: string | null;
  from_city: string;
  to_city: string;
  date: string;
  departure_time: string;
  passenger_count: number;
  primary_passenger: string | null;
}

const TABS = [
  { key: "pending", label: "⏳ À vérifier" },
  { key: "confirmed", label: "✅ Confirmés" },
  { key: "rejected", label: "❌ Refusés" },
] as const;

// Paiements voyageurs (Mobile Money manuel) de l'agence de l'agent — ou de tout le réseau pour le central
export default function PaiementsPage() {
  const { agent, ready } = useAgent();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pending");
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const res = await authFetch("/api/admin/finance", { op: "payments", status: tab });
    const json = await res.json();
    setRows(json.success ? json.data ?? [] : []);
  }, [tab]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function decide(row: PaymentRow, action: "confirm" | "reject") {
    let reason = "";
    if (action === "confirm") {
      if (!confirm(`Confirmez-vous avoir reçu ${formatXAF(row.amount)} (${row.method.toUpperCase()}, réf. ${row.transaction_code}) sur le compte ${row.account_number ?? "de l'agence"} ?`)) return;
    } else {
      const r = prompt("Motif du refus :", "Paiement non reçu sur le compte de l'agence");
      if (r === null) return;
      reason = r;
    }
    setBusy(row.booking_id);
    const res = await authFetch(`/api/admin/bookings/${row.booking_id}/${action}`, { reason });
    const json = await res.json();
    setBusy(null);
    setMsg({
      ok: json.success,
      text: json.success
        ? action === "confirm"
          ? `${row.reference} confirmée : ${json.tickets} billet(s) créé(s).${json.email?.sent ? " Billet envoyé par email." : ""}`
          : `${row.reference} refusée, sièges libérés.`
        : json.message || "Erreur.",
    });
    load();
  }

  if (!ready || !agent) return <div className="max-w-5xl mx-auto px-4 py-12 text-center text-gray-400">Chargement…</div>;
  const scope = ["admin", "finance"].includes(agent.role) ? "Tout le réseau Nzoko" : agent.terminals ? `Agence ${agent.terminals.name}` : "Aucune agence";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-night rounded-xl flex items-center justify-center"><LogoIcon className="w-7 h-7" /></div>
          <div>
            <h1 className="section-title">Paiements voyageurs</h1>
            <p className="text-xs text-gray-500">{agent.full_name} · {scope}</p>
          </div>
        </div>
        <Link href="/admin" className="text-sm text-gray-500 hover:text-night">← Tableau de bord</Link>
      </div>

      <p className="text-sm text-gray-600 mb-4 bg-accent-50 border border-accent-200 rounded-lg p-3">
        Vérifiez sur le <strong>compte réel</strong> de l&apos;agence (MTN / Airtel) que le montant et la référence correspondent avant de confirmer.
        La confirmation crée les billets et leur QR code.
      </p>

      <div className="flex gap-2 mb-4">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-2 rounded-lg text-sm font-medium ${tab === t.key ? "bg-accent-500 text-night" : "bg-white border border-gray-200"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && <div className={`mb-4 rounded-lg border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}

      {rows === null ? (
        <div className="card text-center text-gray-400 animate-pulse">Chargement…</div>
      ) : rows.length === 0 ? (
        <div className="card text-center text-gray-500">Aucun paiement dans cette catégorie.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.payment_id} className="bg-white border border-gray-200 border-l-4 border-l-accent-500 rounded-r-lg p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-mono font-bold text-night">{r.reference}</p>
                  <p className="text-sm text-gray-700">{r.from_city} → {r.to_city} · {r.date} {r.departure_time} · {r.passenger_count} passager(s) · {r.primary_passenger}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Agence bénéficiaire : <strong>{r.agency_name ?? "non attribuée"}</strong> · compte {r.account_number ?? "—"} · déclaré le {formatDateTime(r.declared_at)}
                  </p>
                  {r.confirmed_at && <p className="text-xs text-gray-500">Traité le {formatDateTime(r.confirmed_at)} par {r.confirmed_by ?? "—"}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-accent-700">{formatXAF(r.amount)}</p>
                  <p className="text-sm font-semibold">{r.method === "mtn" ? "MTN MoMo" : "Airtel Money"}</p>
                  <p className="font-mono text-sm">{r.transaction_code}</p>
                  <p className="text-xs text-gray-500">depuis {r.phone_sender}</p>
                </div>
              </div>
              {r.status === "pending" && (
                <div className="flex gap-2 mt-3">
                  <button disabled={busy === r.booking_id} onClick={() => decide(r, "confirm")} className="btn-accent text-sm px-4 py-2">✅ Argent reçu — confirmer</button>
                  <button disabled={busy === r.booking_id} onClick={() => decide(r, "reject")} className="text-sm px-4 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50">Refuser</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
