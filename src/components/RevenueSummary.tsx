"use client";

import { useEffect, useState } from "react";
import { formatXAF } from "@/lib/utils";
import { colisApi, todayBrazzaville } from "@/lib/parcel-ui";

const PERIODS = [
  { key: "jour", label: "Aujourd'hui", days: 0 },
  { key: "7j", label: "7 derniers jours", days: 6 },
  { key: "30j", label: "30 derniers jours", days: 29 },
] as const;

// Revenus encaissés (paiements confirmés) : voyageurs / colis / total
export function RevenueSummary() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("jour");
  const [data, setData] = useState<{ voyageurs: number; voyageurs_count: number; colis: number; colis_count: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const to = todayBrazzaville();
    const d = new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - PERIODS.find((p) => p.key === period)!.days);
    setData(null);
    colisApi("revenue", { from: d.toISOString().slice(0, 10), to }).then((r) => (r.success ? setData(r.data) : setError(r.message || "Erreur.")));
  }, [period]);

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h2 className="font-bold text-night">Revenus encaissés</h2>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)} className={`px-3 py-1 rounded-lg text-xs font-medium ${period === p.key ? "bg-night text-white" : "bg-gray-100 text-gray-600"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !data ? (
        <p className="text-sm text-gray-400 animate-pulse">Chargement…</p>
      ) : (
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">🎫 Voyageurs</p>
            <p className="text-2xl font-black text-night">{formatXAF(data.voyageurs)}</p>
            <p className="text-xs text-gray-500">{data.voyageurs_count} paiement(s) confirmé(s)</p>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">📦 Colis</p>
            <p className="text-2xl font-black text-night">{formatXAF(data.colis)}</p>
            <p className="text-xs text-gray-500">{data.colis_count} encaissement(s)</p>
          </div>
          <div className="rounded-xl border-2 border-accent-500 bg-accent-50 p-4">
            <p className="text-xs text-accent-900">Total</p>
            <p className="text-2xl font-black text-accent-800">{formatXAF(data.voyageurs + data.colis)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
