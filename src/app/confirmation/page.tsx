"use client";

import { useState, useEffect } from "react";
import { formatXAF } from "@/lib/utils";
import Link from "next/link";

interface ConfirmationData {
  reference: string;
  trip: {
    fromName: string;
    toName: string;
    departTime: string;
    date: string;
    price: number;
  };
  passengers: { fullName: string; phone: string }[];
  seats: number[];
  totalPrice: number;
  payment: {
    method: string;
    transactionCode: string;
    phoneSender: string;
    status: string;
  };
}

export default function ConfirmationPage() {
  const [data, setData] = useState<ConfirmationData | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("nzoko_confirmation");
    if (stored) {
      setData(JSON.parse(stored));
    }
  }, []);

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <h1 className="section-title mb-4">Aucune réservation</h1>
        <Link href="/" className="btn-primary">Retour à l&apos;accueil</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Succès */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-4xl">✅</span>
        </div>
        <h1 className="text-2xl font-black text-night mb-2">Réservation enregistrée !</h1>
        <p className="text-gray-600">
          Votre paiement est en cours de vérification par un agent.
        </p>
      </div>

      {/* Billet */}
      <div className="card border-2 border-accent-400">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-dashed">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center">
              <span className="text-night font-black">N</span>
            </div>
            <span className="font-bold text-night">Nzoko Transport</span>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Référence</p>
            <p className="font-mono font-bold text-night">{data.reference}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-500">Départ</p>
            <p className="font-bold text-night">{data.trip.fromName}</p>
            <p className="text-sm text-gray-600">{data.trip.departTime}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Arrivée</p>
            <p className="font-bold text-night">{data.trip.toName}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Date</p>
            <p className="text-sm font-medium">
              {new Date(data.trip.date + "T00:00:00").toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Places</p>
            <p className="text-sm font-medium">{data.seats.join(", ")}</p>
          </div>
        </div>

        {/* Passagers */}
        <div className="mb-4 pt-4 border-t">
          <p className="text-xs text-gray-500 mb-2">Passagers</p>
          {data.passengers.map((p, i) => (
            <p key={i} className="text-sm">
              {p.fullName} {p.phone && `(${p.phone})`} — Siège {data.seats[i]}
            </p>
          ))}
        </div>

        {/* Total */}
        <div className="flex items-center justify-between pt-4 border-t border-dashed">
          <div>
            <p className="text-xs text-gray-500">Paiement {data.payment.method.toUpperCase()}</p>
            <p className="text-xs text-gray-400 font-mono">{data.payment.transactionCode}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Total payé</p>
            <p className="text-2xl font-black text-accent-700">{formatXAF(data.totalPrice)}</p>
          </div>
        </div>

        {/* Statut */}
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
          <p className="text-sm font-semibold text-yellow-800">
            ⏳ En attente de confirmation par un agent
          </p>
          <p className="text-xs text-yellow-600 mt-1">
            Vous recevrez un SMS de confirmation une fois le paiement vérifié.
          </p>
        </div>
      </div>

      <div className="text-center mt-8 space-x-4">
        <Link href="/" className="btn-primary inline-block">
          Retour à l&apos;accueil
        </Link>
        <Link href="/mes-reservations" className="btn-outline inline-block">
          Mes réservations
        </Link>
      </div>
    </div>
  );
}
