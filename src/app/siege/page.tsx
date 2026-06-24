"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, Suspense } from "react";
import { getTripById } from "@/lib/trips";
import { formatXAF } from "@/lib/utils";
import Link from "next/link";

function SeatContent() {
  const params = useSearchParams();
  const router = useRouter();
  const tripId = params.get("tripId") || "";
  const passengers = Number(params.get("passengers") || "1");

  const trip = getTripById(tripId);
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);

  if (!trip) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <h1 className="section-title mb-4">Trajet introuvable</h1>
        <Link href="/" className="btn-primary">Retour à l&apos;accueil</Link>
      </div>
    );
  }

  // Générer les sièges occupés (déterministe)
  const occupiedSeats = generateOccupied(tripId, trip.capacity);

  const { seatsPerRow, rows, backRowSeats } = trip.busConfig;
  const totalSeats = trip.capacity;

  function toggleSeat(seatNum: number) {
    if (occupiedSeats.has(seatNum)) return;
    setSelectedSeats((prev) => {
      if (prev.includes(seatNum)) {
        return prev.filter((s) => s !== seatNum);
      }
      if (prev.length >= passengers) {
        // Remplacer le premier sélectionné
        return [...prev.slice(1), seatNum];
      }
      return [...prev, seatNum];
    });
  }

  function handleContinue() {
    if (selectedSeats.length < passengers) {
      alert(`Veuillez sélectionner ${passengers} siège(s).`);
      return;
    }
    const searchParams = new URLSearchParams({
      tripId,
      passengers: String(passengers),
      seats: selectedSeats.join(","),
    });
    router.push(`/passagers?${searchParams.toString()}`);
  }

  // Rendu du plan de bus
  function renderSeatMap() {
    const seatElements: React.ReactNode[] = [];
    let seatNum = 1;

    // Rangées normales
    for (let r = 0; r < rows - 1; r++) {
      const rowSeats: React.ReactNode[] = [];
      for (let c = 0; c < seatsPerRow; c++) {
        const currentSeat = seatNum++;
        const isOccupied = occupiedSeats.has(currentSeat);
        const isSelected = selectedSeats.includes(currentSeat);
        const isAisle = c === Math.floor(seatsPerRow / 2) - 1;

        rowSeats.push(
          <button
            key={currentSeat}
            onClick={() => toggleSeat(currentSeat)}
            disabled={isOccupied}
            className={`
              w-10 h-10 rounded-lg text-xs font-bold transition-all
              ${isOccupied ? "bg-gray-300 text-gray-500 cursor-not-allowed" : ""}
              ${isSelected ? "bg-accent-500 text-night ring-2 ring-night" : ""}
              ${!isOccupied && !isSelected ? "bg-night/10 text-night hover:bg-night/20 cursor-pointer" : ""}
              ${isAisle ? "mr-4" : ""}
            `}
            title={isOccupied ? "Occupé" : `Siège ${currentSeat}`}
          >
            {currentSeat}
          </button>
        );
      }
      seatElements.push(
        <div key={`row-${r}`} className="flex justify-center gap-1 mb-1">
          {rowSeats}
        </div>
      );
    }

    // Dernière rangée (fond du bus)
    const backSeats: React.ReactNode[] = [];
    for (let c = 0; c < backRowSeats; c++) {
      const currentSeat = seatNum++;
      const isOccupied = occupiedSeats.has(currentSeat);
      const isSelected = selectedSeats.includes(currentSeat);

      backSeats.push(
        <button
          key={currentSeat}
          onClick={() => toggleSeat(currentSeat)}
          disabled={isOccupied}
          className={`
            w-10 h-10 rounded-lg text-xs font-bold transition-all
            ${isOccupied ? "bg-gray-300 text-gray-500 cursor-not-allowed" : ""}
            ${isSelected ? "bg-accent-500 text-night ring-2 ring-night" : ""}
            ${!isOccupied && !isSelected ? "bg-night/10 text-night hover:bg-night/20 cursor-pointer" : ""}
          `}
          title={isOccupied ? "Occupé" : `Siège ${currentSeat}`}
        >
          {currentSeat}
        </button>
      );
    }
    seatElements.push(
      <div key="back-row" className="flex justify-center gap-1 mt-2 pt-2 border-t border-dashed">
        {backSeats}
      </div>
    );

    return seatElements;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link href="javascript:history.back()" className="text-night hover:text-accent-700 text-sm mb-4 inline-flex items-center gap-1">
        ← Retour aux résultats
      </Link>

      <h1 className="section-title mt-2 mb-2">Choisissez vos places</h1>
      <p className="text-gray-600 mb-6">
        {trip.fromName} → {trip.toName} • Départ {trip.departTime} • {trip.busType}
      </p>

      {/* Légende */}
      <div className="flex gap-4 mb-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-night/10 rounded" />
          <span className="text-gray-600">Libre</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-accent-500 rounded ring-2 ring-night" />
          <span className="text-gray-600">Votre choix</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gray-300 rounded" />
          <span className="text-gray-600">Occupé</span>
        </div>
      </div>

      {/* Plan du bus */}
      <div className="card mb-6">
        <div className="text-center text-xs text-gray-400 mb-4">
          🚌 Avant du bus
        </div>
        {renderSeatMap()}
        <div className="text-center text-xs text-gray-400 mt-4">
          Arrière du bus
        </div>
      </div>

      {/* Résumé */}
      <div className="card bg-night/5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">
              {selectedSeats.length}/{passengers} siège(s) sélectionné(s)
            </p>
            {selectedSeats.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Places : {selectedSeats.sort((a, b) => a - b).join(", ")}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-lg font-black text-accent-700">
              {formatXAF(trip.price * passengers)}
            </p>
            <button
              onClick={handleContinue}
              disabled={selectedSeats.length < passengers}
              className="btn-accent mt-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continuer →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Générateur déterministe de sièges occupés
function generateOccupied(tripId: string, capacity: number): Set<number> {
  let h = 2166136261;
  for (let i = 0; i < tripId.length; i++) {
    h ^= tripId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = h >>> 0;

  let s = h;
  function rand() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  }

  const count = Math.floor(rand() * (capacity * 0.4));
  const taken = new Set<number>();
  let guard = 0;
  while (taken.size < count && guard < capacity * 4) {
    taken.add(1 + Math.floor(rand() * capacity));
    guard++;
  }
  return taken;
}

export default function SiegePage() {
  return (
    <Suspense fallback={
      <div className="max-w-3xl mx-auto px-4 py-8 text-center">
        <div className="animate-pulse text-gray-400">Chargement du plan...</div>
      </div>
    }>
      <SeatContent />
    </Suspense>
  );
}
