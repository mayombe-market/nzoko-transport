"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, Suspense } from "react";
import { getTripById } from "@/lib/trips";
import { formatXAF } from "@/lib/utils";
import Link from "next/link";

// Configuration du bus : 5 colonnes (A,B | allée | C,D,E), 20 rangées
const COLUMNS = ["A", "B", "C", "D", "E"];
const TOTAL_ROWS = 20;
const TOTAL_SEATS = COLUMNS.length * TOTAL_ROWS; // 100 places

// Générer le label d'un siège : ex "A1", "C15", "E20"
function seatLabel(col: string, row: number): string {
  return `${col}${row}`;
}

function SeatContent() {
  const params = useSearchParams();
  const router = useRouter();
  const tripId = params.get("tripId") || "";
  const passengers = Number(params.get("passengers") || "1");

  const trip = getTripById(tripId);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);

  if (!trip) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <h1 className="section-title mb-4">Trajet introuvable</h1>
        <Link href="/" className="btn-primary">Retour à l&apos;accueil</Link>
      </div>
    );
  }

  // Générer les sièges occupés (déterministe)
  const occupiedSeats = generateOccupied(tripId, TOTAL_SEATS);

  function toggleSeat(seat: string) {
    if (occupiedSeats.has(seat)) return;
    setSelectedSeats((prev) => {
      if (prev.includes(seat)) {
        return prev.filter((s) => s !== seat);
      }
      if (prev.length >= passengers) {
        return [...prev.slice(1), seat];
      }
      return [...prev, seat];
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
      <div className="flex gap-4 mb-6 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-primary-500 rounded" />
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
      <div className="card mb-6 overflow-x-auto">
        <div className="text-center text-xs text-gray-400 mb-2">
          🚌 Avant du bus
        </div>

        {/* Position du chauffeur */}
        <div className="flex justify-center items-center gap-1 mb-4">
          <div className="w-8" /> {/* Espace numéro rangée */}
          {/* Côté gauche : vide (pas de chauffeur ici) */}
          <div className="w-11" />
          <div className="w-11" />
          {/* Allée */}
          <div className="w-6" />
          {/* Côté droit : chauffeur */}
          <div className="w-[140px] h-10 bg-night rounded-lg flex items-center justify-center gap-2">
            <span className="text-lg">🚗</span>
            <span className="text-white text-xs font-bold">Chauffeur</span>
          </div>
        </div>

        {/* En-tête colonnes */}
        <div className="flex justify-center items-center gap-1 mb-3">
          <div className="w-8 h-6" /> {/* Espace numéro rangée */}
          {/* Côté gauche : A, B */}
          <div className="w-11 text-center text-xs font-bold text-night">A</div>
          <div className="w-11 text-center text-xs font-bold text-night">B</div>
          {/* Allée */}
          <div className="w-6" />
          {/* Côté droit : C, D, E */}
          <div className="w-11 text-center text-xs font-bold text-night">C</div>
          <div className="w-11 text-center text-xs font-bold text-night">D</div>
          <div className="w-11 text-center text-xs font-bold text-night">E</div>
        </div>

        {/* Rangées */}
        {Array.from({ length: TOTAL_ROWS }, (_, rowIdx) => {
          const rowNum = rowIdx + 1;

          return (
            <div key={rowNum} className="flex justify-center items-center gap-1 mb-1">
              {/* Numéro de rangée */}
              <div className="w-8 text-right text-xs font-medium text-gray-400 pr-1">
                {rowNum}
              </div>

              {/* Côté gauche : A, B (2 places) */}
              {["A", "B"].map((col) => {
                const seat = seatLabel(col, rowNum);
                const isOccupied = occupiedSeats.has(seat);
                const isSelected = selectedSeats.includes(seat);

                return (
                  <button
                    key={seat}
                    onClick={() => toggleSeat(seat)}
                    disabled={isOccupied}
                    className={`
                      w-11 h-9 rounded-md text-xs font-bold transition-all
                      ${isOccupied ? "bg-gray-300 text-gray-500 cursor-not-allowed" : ""}
                      ${isSelected ? "bg-accent-500 text-night ring-2 ring-night shadow-md" : ""}
                      ${!isOccupied && !isSelected ? "bg-primary-500 text-white hover:bg-primary-400 cursor-pointer" : ""}
                    `}
                    title={isOccupied ? "Occupé" : `Place ${seat}`}
                  >
                    {seat}
                  </button>
                );
              })}

              {/* Allée */}
              <div className="w-6 flex items-center justify-center">
                <div className="w-px h-6 bg-gray-200" />
              </div>

              {/* Côté droit : C, D, E (3 places) */}
              {["C", "D", "E"].map((col) => {
                const seat = seatLabel(col, rowNum);
                const isOccupied = occupiedSeats.has(seat);
                const isSelected = selectedSeats.includes(seat);

                return (
                  <button
                    key={seat}
                    onClick={() => toggleSeat(seat)}
                    disabled={isOccupied}
                    className={`
                      w-11 h-9 rounded-md text-xs font-bold transition-all
                      ${isOccupied ? "bg-gray-300 text-gray-500 cursor-not-allowed" : ""}
                      ${isSelected ? "bg-accent-500 text-night ring-2 ring-night shadow-md" : ""}
                      ${!isOccupied && !isSelected ? "bg-primary-500 text-white hover:bg-primary-400 cursor-pointer" : ""}
                    `}
                    title={isOccupied ? "Occupé" : `Place ${seat}`}
                  >
                    {seat}
                  </button>
                );
              })}
            </div>
          );
        })}

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
                Places : {selectedSeats.join(", ")}
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

// Générateur déterministe de sièges occupés (utilise les labels A1, B3, etc.)
function generateOccupied(tripId: string, totalSeats: number): Set<string> {
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

  const count = Math.floor(rand() * (totalSeats * 0.35)); // ~35% occupés
  const taken = new Set<string>();
  let guard = 0;
  while (taken.size < count && guard < totalSeats * 4) {
    const colIdx = Math.floor(rand() * COLUMNS.length);
    const rowNum = 1 + Math.floor(rand() * TOTAL_ROWS);
    taken.add(seatLabel(COLUMNS[colIdx], rowNum));
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
