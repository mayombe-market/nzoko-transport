"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { formatXAF } from "@/lib/utils";
import { HoldTimer } from "@/components/HoldTimer";
import { seatIsPremium, type BusLayoutConfig } from "@/lib/seat-layout";
import { loadDraft, saveDraft, type BookingDraft } from "@/lib/booking-session";
import { PhoneInput } from "@/components/PhoneInput";
import { isValidPhone } from "@/lib/phone";
import { BookingSteps } from "@/components/BookingSteps";

interface PassengerInfo {
  fullName: string;
  phone: string;
}

interface TripSummary {
  fromName: string;
  toName: string;
  departDate: string;
  departTime: string;
  price: number;
  premiumSupplement: number;
  bus: BusLayoutConfig & { name: string };
}

function PassengersContent() {
  const router = useRouter();
  const [draft, setDraft] = useState<BookingDraft | null | undefined>(undefined);
  const [trip, setTrip] = useState<TripSummary | null>(null);
  const [passengerList, setPassengerList] = useState<PassengerInfo[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const d = loadDraft();
    setDraft(d);
    if (!d) return;
    setPassengerList(d.seats.map((_, i) => d.passengers?.[i] ?? { fullName: "", phone: "" }));
    fetch(`/api/trips/${d.tripId}?from=${d.from}&to=${d.to}`)
      .then((r) => r.json())
      .then((json) => json.success && setTrip(json.trip));
  }, []);

  if (draft === undefined) return <div className="text-center py-12 text-gray-400">Chargement...</div>;
  if (!draft || draft.seats.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <h1 className="section-title mb-4">Aucune réservation en cours</h1>
        <Link href="/" className="btn-primary">Rechercher un trajet</Link>
      </div>
    );
  }

  function updatePassenger(index: number, field: keyof PassengerInfo, value: string) {
    setPassengerList((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (passengerList.some((p) => p.fullName.trim().length < 2)) {
      setError("Veuillez entrer le nom complet de chaque passager.");
      return;
    }
    if (!isValidPhone(passengerList[0].phone)) {
      setError("Veuillez entrer un numéro de téléphone valide pour le passager principal (+242 05 ou 06).");
      return;
    }
    if (passengerList.some((p) => p.phone && !isValidPhone(p.phone))) {
      setError("Un numéro de téléphone est invalide : corrigez-le ou laissez-le vide.");
      return;
    }
    saveDraft({ ...draft!, passengers: passengerList });
    router.push("/paiement");
  }

  const premiumCount = trip ? draft.seats.filter((s) => seatIsPremium(trip.bus, s)).length : 0;
  const estimated = trip ? draft.seats.length * trip.price + premiumCount * trip.premiumSupplement : null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <BookingSteps current="Passager" />
      <button onClick={() => router.back()} className="text-night hover:text-accent-700 text-sm mb-4 inline-flex items-center gap-1">
        ← Retour au plan du bus
      </button>

      <h1 className="section-title mt-2 mb-2">Informations passagers</h1>
      <p className="text-gray-600 mb-4">
        {trip ? `${trip.fromName} → ${trip.toName} • ${trip.departTime} • ` : ""}Places : {draft.seats.join(", ")}
      </p>
      <div className="mb-6">
        <HoldTimer expiresAt={draft.holdExpiresAt} />
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <form onSubmit={handleContinue} className="space-y-6">
        {passengerList.map((passenger, i) => (
          <div key={i} className="card">
            <h3 className="font-bold text-night mb-4">
              👤 Passager {i + 1} — Place {draft.seats[i]}
              {i === 0 && <span className="text-xs text-accent-700 ml-2">(Principal)</span>}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet *</label>
                <input
                  type="text"
                  value={passenger.fullName}
                  onChange={(e) => updatePassenger(i, "fullName", e.target.value)}
                  className="input-field"
                  placeholder="Ex: Jean Makaya"
                  required
                  maxLength={120}
                />
              </div>
              <PhoneInput
                label={i === 0 ? "Téléphone" : "Téléphone (optionnel)"}
                required={i === 0}
                value={passenger.phone}
                onChange={(v) => updatePassenger(i, "phone", v)}
              />
            </div>
          </div>
        ))}

        <div className="card bg-night/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-night">{draft.seats.length} passager(s)</p>
              {trip && <p className="text-sm text-gray-600">{trip.fromName} → {trip.toName}</p>}
            </div>
            <div className="text-right">
              {estimated !== null && <p className="text-2xl font-black text-accent-700">{formatXAF(estimated)}</p>}
            </div>
          </div>
        </div>

        <div className="text-center">
          <button type="submit" className="btn-accent text-lg px-10">
            Passer au paiement →
          </button>
        </div>
      </form>
    </div>
  );
}

export default function PassagersPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto px-4 py-8 text-center">
          <div className="animate-pulse text-gray-400">Chargement...</div>
        </div>
      }
    >
      <PassengersContent />
    </Suspense>
  );
}
