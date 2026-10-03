"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cityName } from "@/lib/cities";
import { colisApi, todayBrazzaville, useAgent } from "@/lib/parcel-ui";
import { ParcelStatusBadge, type ParcelRow } from "@/components/colis/ParcelList";
import { ParcelNav } from "@/components/colis/ParcelNav";

interface Departure {
  trip_id: string;
  boarding_at: string;
  corridor_label: string;
  terminus: string;
  bus_name: string | null;
  passengers: number;
  parcels: number;
  parcels_loaded: number;
}

interface Manifest {
  trip: { date: string; departure_time: string; corridor_label: string; bus_name: string | null };
  passengers: number;
  parcels: (ParcelRow & { to_terminal_name: string; weight_kg: number | null })[];
}

export default function DepartsPage() {
  const { agent, allTerminals, ready } = useAgent();
  const cities = useMemo(() => Array.from(new Set(allTerminals.map((t) => t.city_id))), [allTerminals]);
  const [city, setCity] = useState("");
  const [date, setDate] = useState(todayBrazzaville());
  const [deps, setDeps] = useState<Departure[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && !city) setCity(agent?.terminals?.city_id ?? cities[0] ?? "");
  }, [ready, agent, cities, city]);

  const loadDeps = useCallback(async () => {
    if (!city) return;
    setDeps(null);
    const r = await colisApi<Departure[]>("city_departures", { city, date });
    setDeps(r.success ? r.data ?? [] : []);
  }, [city, date]);

  const loadManifest = useCallback(
    async (trip: string) => {
      const r = await colisApi<Manifest>("manifest", { trip_id: trip, city });
      setManifest(r.success ? r.data! : null);
    },
    [city]
  );

  useEffect(() => {
    loadDeps();
    setOpen(null);
  }, [loadDeps]);

  useEffect(() => {
    if (open) loadManifest(open);
  }, [open, loadManifest]);

  async function act(op: string, params: Record<string, unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    const r = await colisApi(op, params);
    setBusy(false);
    setMsg({ ok: r.success, text: r.success ? ok.replace("{n}", String(r.data?.count ?? "")) : r.message || "Erreur." });
    if (open) await loadManifest(open);
    await loadDeps();
  }

  if (!ready || !agent) return <div className="max-w-5xl mx-auto px-4 py-12 text-center text-gray-400">Chargement…</div>;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 print:p-0">
      <div className="print:hidden">
        <ParcelNav title="Départs & chargement" isAdmin={agent.role === "admin"} />
        <div className="card flex gap-3 flex-wrap items-end mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Ville de départ</label>
            <select className="input-field" value={city} onChange={(e) => setCity(e.target.value)} disabled={!!agent.terminal_id && agent.role !== "admin"}>
              {cities.map((c) => (
                <option key={c} value={c}>{cityName(c)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input type="date" className="input-field" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {msg && <div className={`mb-4 rounded-lg border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
      </div>

      {deps === null ? (
        <div className="card text-center text-gray-400 animate-pulse">Chargement des départs…</div>
      ) : deps.length === 0 ? (
        <div className="card text-center text-gray-500">Aucun départ depuis {cityName(city)} ce jour-là (lignes actives uniquement).</div>
      ) : (
        <div className="space-y-3">
          {deps.map((d) => (
            <div key={d.trip_id} className={`card border-l-4 ${open === d.trip_id ? "border-l-accent-500" : "border-l-gray-200"} ${open && open !== d.trip_id ? "print:hidden" : ""}`}>
              <button onClick={() => setOpen(open === d.trip_id ? null : d.trip_id)} className="w-full text-left print:hidden">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-bold text-night text-lg">
                      {cityName(city)} → {d.terminus} — {String(d.boarding_at).slice(11, 16)}
                    </p>
                    <p className="text-xs text-gray-500">{d.bus_name} · {d.corridor_label}</p>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span>👤 Passagers : <strong>{d.passengers}</strong></span>
                    <span>📦 Colis : <strong>{d.parcels}</strong> <span className="text-gray-500">({d.parcels_loaded} chargé{d.parcels_loaded > 1 ? "s" : ""})</span></span>
                  </div>
                </div>
              </button>

              {open === d.trip_id && manifest && (
                <div className="mt-4 pt-4 border-t">
                  <div className="hidden print:block mb-4">
                    <h1 className="text-xl font-bold">Manifeste colis — {cityName(city)} → {d.terminus}</h1>
                    <p>{manifest.trip.date} à {String(d.boarding_at).slice(11, 16)} · {manifest.trip.bus_name} · Passagers : {manifest.passengers} · Colis : {manifest.parcels.length}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap mb-3 print:hidden">
                    <button onClick={() => window.print()} className="btn-outline text-sm px-4 py-2">🖨️ Imprimer le manifeste</button>
                    <button
                      disabled={busy || !manifest.parcels.some((p) => p.status === "charge")}
                      onClick={() => {
                        if (confirm("Confirmer le départ du bus ? Tous les colis chargés passeront « en transit ».")) act("depart_trip", { trip_id: d.trip_id }, "Départ enregistré : {n} colis en transit.");
                      }}
                      className="btn-accent text-sm px-4 py-2 disabled:opacity-50"
                    >
                      🚌 Départ du bus
                    </button>
                  </div>
                  {manifest.parcels.length === 0 ? (
                    <p className="text-sm text-gray-500">Aucun colis affecté à ce départ. Affectez-les depuis la fiche de chaque colis.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 border-b">
                          <th className="py-2">Référence</th>
                          <th>Destination</th>
                          <th>Destinataire</th>
                          <th>Contenu</th>
                          <th>Statut</th>
                          <th className="print:hidden"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {manifest.parcels.map((p) => (
                          <tr key={p.id} className="border-b last:border-0">
                            <td className="py-2 font-mono font-semibold">
                              <Link href={`/admin/colis/${p.id}`} className="hover:underline">{p.reference}</Link>
                            </td>
                            <td>{p.to_city_name} ({p.to_terminal_name})</td>
                            <td>{p.recipient_name}</td>
                            <td>{p.quantity} × {p.description}{p.weight_kg ? ` · ${p.weight_kg} kg` : ""}</td>
                            <td><ParcelStatusBadge status={p.status} /></td>
                            <td className="print:hidden text-right">
                              {p.status === "affecte" && (
                                <button disabled={busy} onClick={() => act("action", { id: p.id, action: "load" }, `${p.reference} chargé.`)} className="text-xs px-3 py-1 rounded bg-accent-500 text-night font-semibold">
                                  Charger
                                </button>
                              )}
                              {p.status === "charge" && (
                                <button disabled={busy} onClick={() => act("action", { id: p.id, action: "unload" }, `${p.reference} déchargé.`)} className="text-xs px-3 py-1 rounded border border-gray-300">
                                  Décharger
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
