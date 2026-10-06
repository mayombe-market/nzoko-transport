"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { formatXAF } from "@/lib/utils";
import { todayBrazzaville } from "@/lib/parcel-ui";

interface Row {
  id: string;
  reference: string;
  status: string;
  sale_channel: string;
  is_demo: boolean;
  from_city: string;
  to_city: string;
  from_terminal: string | null;
  departure_time: string;
  passenger_count: number;
  total_price: number;
  seats: string | null;
  primary_passenger: string | null;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "Confirmée", cls: "bg-green-100 text-green-700" },
  pending: { label: "À vérifier", cls: "bg-yellow-100 text-yellow-700" },
  cancelled: { label: "Annulée", cls: "bg-red-100 text-red-700" },
  expired: { label: "Expirée", cls: "bg-gray-100 text-gray-500" },
};

// Réservations d'une date de voyage, dans le périmètre de la personne connectée (agence ou réseau)
export function RecentBookings() {
  const [date, setDate] = useState(todayBrazzaville());
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    setRows(null);
    authFetch("/api/admin/finance", { op: "recent_bookings", date })
      .then((r) => r.json())
      .then((json) => setRows(json.success ? json.data ?? [] : []))
      .catch(() => setRows([]));
  }, [date]);

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h2 className="font-bold text-night">Réservations du voyage du</h2>
        <input type="date" className="input-field w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {rows === null ? (
        <p className="text-sm text-gray-400 animate-pulse">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">Aucune réservation pour cette date.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2">Départ</th>
                <th>Référence</th>
                <th>Trajet</th>
                <th>Passager · sièges</th>
                <th>Canal</th>
                <th className="text-right">Montant</th>
                <th className="text-right">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATUS[r.status] ?? { label: r.status, cls: "bg-gray-100 text-gray-600" };
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 font-semibold">{r.departure_time}</td>
                    <td className="font-mono text-xs">
                      {r.reference}
                      {r.is_demo && <span className="ml-1 text-[10px] font-bold text-red-600">DÉMO</span>}
                    </td>
                    <td>{r.from_city} → {r.to_city}{r.from_terminal ? <span className="text-xs text-gray-400"> ({r.from_terminal})</span> : null}</td>
                    <td>{r.primary_passenger ?? "—"}{r.passenger_count > 1 ? ` +${r.passenger_count - 1}` : ""} · {r.seats ?? "—"}</td>
                    <td className="text-xs">{r.sale_channel === "guichet" ? "Guichet" : "En ligne"}</td>
                    <td className="text-right">{formatXAF(r.total_price)}</td>
                    <td className="text-right"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${st.cls}`}>{st.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
