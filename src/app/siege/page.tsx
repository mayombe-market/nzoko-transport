"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { formatXAF } from "@/lib/utils";
import { useNetwork } from "@/lib/network";
import { LOGO_ELEPHANT_SRC } from "@/components/Logo";
import { HoldTimer } from "@/components/HoldTimer";
import { BookingSteps } from "@/components/BookingSteps";
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
  booked?: string[];
  held?: string[];
  status?: string;
}

type SeatState = "available" | "selected" | "booked" | "held";

function SeatContent() {
  const params = useSearchParams();
  const router = useRouter();
  const tripId = params.get("tripId") || "";
  const from = params.get("from") || "";
  const to = params.get("to") || "";
  const passengers = Math.min(10, Math.max(1, Number(params.get("passengers") || "1")));
  const fromTerminal = params.get("fromTerminal") || "";
  const toTerminal = params.get("toTerminal") || "";

  const { terminalLabel } = useNetwork();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [justPicked, setJustPicked] = useState<string | null>(null);

  const loadTrip = useCallback(async () => {
    const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}?from=${from}&to=${to}`);
    const json = await res.json().catch(() => null);
    if (!json?.success) {
      setLoadError(json?.message || "Départ introuvable.");
      return null;
    }
    if (json.trip.status === "cancelled") {
      setLoadError("Ce départ est annulé. Choisissez un autre départ.");
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

  // Sélection immédiate à l'écran ; le serveur confirme le blocage juste derrière
  async function toggleSeat(seat: LayoutSeat) {
    if (!trip || pending.includes(seat.label)) return;
    const token = getHoldToken();
    setMessage("");

    if (selected.includes(seat.label)) {
      setSelected((prev) => prev.filter((s) => s !== seat.label));
      fetch(`/api/trips/${tripId}/hold`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seat: seat.label, token }),
      });
      return;
    }

    // Un seul voyageur : choisir un autre siège remplace le précédent
    let replaced: string | null = null;
    if (selected.length >= passengers) {
      if (passengers === 1) {
        replaced = selected[0];
      } else {
        setMessage(`Vous avez déjà choisi ${passengers} sièges. Touchez un siège choisi pour le retirer.`);
        return;
      }
    }

    setSelected((prev) => [...prev.filter((s) => s !== replaced), seat.label]);
    setPending((prev) => [...prev, seat.label]);
    setJustPicked(seat.label);
    if (replaced) {
      fetch(`/api/trips/${tripId}/hold`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seat: replaced, token }),
      });
    }

    const res = await fetch(`/api/trips/${tripId}/hold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seat: seat.label, token }),
    });
    const json = await res.json().catch(() => null);
    setPending((prev) => prev.filter((s) => s !== seat.label));
    if (json?.success) {
      setExpiresAt(json.expiresAt);
    } else {
      setSelected((prev) => prev.filter((s) => s !== seat.label));
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

  const booked = new Set((trip.booked ?? trip.taken).filter((s) => !selected.includes(s)));
  const held = new Set((trip.held ?? []).filter((s) => !selected.includes(s) && !booked.has(s)));
  const seatPrice = (s: string) => trip.price + (seatIsPremium(trip.bus, s) ? trip.premiumSupplement : 0);
  const total = selected.reduce((sum, s) => sum + seatPrice(s), 0);
  const ready = selected.length === passengers && pending.length === 0;
  const fromLabel = `${trip.fromName}${fromTerminal ? ` — ${terminalLabel(fromTerminal)}` : ""}`;
  const toLabel = `${trip.toName}${toTerminal ? ` — ${terminalLabel(toTerminal)}` : ""}`;
  const dateLabel = new Date(trip.departDate + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  function handleContinue() {
    if (!ready) return;
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

  const stateOf = (label: string): SeatState =>
    selected.includes(label) ? "selected" : booked.has(label) ? "booked" : held.has(label) ? "held" : "available";

  const renderSeat = (seat: LayoutSeat) => (
    <SeatButton
      key={seat.label}
      seat={seat.label}
      state={stateOf(seat.label)}
      isPremium={seat.premium}
      pending={pending.includes(seat.label)}
      pop={justPicked === seat.label}
      onClick={() => toggleSeat(seat)}
    />
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-32 md:pb-8">
      <BookingSteps current="Siège" />

      <button onClick={() => router.back()} className="text-night hover:text-accent-700 text-sm mb-3 inline-flex items-center gap-1">
        ← Retour aux résultats
      </button>

      <h1 className="section-title mb-1">Choisissez {passengers > 1 ? `vos ${passengers} places` : "votre place"}</h1>
      <p className="text-gray-600 mb-4 text-sm sm:text-base">
        {trip.fromName} → {trip.toName} • {dateLabel} à {trip.departTime} • {trip.bus.name}
      </p>

      {selected.length > 0 && (
        <div className="mb-4">
          <HoldTimer expiresAt={expiresAt} onExpire={handleExpire} />
        </div>
      )}

      {/* Légende : 5 états bien distincts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mb-4 text-xs sm:text-sm">
        <Legend swatch={<span className="w-6 h-6 rounded-md bg-anthracite" />} label={`Disponible — ${formatXAF(trip.price)}`} />
        <Legend swatch={<span className="w-6 h-6 rounded-md bg-anthracite ring-2 ring-accent-500" />} label={`Premium — ${formatXAF(trip.price + trip.premiumSupplement)}`} />
        <Legend
          swatch={
            <span className="relative w-6 h-6 rounded-md bg-accent-500 ring-2 ring-night">
              <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-night text-white text-[8px] flex items-center justify-center">✓</span>
            </span>
          }
          label="Votre choix"
        />
        <Legend swatch={<span className="w-6 h-6 rounded-md bg-gray-300 text-gray-500 text-[10px] flex items-center justify-center">✕</span>} label="Occupé" />
        <Legend swatch={<span className="w-6 h-6 rounded-md seat-held border border-gray-300 text-[10px] flex items-center justify-center">⏳</span>} label="En cours de réservation" />
      </div>

      {message && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 animate-fade-up">{message}</div>}

      {/* Plan du bus (configuration réelle du bus) */}
      <div className="card mb-4 overflow-x-auto px-3 sm:px-6">
        <div className="text-center text-xs text-gray-400 mb-2">Avant du bus</div>
        <div className="flex justify-end mb-4 max-w-[340px] mx-auto">
          <div className="px-4 h-9 bg-night rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">Chauffeur</span>
          </div>
        </div>
        <div className="max-w-[340px] mx-auto space-y-1.5">
          {layout.map((row) => (
            <div key={row.number} className="flex items-center gap-1.5 justify-center">
              <div className="w-5 text-right text-[11px] font-medium text-gray-400 pr-0.5">{row.number}</div>
              {row.isBackRow ? (
                <div className="flex gap-1.5">{row.left.map(renderSeat)}</div>
              ) : (
                <>
                  <div className="flex gap-1.5">{row.left.map(renderSeat)}</div>
                  <div className="w-5" />
                  <div className="flex gap-1.5">{row.right.map(renderSeat)}</div>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="text-center text-xs text-gray-400 mt-4">Arrière du bus</div>
      </div>

      {/* Confirmation immédiate des sièges choisis */}
      {selected.length > 0 && (
        <div className="mb-4 rounded-xl border-2 border-green-300 bg-green-50 p-3 animate-fade-up" aria-live="polite">
          <p className="font-bold text-green-800 text-sm mb-2">
            ✓ {selected.length > 1 ? `${selected.length} places sélectionnées` : "Place sélectionnée"}
            {selected.length < passengers && <span className="font-normal text-green-700"> — encore {passengers - selected.length} à choisir</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            {selected.map((s) => (
              <span key={s} className="inline-flex items-center gap-2 rounded-lg bg-white border border-green-200 px-3 py-1.5 text-sm">
                <span className="font-bold text-night">Siège {s}</span>
                {seatIsPremium(trip.bus, s) && <span className="text-[10px] font-semibold text-accent-800 bg-accent-100 rounded px-1">Premium</span>}
                <span className="text-accent-700 font-semibold">{formatXAF(seatPrice(s))}</span>
                {pending.includes(s) && <span className="text-[10px] text-gray-400">réservation…</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Récapitulatif complet */}
      <div className="card border-2 border-night/10">
        <h2 className="font-bold text-night mb-3">Votre sélection</h2>
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-gray-500">Voyage</dt>
          <dd className="font-semibold text-night">
            {fromLabel}
            <br />→ {toLabel}
          </dd>
          <dt className="text-gray-500">Départ</dt>
          <dd className="font-semibold text-night">{dateLabel} à {trip.departTime}</dd>
          <dt className="text-gray-500">{passengers > 1 ? "Sièges" : "Siège"}</dt>
          <dd className="font-semibold text-night">{selected.length ? selected.join(", ") : <span className="text-gray-400 font-normal">Aucun siège choisi</span>}</dd>
          <dt className="text-gray-500">Tarif</dt>
          <dd className="text-night">
            {selected.length
              ? selected.map((s) => `${s} : ${formatXAF(seatPrice(s))}`).join(" · ")
              : `${formatXAF(trip.price)} par place`}
          </dd>
          <dt className="text-gray-500 font-semibold pt-2 border-t">Total</dt>
          <dd className="text-xl font-black text-accent-700 pt-2 border-t">{formatXAF(total)}</dd>
        </dl>
        <p className="text-[11px] text-gray-500 mt-2">Montant officiel recalculé par Nzoko à l&apos;étape paiement.</p>
        <button onClick={handleContinue} disabled={!ready} className="btn-accent w-full mt-4 hidden md:block disabled:opacity-50 disabled:cursor-not-allowed">
          {ready ? "Continuer →" : `Choisissez ${passengers - selected.length > 1 ? `${passengers - selected.length} sièges` : "un siège"}`}
        </button>
      </div>

      {/* Mobile : résumé + bouton toujours visibles en bas de l'écran */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 truncate">
              {selected.length ? `Siège${selected.length > 1 ? "s" : ""} ${selected.join(", ")}` : `Choisissez ${passengers > 1 ? `${passengers} sièges` : "un siège"}`}
            </p>
            <p className="text-lg font-black text-accent-700 leading-tight">{formatXAF(total)}</p>
          </div>
          <button onClick={handleContinue} disabled={!ready} className="btn-accent px-5 py-3 disabled:opacity-50 disabled:cursor-not-allowed">
            Continuer →
          </button>
        </div>
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 flex">{swatch}</span>
      <span className="text-gray-600">{label}</span>
    </div>
  );
}

// Siège : anthracite comme les vrais sièges Nzoko (éléphant doré « brodé »),
// contour or = premium, or + ✓ = votre choix, gris ✕ = occupé, hachuré ⏳ = en cours de réservation
function SeatButton({ seat, state, isPremium, pending, pop, onClick }: {
  seat: string;
  state: SeatState;
  isPremium: boolean;
  pending: boolean;
  pop: boolean;
  onClick: () => void;
}) {
  const base = "relative w-11 h-11 sm:w-12 sm:h-12 rounded-t-xl rounded-b-md text-[11px] font-bold transition-all duration-150 flex flex-col items-center justify-center leading-none select-none touch-manipulation";
  const cls =
    state === "selected"
      ? `bg-accent-500 text-night ring-2 ring-night shadow-lg z-10 ${pop ? "animate-seat-pop" : "scale-[1.06]"}`
      : state === "booked"
        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
        : state === "held"
          ? "seat-held text-gray-500 border border-gray-300 cursor-not-allowed"
          : `bg-anthracite text-white hover:bg-anthracite-light active:scale-95 cursor-pointer ${isPremium ? "ring-2 ring-accent-500" : ""}`;

  return (
    <button
      onClick={onClick}
      disabled={state === "booked" || state === "held"}
      className={`${base} ${cls}`}
      aria-pressed={state === "selected"}
      aria-label={`Place ${seat}${isPremium ? " premium" : ""} — ${
        state === "selected" ? "sélectionnée" : state === "booked" ? "occupée" : state === "held" ? "en cours de réservation" : "disponible"
      }`}
    >
      {state === "selected" && (
        <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-night text-white text-[11px] flex items-center justify-center shadow animate-check-in">
          {pending ? "…" : "✓"}
        </span>
      )}
      {state === "booked" ? (
        <span className="text-xs mb-0.5">✕</span>
      ) : state === "held" ? (
        <span className="text-[10px] mb-0.5">⏳</span>
      ) : (
        <img
          src={LOGO_ELEPHANT_SRC}
          alt=""
          aria-hidden="true"
          className={`w-3.5 h-3 object-contain mb-0.5 ${state === "selected" ? "brightness-0 opacity-70" : "opacity-90"}`}
        />
      )}
      {seat}
      {isPremium && state === "available" && <span className="absolute top-0.5 left-1 text-[8px] text-accent-500">★</span>}
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
