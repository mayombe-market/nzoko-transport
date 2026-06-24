"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, Suspense } from "react";
import { getTripById } from "@/lib/trips";
import { formatXAF } from "@/lib/utils";
import Link from "next/link";

interface PassengerInfo {
  fullName: string;
  phone: string;
}

function PassengersContent() {
  const params = useSearchParams();
  const router = useRouter();
  const tripId = params.get("tripId") || "";
  const passengers = Number(params.get("passengers") || "1");
  const seats = (params.get("seats") || "").split(",");

  const trip = getTripById(tripId);

  const [passengerList, setPassengerList] = useState<PassengerInfo[]>(
    Array.from({ length: passengers }, () => ({ fullName: "", phone: "" }))
  );

  if (!trip) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <h1 className="section-title mb-4">Trajet introuvable</h1>
        <Link href="/" className="btn-primary">Retour</Link>
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
    // Valider
    for (let i = 0; i < passengerList.length; i++) {
      if (!passengerList[i].fullName.trim()) {
        alert(`Veuillez entrer le nom du passager ${i + 1}.`);
        return;
      }
    }
    if (!passengerList[0].phone.trim()) {
      alert("Veuillez entrer le numéro de téléphone du passager principal.");
      return;
    }

    // Stocker temporairement dans sessionStorage
    const bookingData = {
      tripId,
      trip,
      passengers: passengerList,
      seats,
      totalPrice: trip.price * passengers,
    };
    sessionStorage.setItem("nzoko_booking", JSON.stringify(bookingData));
    router.push("/paiement");
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link href="javascript:history.back()" className="text-night hover:text-accent-700 text-sm mb-4 inline-flex items-center gap-1">
        ← Retour au plan du bus
      </Link>

      <h1 className="section-title mt-2 mb-2">Informations passagers</h1>
      <p className="text-gray-600 mb-6">
        {trip.fromName} → {trip.toName} • Places : {seats.join(", ")}
      </p>

      <form onSubmit={handleContinue} className="space-y-6">
        {passengerList.map((passenger, i) => (
          <div key={i} className="card">
            <h3 className="font-bold text-night mb-4">
              👤 Passager {i + 1} — Place {seats[i]}
              {i === 0 && <span className="text-xs text-accent-700 ml-2">(Principal)</span>}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom complet *
                </label>
                <input
                  type="text"
                  value={passenger.fullName}
                  onChange={(e) => updatePassenger(i, "fullName", e.target.value)}
                  className="input-field"
                  placeholder="Ex: Jean Makaya"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Téléphone {i === 0 ? "*" : "(optionnel)"}
                </label>
                <input
                  type="tel"
                  value={passenger.phone}
                  onChange={(e) => updatePassenger(i, "phone", e.target.value)}
                  className="input-field"
                  placeholder="06 XXX XX XX"
                  required={i === 0}
                />
              </div>
            </div>
          </div>
        ))}

        {/* Résumé */}
        <div className="card bg-night/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-night">{passengers} passager(s)</p>
              <p className="text-sm text-gray-600">{trip.fromName} → {trip.toName}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-accent-700">
                {formatXAF(trip.price * passengers)}
              </p>
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
    <Suspense fallback={
      <div className="max-w-3xl mx-auto px-4 py-8 text-center">
        <div className="animate-pulse text-gray-400">Chargement...</div>
      </div>
    }>
      <PassengersContent />
    </Suspense>
  );
}
