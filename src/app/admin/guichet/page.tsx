"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authFetch, authHeaders } from "@/lib/auth-fetch";
import { useAgent, todayBrazzaville } from "@/lib/parcel-ui";
import { useNetwork } from "@/lib/network";
import { buildLayout, seatIsPremium, type BusLayoutConfig } from "@/lib/seat-layout";
import { formatXAF } from "@/lib/utils";
import { PhoneInput } from "@/components/PhoneInput";
import { isValidPhone } from "@/lib/phone";
import { LogoIcon } from "@/components/Logo";

interface Departure {
  tripId: string;
  departTime: string;
  arriveTime: string;
  busName: string;
  price: number;
  seatsLeft: number;
  status?: string;
  delayMinutes?: number;
}

interface Trip {
  tripId: string;
  price: number;
  premiumSupplement: number;
  bus: BusLayoutConfig & { name: string };
  booked: string[];
  held: string[];
}

const newToken = () => `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");

// Vente au guichet, paiement en espèces : départ → siège → passager → encaissement → billet.
// Même plan de sièges que la vente en ligne : aucune double vente possible.
export default function GuichetPage() {
  const { agent, ready } = useAgent();
  const { cities, terminals, terminalsOf, cityLabel } = useNetwork();
  const central = agent && ["admin", "finance"].includes(agent.role);

  const [fromTerminal, setFromTerminal] = useState("");
  const [to, setTo] = useState("");
  const [toTerminal, setToTerminal] = useState("");
  const [date, setDate] = useState(todayBrazzaville());
  const [departures, setDepartures] = useState<Departure[] | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [seats, setSeats] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [phone, setPhone] = useState("");
  const [token, setToken] = useState(newToken);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sold, setSold] = useState<{ reference: string; accessKey: string; totalPrice: number; tickets: number } | null>(null);

  useEffect(() => {
    if (agent?.terminal_id && !central) setFromTerminal(agent.terminal_id);
  }, [agent, central]);

  const from = terminals.find((t) => t.id === fromTerminal)?.city_id ?? "";
  const toTerminals = to ? terminalsOf(to) : [];

  const loadDepartures = useCallback(async () => {
    setTrip(null);
    setSeats([]);
    if (!from || !to || from === to) return setDepartures(null);
    setDepartures(null);
    const res = await fetch(`/api/departures?from=${from}&to=${to}&date=${date}`);
    const json = await res.json().catch(() => null);
    setDepartures(json?.success ? (json.departures as Departure[]).filter((d) => d.status !== "cancelled") : []);
  }, [from, to, date]);

  useEffect(() => {
    loadDepartures();
  }, [loadDepartures]);

  async function openTrip(tripId: string) {
    setMsg(null);
    setSeats([]);
    const res = await fetch(`/api/trips/${tripId}?from=${from}&to=${to}`);
    const json = await res.json().catch(() => null);
    if (json?.success) setTrip(json.trip);
    else setMsg({ ok: false, text: json?.message || "Départ introuvable." });
  }

  async function toggleSeat(seat: string) {
    if (!trip) return;
    setMsg(null);
    const headers = await authHeaders();
    if (seats.includes(seat)) {
      setSeats((s) => s.filter((x) => x !== seat));
      await fetch(`/api/trips/${trip.tripId}/hold`, { method: "DELETE", headers, body: JSON.stringify({ seats: [seat], token }) });
      return;
    }
    if (seats.length >= 10) return setMsg({ ok: false, text: "10 sièges maximum par vente." });
    setSeats((s) => [...s, seat]);
    const res = await fetch(`/api/trips/${trip.tripId}/hold`, { method: "POST", headers, body: JSON.stringify({ seats: [seat], token }) });
    const json = await res.json().catch(() => null);
    if (!json?.success) {
      setSeats((s) => s.filter((x) => x !== seat));
      setMsg({ ok: false, text: json?.message || "Siège indisponible." });
      openTrip(trip.tripId);
    }
  }

  const total = useMemo(() => {
    if (!trip) return 0;
    return seats.reduce((sum, s) => sum + trip.price + (seatIsPremium(trip.bus, s) ? trip.premiumSupplement : 0), 0);
  }, [trip, seats]);

  const namesOk = seats.length > 0 && seats.every((s) => (names[s] ?? "").trim().length >= 2);
  const phoneOk = !phone || isValidPhone(phone);
  const needToAgency = toTerminals.length > 1 && !toTerminal;

  async function sell() {
    if (!trip || !namesOk || !phoneOk || needToAgency) return;
    if (!confirm(`Encaisser ${formatXAF(total)} en espèces et émettre ${seats.length} billet(s) ?`)) return;
    setBusy(true);
    setMsg(null);
    const res = await authFetch("/api/admin/guichet", {
      tripId: trip.tripId,
      from,
      to,
      fromTerminal,
      toTerminal: toTerminal || (toTerminals.length === 1 ? toTerminals[0].id : null),
      token,
      passengers: seats.map((s) => ({ seat: s, fullName: names[s] })),
      customerPhone: phone || null,
    });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (!json?.success) return setMsg({ ok: false, text: json?.message || "Vente impossible." });
    setSold({ reference: json.reference, accessKey: json.accessKey, totalPrice: json.totalPrice, tickets: json.tickets });
  }

  function reset() {
    setSold(null);
    setSeats([]);
    setNames({});
    setPhone("");
    setToken(newToken());
    if (trip) openTrip(trip.tripId);
  }

  if (!ready || !agent) return <div className="max-w-5xl mx-auto px-4 py-12 text-center text-gray-400">Chargement…</div>;

  const ticketUrl = sold ? `/billet/${sold.reference}?k=${encodeURIComponent(sold.accessKey)}` : "";
  const pdfUrl = sold ? `/api/billet/${sold.reference}/pdf?k=${encodeURIComponent(sold.accessKey)}` : "";
  const agencyName = terminals.find((t) => t.id === fromTerminal)?.name;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-night rounded-xl flex items-center justify-center"><LogoIcon className="w-7 h-7" /></div>
          <div>
            <h1 className="section-title">Vente au guichet</h1>
            <p className="text-xs text-gray-500">{agent.full_name} · {agencyName ? `Agence ${agencyName}` : "Choisissez l'agence de vente"} · paiement en espèces</p>
          </div>
        </div>
        <Link href="/admin" className="text-sm text-gray-500 hover:text-night">← Tableau de bord</Link>
      </div>

      {sold ? (
        <div className="card border-2 border-green-500 text-center">
          <div className="text-4xl mb-2">✅</div>
          <h2 className="text-xl font-bold text-night">Vente enregistrée — {sold.reference}</h2>
          <p className="text-gray-600 mt-1">{formatXAF(sold.totalPrice)} encaissés en espèces · {sold.tickets} billet(s) émis</p>
          <div className="flex flex-wrap gap-3 justify-center mt-5">
            <a href={pdfUrl} target="_blank" rel="noopener" className="btn-accent">🖨️ Imprimer le billet (PDF)</a>
            <a href={ticketUrl} target="_blank" rel="noopener" className="btn-outline">Voir le billet</a>
            <button onClick={reset} className="btn-primary">Nouvelle vente</button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="card grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Agence de vente (départ)</label>
              <select className="input-field" value={fromTerminal} disabled={!central} onChange={(e) => setFromTerminal(e.target.value)}>
                <option value="">Choisir…</option>
                {terminals.map((t) => (
                  <option key={t.id} value={t.id}>{cityLabel(t.city_id)} — {t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
              <select className="input-field" value={to} onChange={(e) => { setTo(e.target.value); setToTerminal(""); }}>
                <option value="">Choisir…</option>
                {cities.filter((c) => c.id !== from).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Agence d&apos;arrivée</label>
              <select className="input-field" value={toTerminal} onChange={(e) => setToTerminal(e.target.value)} disabled={toTerminals.length <= 1}>
                <option value="">{toTerminals.length === 1 ? toTerminals[0].name : toTerminals.length === 0 ? "Pas d'agence (arrêt)" : "Choisir…"}</option>
                {toTerminals.length > 1 && toTerminals.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" className="input-field" value={date} min={todayBrazzaville()} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {from && to && departures !== null && (
            <div className="card">
              <h2 className="font-bold text-night mb-3">Départs</h2>
              {departures.length === 0 ? (
                <p className="text-sm text-gray-500">Aucun départ disponible pour ce trajet à cette date.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {departures.map((d) => (
                    <button
                      key={d.tripId}
                      onClick={() => openTrip(d.tripId)}
                      disabled={d.seatsLeft === 0}
                      className={`px-4 py-2 rounded-lg border-2 text-sm text-left disabled:opacity-40 ${trip?.tripId === d.tripId ? "border-accent-500 bg-accent-50" : "border-gray-200"}`}
                    >
                      <span className="block font-bold text-night">{d.departTime}{(d.delayMinutes ?? 0) > 0 ? ` (+${d.delayMinutes} min)` : ""}</span>
                      <span className="text-xs text-gray-500">{d.busName} · {d.seatsLeft} place(s) · {formatXAF(d.price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {trip && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="card">
                <h2 className="font-bold text-night mb-1">Sièges — {trip.bus.name}</h2>
                <p className="text-xs text-gray-500 mb-3">★ premium (+{formatXAF(trip.premiumSupplement)}) · gris : vendu ou en cours de réservation</p>
                <div className="space-y-1.5">
                  {buildLayout(trip.bus).map((row) => (
                    <div key={row.number} className="flex items-center gap-1.5">
                      <span className="w-5 text-xs text-gray-400">{row.number}</span>
                      {[...row.left, ...(row.right.length ? [null] : []), ...row.right].map((seat, i) =>
                        seat === null ? (
                          <span key={`aisle-${i}`} className="w-4" />
                        ) : (
                          <button
                            key={seat.label}
                            onClick={() => toggleSeat(seat.label)}
                            disabled={!seats.includes(seat.label) && (trip.booked.includes(seat.label) || trip.held.includes(seat.label))}
                            className={`w-10 h-9 rounded text-xs font-semibold border-2 ${
                              seats.includes(seat.label)
                                ? "bg-accent-500 border-night text-night"
                                : trip.booked.includes(seat.label) || trip.held.includes(seat.label)
                                ? "bg-gray-200 border-gray-200 text-gray-400"
                                : seat.premium
                                ? "bg-anthracite text-white border-accent-500"
                                : "bg-anthracite text-white border-anthracite"
                            }`}
                          >
                            {seat.label}
                            {seat.premium && !seats.includes(seat.label) ? "★" : ""}
                          </button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <h2 className="font-bold text-night mb-3">Passagers</h2>
                {seats.length === 0 ? (
                  <p className="text-sm text-gray-500">Touchez un siège libre sur le plan.</p>
                ) : (
                  <div className="space-y-3">
                    {seats.map((s) => (
                      <div key={s}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Siège {s} — {formatXAF(trip.price + (seatIsPremium(trip.bus, s) ? trip.premiumSupplement : 0))}
                        </label>
                        <input
                          className="input-field"
                          value={names[s] ?? ""}
                          onChange={(e) => setNames((n) => ({ ...n, [s]: e.target.value }))}
                          placeholder="Nom complet du passager"
                        />
                      </div>
                    ))}
                    <PhoneInput label="Téléphone du client (facultatif)" value={phone} onChange={(v) => setPhone(v)} />
                    {needToAgency && <p className="text-sm text-red-600">Choisissez l&apos;agence d&apos;arrivée.</p>}
                    <div className="flex items-center justify-between border-t pt-3">
                      <span className="text-sm text-gray-600">Total à encaisser</span>
                      <span className="text-2xl font-black text-accent-700">{formatXAF(total)}</span>
                    </div>
                    <button onClick={sell} disabled={busy || !namesOk || !phoneOk || needToAgency} className="btn-accent w-full disabled:opacity-50">
                      {busy ? "Enregistrement…" : "💵 Encaisser en espèces et émettre les billets"}
                    </button>
                    <p className="text-xs text-gray-400">Le montant officiel est recalculé par le serveur. Les sièges restent bloqués 15 minutes pendant la vente.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {msg && (
            <div className={`rounded-lg border p-3 text-sm ${msg.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>
          )}
        </div>
      )}
    </div>
  );
}
