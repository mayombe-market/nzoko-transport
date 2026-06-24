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

// Supplément pour les places premium
const PREMIUM_SUPPLEMENT = 1000; // +1000 FCFA

// Générer le label d'un siège : ex "A1", "C15", "E20"
function seatLabel(col: string, row: number): string {
  return `${col}${row}`;
}

// Déterminer si une place est premium :
// - Rangée 1 derrière le chauffeur (C1, D1, E1)
// - Places fenêtres (colonne A = fenêtre gauche, colonne E = fenêtre droite)
function isPremiumSeat(col: string, row: number): boolean {
  // Fenêtres : A (tout le côté gauche) et E (tout le côté droit)
  if (col === "A" || col === "E") return true;
  // Rangée 1 côté chauffeur (C, D, E) — E déjà couvert au-dessus
  if (row === 1 && (col === "C" || col === "D")) return true;
  return false;
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

  // Calculer le prix total en tenant compte des places premium
  function calculateTotalPrice(): number {
    let total = 0;
    for (const seat of selectedSeats) {
      const col = seat.charAt(0);
      const row = parseInt(seat.slice(1));
      const premium = isPremiumSeat(col, row) ? PREMIUM_SUPPLEMENT : 0;
      total += trip.price + premium;
    }
    return total;
  }

  function handleContinue() {
    if (selectedSeats.length < passengers) {
      alert(`Veuillez sélectionner ${passengers} siège(s).`);
      return;
    }
    const totalPrice = calculateTotalPrice();
    const searchParams = new URLSearchParams({
      tripId,
      passengers: String(passengers),
      seats: selectedSeats.join(","),
      totalPrice: String(totalPrice),
    });
    router.push(`/passagers?${searchParams.toString()}`);
  }

  const totalPrice = calculateTotalPrice();

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
      <div className="flex gap-3 mb-6 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-primary-500 rounded" />
          <span className="text-gray-600">Standard — {formatXAF(trip.price)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gradient-to-br from-yellow-400 to-amber-500 rounded border border-amber-600" />
          <span className="text-gray-600">Premium — {formatXAF(trip.price + PREMIUM_SUPPLEMENT)}</span>
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

      {/* Info premium */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-sm text-amber-800">
        ⭐ <strong>Places Premium</strong> (+{formatXAF(PREMIUM_SUPPLEMENT)}) : fenêtres (colonnes A et E) et première rangée derrière le chauffeur.
      </div>

      {/* Plan du bus */}
      <div className="card mb-6 overflow-x-auto">
        <div className="text-center text-xs text-gray-400 mb-2">
          🚌 Avant du bus
        </div>

        {/* Position du chauffeur */}
        <div className="flex justify-center items-center gap-1 mb-4">
          <div className="w-8" />
          <div className="w-11" />
          <div className="w-11" />
          <div className="w-6" />
          <div className="w-[140px] h-10 bg-night rounded-lg flex items-center justify-center gap-2">
            <span className="text-lg">🚗</span>
            <span className="text-white text-xs font-bold">Chauffeur</span>
          </div>
        </div>

        {/* Indicateur fenêtres */}
        <div className="flex justify-center items-center gap-1 mb-1">
          <div className="w-8" />
          <div className="w-11 text-center text-[10px] text-amber-600 font-medium">fenêtre</div>
          <div className="w-11" />
          <div className="w-6" />
          <div className="w-11" />
          <div className="w-11" />
          <div className="w-11 text-center text-[10px] text-amber-600 font-medium">fenêtre</div>
        </div>

        {/* En-tête colonnes */}
        <div className="flex justify-center items-center gap-1 mb-3">
          <div className="w-8 h-6" />
          <div className="w-11 text-center text-xs font-bold text-amber-600">A</div>
          <div className="w-11 text-center text-xs font-bold text-night">B</div>
          <div className="w-6" />
          <div className="w-11 text-center text-xs font-bold text-night">C</div>
          <div className="w-11 text-center text-xs font-bold text-night">D</div>
          <div className="w-11 text-center text-xs font-bold text-amber-600">E</div>
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
                const isPremium = isPremiumSeat(col, rowNum);

                return (
                  <button
                    key={seat}
                    onClick={() => toggleSeat(seat)}
                    disabled={isOccupied}
                    className={`
                      w-11 h-9 rounded-md text-xs font-bold transition-all
                      ${isOccupied ? "bg-gray-300 text-gray-500 cursor-not-allowed" : ""}
                      ${isSelected ? "bg-accent-500 text-night ring-2 ring-night shadow-md" : ""}
                      ${!isOccupied && !isSelected && isPremium ? "bg-gradient-to-br from-yellow-400 to-amber-500 text-night border border-amber-600 hover:from-yellow-300 hover:to-amber-400 cursor-pointer" : ""}
                      ${!isOccupied && !isSelected && !isPremium ? "bg-primary-500 text-white hover:bg-primary-400 cursor-pointer" : ""}
                    `}
                    title={isOccupied ? "Occupé" : `Place ${seat}${isPremium ? " (Premium)": ""}`}
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
                const isPremium = isPremiumSeat(col, rowNum);

                return (
                  <button
                    key={seat}
                    onClick={() => toggleSeat(seat)}
                    disabled={isOccupied}
                    className={`
                      w-11 h-9 rounded-md text-xs font-bold transition-all
                      ${isOccupied ? "bg-gray-300 text-gray-500 cursor-not-allowed" : ""}
                      ${isSelected ? "bg-accent-500 text-night ring-2 ring-night shadow-md" : ""}
                      ${!isOccupied && !isSelected && isPremium ? "bg-gradient-to-br from-yellow-400 to-amber-500 text-night border border-amber-600 hover:from-yellow-300 hover:to-amber-400 cursor-pointer" : ""}
                      ${!isOccupied && !isSelected && !isPremium ? "bg-primary-500 text-white hover:bg-primary-400 cursor-pointer" : ""}
                    `}
                    title={isOccupied ? "Occupé" : `Place ${seat}${isPremium ? " (Premium)": ""}`}
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
              <div className="mt-1">
                {selectedSeats.map((seat) => {
                  const col = seat.charAt(0);
                  const row = parseInt(seat.slice(1));
                  const premium = isPremiumSeat(col, row);
                  return (
                    <span key={seat} className={`inline-block text-xs mr-2 px-2 py-0.5 rounded ${premium ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                      {seat} {premium ? "⭐" : ""} — {formatXAF(trip.price + (premium ? PREMIUM_SUPPLEMENT : 0))}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="text-lg font-black text-accent-700">
              {formatXAF(totalPrice || trip.price * passengers)}
            </p>
            {selectedSeats.length > 0 && selectedSeats.some(s => isPremiumSeat(s.charAt(0), parseInt(s.slice(1)))) && (
              <p className="text-xs text-amber-600">
                Inclut supplément premium
              </p>
            )}
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
