"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { formatXAF } from "@/lib/utils";
import { LOGO_ELEPHANT_SRC } from "@/components/Logo";
import { HoldTimer } from "@/components/HoldTimer";
import { buildLayout, seatIsPremium, type BusLayoutConfig, type LayoutSeat } from "@/lib/seat-layout";
import { getHoldToken, loadDraft, saveDraft } from "@/lib/booking-session";

interface TripDetail {
  tripId: string;
  corridorLabel: string;
  fromName: string;
  toName: string;
  departDate: string;
  departTime: string;
  arriveTime: string;
  price: number;
  premiumSupplement: number;
  bus: BusLayoutConfig & { name: string; type: string };
  taken: string[];
}

function SeatContent() {
  const params = useSearchParams();
  const router = useRouter();
  const tripId = params.get("tripId") || "";
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const passengers = Math.min(10, Math.max(1, Number(params.get("passengers") || "1")));
  const fromTerminal = params.get("fromTerminal") || "";
  const toTerminal = params.get("toTerminal") || "";

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const loadTrip = useCallback(async () => {
    const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}?from=${from}&to=${to}`);
    const json = await res.json().catch(() => null);
    if (!json?.success) {
      setLoadError(json?.message || "Départ introuvable.");
      return null;
    }
    setTrip(json.trip);
    return json.trip as TripDetail;
  }, [tripId, from, to]);

  // Chargement + reprise des sièges déjà bloqués par ce navigateur
  useEffect(() => {
    (async () => {
      const t = await loadTrip();
      const draft = loadDraft();
      if (t && draft?.tripId === tripId && draft.seats.length) {
        const res = await fetch(`/api/trips/${tripId}/hold`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seats: draft.seats, token: getHoldToken() }),
        });
        const json = await res.json().catch(() => null);
        if (json?.success) {
          setSelected(draft.seats.slice(0, passengers));
          setExpiresAt(json.expiresAt);
        }
        await loadTrip();
      }
    })();
  }, [loadTrip, tripId, passengers]);

  const layout = useMemo(() => (trip ? buildLayout(trip.bus) : []), [trip]);

  async function toggleSeat(seat: LayoutSeat) {
    if (!trip || busy) return;
    const token = getHoldToken();
    setMessage("");

    if (selected.includes(seat.label)) {
      setBusy(seat.label);
      await fetch(`/api/trips/${tripId}/hold`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seat: seat.label, token }),
      });
      setSelected((prev) => prev.filter((s) => s !== seat.label));
      setBusy(null);
      return;
    }

    if (selected.length >= passengers) {
      setMessage(`Vous avez déjà choisi ${passengers} siège${passengers > 1 ? "s" : ""}. Retirez-en un pour en choisir un autre.`);
      return;
    }

    setBusy(seat.label);
    const res = await fetch(`/api/trips/${tripId}/hold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seat: seat.label, token }),
    });
    const json = await res.json().catch(() => null);
    setBusy(null);
    if (json?.success) {
      setSelected((prev) => [...prev, seat.label]);
      setExpiresAt(json.expiresAt);
    } else {
      setMessage(json?.message || "Ce siège n'est plus disponible.");
      loadTrip();
    }
  }

  const handleExpire = useCallback(() => {
    setSelected([]);
    setExpiresAt(null);
    setMessage("Le délai de 15 minutes est dépassé : vos sièges ont été libérés. Choisissez à nouveau.");
    loadTrip();
  }, [loadTrip]);

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <h1 className="section-title mb-4">{loadError}</h1>
        <Link href="/" className="btn-primary">Retour à l&apos;accueil</Link>
      </div>
    );
  }
  if (!trip) {
    return <div className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-400 animate-pulse">Chargement du plan du bus…</div>;
  }

  const premiumCount = selected.filter((s) => seatIsPremium(trip.bus, s)).length;
  const estimatedTotal = selected.length * trip.price + premiumCount * trip.premiumSupplement;
  const takenByOthers = new Set(trip.taken.filter((s) => !selected.includes(s)));

  function handleContinue() {
    if (!trip || selected.length < passengers) return;
    const draft = loadDraft();
    saveDraft({
      tripId,
      from,
      to,
      fromTerminal: fromTerminal || undefined,
      toTerminal: toTerminal || undefined,
      seats: selected,
      holdExpiresAt: expiresAt,
      passengers: draft?.tripId === tripId ? draft.passengers : undefined,
    });
    router.push(`/passagers?${new URLSearchParams({ tripId, from, to, passengers: String(passengers) }).toString()}`);
  }

  const renderSeat = (seat: LayoutSeat) => {
    const isSelected = selected.includes(seat.label);
    const isTaken = takenByOthers.has(seat.label);
    return (
      <SeatButton
        key={seat.label}
        seat={seat.label}
        isOccupied={isTaken}
        isSelected={isSelected}
        isPremium={seat.premium}
        loading={busy === seat.label}
        onClick={() => toggleSeat(seat)}
      />
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <button onClick={() => router.back()} className="text-night hover:text-accent-700 text-sm mb-4 inline-flex items-center gap-1">
        ← Retour aux résultats
      </button>

      <h1 className="section-title mt-2 mb-2">Choisissez vos places</h1>
      <p className="text-gray-600 mb-4">
        {trip.fromName} → {trip.toName} •{" "}
        {new Date(trip.departDate + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}{" "}
        à {trip.departTime} • {trip.bus.name}
      </p>

      <div className="mb-4">
        <HoldTimer expiresAt={selected.length ? expiresAt : null} onExpire={handleExpire} />
      </div>

      {/* Légende */}
      <div className="flex gap-3 mb-6 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-anthracite rounded" />
          <span className="text-gray-600">Standard — {formatXAF(trip.price)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-anthracite rounded ring-2 ring-accent-500" />
          <span className="text-gray-600">Premium — {formatXAF(trip.price + trip.premiumSupplement)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-accent-500 rounded" />
          <span className="text-gray-600">Votre choix</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gray-300 rounded" />
          <span className="text-gray-600">Occupé</span>
        </div>
      </div>

      <div className="bg-accent-50 border border-accent-200 rounded-lg p-3 mb-6 text-sm text-accent-900">
        ⭐ <strong>Places Premium</strong> (+{formatXAF(trip.premiumSupplement)}) : fenêtres et première rangée derrière le chauffeur.
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</div>
      )}

      {/* Plan du bus (construit d'après la configuration réelle du bus) */}
      <div className="card mb-6 overflow-x-auto">
        <div className="text-center text-xs text-gray-400 mb-2">Avant du bus</div>
        <div className="flex justify-end mb-4 max-w-[360px] mx-auto">
          <div className="px-4 h-10 bg-night rounded-lg flex items-center justify-center gap-2">
            <span className="text-white text-xs font-bold">Chauffeur</span>
          </div>
        </div>

        <div className="max-w-[360px] mx-auto space-y-1">
          {layout.map((row) => (
            <div key={row.number} className="flex items-center gap-1 justify-center">
              <div className="w-6 text-right text-xs font-medium text-gray-400 pr-1">{row.number}</div>
              {row.isBackRow ? (
                <div className="flex gap-1">{row.left.map(renderSeat)}</div>
              ) : (
                <>
                  <div className="flex gap-1">{row.left.map(renderSeat)}</div>
                  <div className="w-6 flex items-center justify-center">
                    <div className="w-px h-6 bg-gray-200" />
                  </div>
                  <div className="flex gap-1">{row.right.map(renderSeat)}</div>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="text-center text-xs text-gray-400 mt-4">Arrière du bus</div>
      </div>

      {/* Résumé */}
      <div className="card bg-night/5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-600">
              {selected.length}/{passengers} siège(s) sélectionné(s)
            </p>
            <div className="mt-1">
              {selected.map((seat) => {
                const premium = seatIsPremium(trip.bus, seat);
                return (
                  <span key={seat} className={`inline-block text-xs mr-2 mb-1 px-2 py-0.5 rounded ${premium ? "bg-accent-100 text-accent-900" : "bg-primary-100 text-primary-800"}`}>
                    {seat} {premium ? "⭐" : ""} — {formatXAF(trip.price + (premium ? trip.premiumSupplement : 0))}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-black text-accent-700">{formatXAF(estimatedTotal || trip.price * passengers)}</p>
            <p className="text-[11px] text-gray-500">Prix officiel confirmé à l&apos;étape paiement</p>
            <button
              onClick={handleContinue}
              disabled={selected.length < passengers}
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

// Siège : anthracite comme les vrais sièges Nzoko, petit éléphant doré « brodé »,
// contour or = premium, or plein = siège choisi, gris clair = occupé
function SeatButton({ seat, isOccupied, isSelected, isPremium, loading, onClick }: {
  seat: string;
  isOccupied: boolean;
  isSelected: boolean;
  isPremium: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const state = isOccupied
    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
    : isSelected
      ? "bg-accent-500 text-night shadow-md"
      : `bg-anthracite text-white hover:bg-anthracite-light cursor-pointer ${isPremium ? "ring-2 ring-accent-500" : ""}`;

  return (
    <button
      onClick={onClick}
      disabled={isOccupied || loading}
      className={`w-11 h-10 rounded-t-lg rounded-b-md text-[11px] font-bold transition-all flex flex-col items-center justify-center leading-none ${state} ${loading ? "opacity-60" : ""}`}
      title={isOccupied ? "Occupé" : `Place ${seat}${isPremium ? " (Premium)" : ""}`}
    >
      {!isOccupied && (
        <img
          src={LOGO_ELEPHANT_SRC}
          alt=""
          aria-hidden="true"
          className={`w-3.5 h-3 object-contain mb-0.5 ${isSelected ? "brightness-0 opacity-60" : "opacity-90"}`}
        />
      )}
      {seat}
    </button>
  );
}

export default function SiegePage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-400">Chargement...</div>}>
      <SeatContent />
    </Suspense>
  );
}
