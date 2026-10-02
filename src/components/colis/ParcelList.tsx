"use client";

import Link from "next/link";
import { formatXAF } from "@/lib/utils";
import { PARCEL_STATUS, formatDateTime } from "@/lib/parcel-ui";

export interface ParcelRow {
  id: string;
  reference: string;
  status: string;
  created_at: string;
  sender_name: string;
  recipient_name: string;
  recipient_phone: string;
  from_city_name: string;
  to_city_name: string;
  to_terminal_name: string;
  description: string;
  quantity: number;
  price: number;
  payment_status: string;
  trip: { date: string; departure_time: string; bus_name: string | null } | null;
}

export function ParcelStatusBadge({ status }: { status: string }) {
  const s = PARCEL_STATUS[status] ?? { label: status, cls: "bg-gray-100 text-gray-700" };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

export function ParcelList({ rows, empty }: { rows: ParcelRow[] | null; empty: string }) {
  if (rows === null) return <div className="card text-center text-gray-400 animate-pulse">Chargement…</div>;
  if (rows.length === 0) return <div className="card text-center text-gray-500">{empty}</div>;
  return (
    <div className="space-y-2">
      {rows.map((p) => (
        <Link key={p.id} href={`/admin/colis/${p.id}`} className="block bg-white border border-gray-200 border-l-4 border-l-accent-500 rounded-r-lg p-3 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-night">{p.reference}</span>
                <ParcelStatusBadge status={p.status} />
                {p.payment_status === "a_payer" && <span className="text-xs font-semibold text-red-700">Port dû</span>}
              </div>
              <p className="text-sm text-gray-700 mt-1 truncate">
                {p.from_city_name} → <strong>{p.to_city_name}</strong> ({p.to_terminal_name}) · {p.quantity} × {p.description}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {p.sender_name} → {p.recipient_name} · {p.recipient_phone}
                {p.trip && ` · Bus ${p.trip.departure_time} du ${p.trip.date}`}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-accent-700 text-sm">{formatXAF(p.price)}</p>
              <p className="text-[11px] text-gray-400">{formatDateTime(p.created_at)}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
