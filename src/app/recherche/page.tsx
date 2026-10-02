"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { formatXAF, formatDuration, AMENITY_ICONS } from "@/lib/utils";
import { cityName, TERMINAL_NAMES } from "@/lib/cities";

interface Departure {
  tripId: string;
  corridorLabel: string;
  departTime: string;
  departDate: string;
  arriveTime: string;
  arriveDate: string;
  durationMin: number;
  km: number;
  price: number;
  premiumSupplement: number;
  busName: string;
  busType: string;
  amenities: string[];
  seatsTotal: number;
  seatsLeft: number;
}

function ResultsContent() {
  const params = useSearchParams();
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const date = params.get("date") || "";
  const passengers = Number(params.get("passengers") || "1");
  const fromTerminal = params.get("fromTerminal") || "";
  const toTerminal = params.get("toTerminal") || "";

  const [departures, setDepartures] = useState<Departure[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!from || !to || !date) return;
    setDepartures(null);
    setError("");
    fetch(`/api/departures?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${encodeURIComponent(date)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setDepartures(json.departures);
        else setError(json.message || "Erreur lors de la recherche.");
      })
      .catch(() => setError("Connexion impossible. Vérifiez votre réseau."));
  }, [from, to, date]);

  const seatLink = (d: Departure) =>
    `/siege?${new URLSearchParams({
      tripId: d.tripId,
      from,
      to,
      passengers: String(passengers),
      ...(fromTerminal && { fromTerminal }),
      ...(toTerminal && { toTerminal }),
    }).toString()}`;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* En-tête */}
      <div className="mb-8">
        <Link href="/" className="text-night hover:text-accent-700 text-sm mb-4 inline-flex items-center gap-1">
          ← Modifier la recherche
        </Link>
        <h1 className="section-title mt-2">
          {cityName(from)} → {cityName(to)}
        </h1>
        <p className="text-gray-600 mt-1">
          {fromTerminal && <span className="text-night font-medium">Départ : {TERMINAL_NAMES[fromTerminal] || fromTerminal}</span>}
          {fromTerminal && toTerminal && " • "}
          {toTerminal && <span className="text-night font-medium">Arrivée : {TERMINAL_NAMES[toTerminal] || toTerminal}</span>}
        </p>
        {date && (
          <p className="text-gray-600 mt-1">
            {new Date(date + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} •{" "}
            {passengers} passager{passengers > 1 ? "s" : ""}
          </p>
        )}
      </div>

      {error ? (
        <div className="card text-center py-12">
          <p className="text-red-600">{error}</p>
          <Link href="/" className="btn-primary inline-block mt-6">Nouvelle recherche</Link>
        </div>
      ) : departures === null ? (
        <div className="card text-center py-12 text-gray-400 animate-pulse">Recherche des départs…</div>
      ) : departures.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-5xl mb-4">🚌</div>
          <h2 className="text-xl font-bold text-gray-700 mb-2">Aucun départ disponible</h2>
          <p className="text-gray-500">
            Aucun bus programmé pour ce trajet à cette date. Essayez une autre date ou un autre itinéraire.
          </p>
          <Link href="/" className="btn-primary inline-block mt-6">Nouvelle recherche</Link>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            {departures.length} départ{departures.length > 1 ? "s" : ""} disponible{departures.length > 1 ? "s" : ""}
          </p>

          {departures.map((d) => {
            const full = d.seatsLeft < passengers;
            const dayShift = d.arriveDate > d.departDate;
            return (
              <div key={d.tripId} className="card border-l-4 border-l-accent-500 hover:shadow-lg transition-shadow">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Horaires */}
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-black text-night">{d.departTime}</div>
                      <div className="text-xs text-gray-500">{cityName(from)}</div>
                    </div>

                    <div className="flex flex-col items-center">
                      <div className="text-xs text-gray-400">{formatDuration(d.durationMin)}</div>
                      <div className="w-20 h-0.5 bg-accent-500 my-1 relative">
                        <div className="absolute -left-1 -top-1 w-2.5 h-2.5 bg-night rounded-full" />
                        <div className="absolute -right-1 -top-1 w-2.5 h-2.5 bg-accent-500 rounded-full" />
                      </div>
                      <div className="text-xs text-gray-400">{d.km} km</div>
                    </div>

                    <div className="text-center">
                      <div className="text-2xl font-black text-night">
                        {d.arriveTime}
                        {dayShift && <sup className="text-xs text-red-500 ml-1">+1j</sup>}
                      </div>
                      <div className="text-xs text-gray-500">{cityName(to)}</div>
                    </div>
                  </div>

                  {/* Info bus */}
                  <div className="flex flex-col items-start md:items-center gap-1">
                    <span className="text-sm font-medium text-gray-700">{d.busName}</span>
                    <div className="flex gap-1">
                      {d.amenities.map((a) => (
                        <span key={a} title={a} className="text-sm">{AMENITY_ICONS[a] || "✓"}</span>
                      ))}
                    </div>
                    <span className={`text-xs ${d.seatsLeft <= 5 ? "text-red-600 font-semibold" : "text-gray-500"}`}>
                      {d.seatsLeft} place{d.seatsLeft > 1 ? "s" : ""} libre{d.seatsLeft > 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Prix + action */}
                  <div className="flex items-center gap-4 md:flex-col md:items-end">
                    <div className="text-right">
                      <div className="text-2xl font-black text-accent-700">{formatXAF(d.price)}</div>
                      {passengers > 1 && (
                        <div className="text-xs text-gray-500">Total : {formatXAF(d.price * passengers)}</div>
                      )}
                    </div>
                    {full ? (
                      <span className="text-sm font-semibold text-gray-400 px-5 py-2">Complet</span>
                    ) : (
                      <Link href={seatLink(d)} className="btn-accent text-sm px-5 py-2 whitespace-nowrap">
                        Choisir →
                      </Link>
                    )}
                  </div>
                </div>
                <p className="mt-3 text-xs text-gray-400">{d.corridorLabel}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RecherchePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 py-8 text-center">
          <div className="animate-pulse text-gray-400">Chargement des résultats...</div>
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
