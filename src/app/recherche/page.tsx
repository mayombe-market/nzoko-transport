"use client";

import { useSearchParams } from "next/navigation";
import { searchTrips, cityName } from "@/lib/trips";
import { formatXAF, formatDuration, AMENITY_ICONS } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";

function ResultsContent() {
  const params = useSearchParams();
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const date = params.get("date") || "";
  const passengers = Number(params.get("passengers") || "1");

  const trips = searchTrips(from, to, date);

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
          {new Date(date + "T00:00:00").toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })} • {passengers} passager{passengers > 1 ? "s" : ""}
        </p>
      </div>

      {/* Résultats */}
      {trips.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-5xl mb-4">🚌</div>
          <h2 className="text-xl font-bold text-gray-700 mb-2">Aucun trajet trouvé</h2>
          <p className="text-gray-500">
            Aucun bus ne dessert ce trajet. Essayez une autre date ou un autre itinéraire.
          </p>
          <Link href="/" className="btn-primary inline-block mt-6">
            Nouvelle recherche
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            {trips.length} trajet{trips.length > 1 ? "s" : ""} disponible{trips.length > 1 ? "s" : ""}
          </p>

          {trips.map((trip) => (
            <div key={trip.tripId} className="card hover:shadow-lg transition-shadow">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Horaires */}
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-black text-night">{trip.departTime}</div>
                    <div className="text-xs text-gray-500">{trip.fromName}</div>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="text-xs text-gray-400">{formatDuration(trip.durationMin)}</div>
                    <div className="w-20 h-0.5 bg-accent-500 my-1 relative">
                      <div className="absolute -left-1 -top-1 w-2.5 h-2.5 bg-night rounded-full" />
                      <div className="absolute -right-1 -top-1 w-2.5 h-2.5 bg-accent-500 rounded-full" />
                    </div>
                    <div className="text-xs text-gray-400">{trip.km} km</div>
                  </div>

                  <div className="text-center">
                    <div className="text-2xl font-black text-night">
                      {trip.arriveTime}
                      {trip.arriveDayShift > 0 && (
                        <sup className="text-xs text-red-500 ml-1">+{trip.arriveDayShift}j</sup>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">{trip.toName}</div>
                  </div>
                </div>

                {/* Info bus */}
                <div className="flex flex-col items-start md:items-center gap-1">
                  <span className="text-sm font-medium text-gray-700">{trip.busType}</span>
                  <div className="flex gap-1">
                    {trip.amenities.map((a) => (
                      <span key={a} title={a} className="text-sm">
                        {AMENITY_ICONS[a] || "✓"}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Prix + action */}
                <div className="flex items-center gap-4 md:flex-col md:items-end">
                  <div className="text-right">
                    <div className="text-2xl font-black text-accent-700">
                      {formatXAF(trip.price)}
                    </div>
                    {passengers > 1 && (
                      <div className="text-xs text-gray-500">
                        Total : {formatXAF(trip.price * passengers)}
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/siege?tripId=${encodeURIComponent(trip.tripId)}&passengers=${passengers}`}
                    className="btn-accent text-sm px-5 py-2 whitespace-nowrap"
                  >
                    Choisir →
                  </Link>
                </div>
              </div>

              {/* Arrêts intermédiaires (collapsible) */}
              {trip.stops.length > 2 && (
                <details className="mt-4 border-t pt-3">
                  <summary className="text-sm text-gray-500 cursor-pointer hover:text-night">
                    Voir les {trip.stops.length} arrêts
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {trip.stops.map((stop, i) => (
                      <div key={stop.city} className="text-xs text-gray-600 flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${i === 0 ? "bg-night" : i === trip.stops.length - 1 ? "bg-accent-500" : "bg-gray-300"}`} />
                        {stop.name} ({stop.time})
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RecherchePage() {
  return (
    <Suspense fallback={
      <div className="max-w-5xl mx-auto px-4 py-8 text-center">
        <div className="animate-pulse text-gray-400">Chargement des résultats...</div>
      </div>
    }>
      <ResultsContent />
    </Suspense>
  );
}
