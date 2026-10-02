"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatXAF } from "@/lib/utils";
import { LogoIcon } from "@/components/Logo";

interface ConfirmationData {
  reference: string;
  accessKey: string;
  totalPrice: number;
  seats: string[];
  passengers: { fullName: string; phone: string }[];
  trip: { fromName: string; toName: string; date: string; departTime: string; busName: string } | null;
  payment: { method: string; transactionCode: string; status: string };
}

export default function ConfirmationPage() {
  const [data, setData] = useState<ConfirmationData | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("nzoko_confirmation");
      setData(stored ? JSON.parse(stored) : null);
    } catch {
      setData(null);
    }
  }, []);

  if (data === undefined) return <div className="text-center py-12 text-gray-400">Chargement...</div>;
  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <h1 className="section-title mb-4">Aucune réservation</h1>
        <Link href="/" className="btn-primary">Retour à l&apos;accueil</Link>
      </div>
    );
  }

  const ticketPath = `/billet/${encodeURIComponent(data.reference)}?k=${encodeURIComponent(data.accessKey)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${ticketPath}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="text-center mb-8">
        <div className="text-5xl mb-3">✅</div>
        <h1 className="font-display text-2xl font-semibold text-night mb-2">Réservation enregistrée</h1>
        <p className="text-gray-600">Votre paiement est en cours de vérification par un agent Nzoko.</p>
        <p className="text-gray-600 text-sm mt-1">
          Dès qu&apos;il est confirmé, votre billet avec son QR code sécurisé est disponible avec le lien ci-dessous.
        </p>
      </div>

      {/* Lien privé du billet */}
      <div className="card mb-6 border-2 border-accent-500 text-center">
        <p className="text-sm text-gray-600 mb-3">Gardez ce lien : c&apos;est l&apos;accès à votre billet.</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Link href={ticketPath} className="btn-accent inline-block">📄 Voir mon billet</Link>
          <button onClick={copyLink} className="btn-outline text-sm">{copied ? "Lien copié ✓" : "Copier le lien"}</button>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Vous pouvez aussi retrouver votre billet dans « Mes réservations » avec votre numéro de téléphone.
        </p>
      </div>

      {/* Récapitulatif */}
      <div className="card">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-dashed">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-night rounded-lg flex items-center justify-center">
              <LogoIcon className="w-7 h-7" />
            </div>
            <span className="font-bold text-night">Nzoko Transport</span>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Référence</p>
            <p className="font-mono font-bold text-night">{data.reference}</p>
          </div>
        </div>

        {data.trip && (
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
              <p className="font-medium">
                {new Date(data.trip.date + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Places</p>
              <p className="font-bold text-night">{data.seats.join(", ")}</p>
            </div>
          </div>
        )}

        <div className="border-t pt-4 mb-4">
          <p className="text-xs text-gray-500 mb-2">Passagers</p>
          {data.passengers.map((p, i) => (
            <p key={i} className="text-sm">
              {p.fullName} — Siège {data.seats[i]}
            </p>
          ))}
        </div>

        <div className="border-t pt-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Paiement {data.payment.method === "mtn" ? "MTN MoMo" : "Airtel Money"}</p>
            <p className="font-mono text-sm">{data.payment.transactionCode}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Montant</p>
            <p className="text-2xl font-black text-accent-700">{formatXAF(data.totalPrice)}</p>
          </div>
        </div>

        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center text-sm text-yellow-800">
          ⏳ En attente de confirmation par un agent
        </div>
      </div>

      <div className="flex gap-3 justify-center mt-6">
        <Link href="/" className="btn-outline">Retour à l&apos;accueil</Link>
        <Link href="/mes-reservations" className="btn-primary">Mes réservations</Link>
      </div>
    </div>
  );
}
