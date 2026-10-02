"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCompany } from "@/lib/company";
import { formatXAF } from "@/lib/utils";
import { HoldTimer } from "@/components/HoldTimer";
import { seatIsPremium, type BusLayoutConfig } from "@/lib/seat-layout";
import { getHoldToken, loadDraft, clearDraft, type BookingDraft } from "@/lib/booking-session";

interface TripSummary {
  fromName: string;
  toName: string;
  departDate: string;
  departTime: string;
  price: number;
  premiumSupplement: number;
  bus: BusLayoutConfig & { name: string };
}

export default function PaiementPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<BookingDraft | null | undefined>(undefined);
  const [trip, setTrip] = useState<TripSummary | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [method, setMethod] = useState<"mtn" | "airtel">("mtn");
  const [transactionCode, setTransactionCode] = useState("");
  const [phoneSender, setPhoneSender] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const company = useCompany();

  useEffect(() => {
    const d = loadDraft();
    setDraft(d);
    if (!d || !d.passengers) return;
    setPhoneSender(d.passengers[0]?.phone || "");
    fetch(`/api/trips/${d.tripId}?from=${d.from}&to=${d.to}`)
      .then((r) => r.json())
      .then((json) => json.success && setTrip(json.trip));
    // Renouvelle le blocage des sièges (15 min) le temps du paiement
    fetch(`/api/trips/${d.tripId}/hold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seats: d.seats, token: getHoldToken() }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setExpiresAt(json.expiresAt);
        else setError(json.message || "Vos sièges ne sont plus disponibles. Revenez au plan du bus.");
      });
  }, []);

  if (draft === undefined) return <div className="text-center py-12 text-gray-400">Chargement...</div>;
  if (!draft || !draft.passengers) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <h1 className="section-title mb-4">Aucune réservation en cours</h1>
        <Link href="/" className="btn-primary">Retour à l&apos;accueil</Link>
      </div>
    );
  }

  // Montant indicatif ; le montant officiel est recalculé par le serveur à l'enregistrement
  const premiumCount = trip ? draft.seats.filter((s) => seatIsPremium(trip.bus, s)).length : 0;
  const amount = trip ? draft.seats.length * trip.price + premiumCount * trip.premiumSupplement : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft?.passengers) return;
    if (!transactionCode.trim() || !phoneSender.trim()) {
      setError("Veuillez remplir le code de transaction et le numéro d'envoi.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId: draft.tripId,
          from: draft.from,
          to: draft.to,
          fromTerminal: draft.fromTerminal,
          toTerminal: draft.toTerminal,
          token: getHoldToken(),
          passengers: draft.passengers.map((p, i) => ({ ...p, seat: draft.seats[i] })),
          customerPhone: draft.passengers[0]?.phone || phoneSender,
          customerEmail: customerEmail.trim() || null,
          method,
          transactionCode: transactionCode.trim(),
          phoneSender: phoneSender.trim(),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message || "Erreur lors de l'enregistrement.");
        setSubmitting(false);
        return;
      }

      sessionStorage.setItem(
        "nzoko_confirmation",
        JSON.stringify({
          reference: json.reference,
          accessKey: json.accessKey,
          totalPrice: json.totalPrice,
          seats: draft.seats,
          passengers: draft.passengers,
          trip: trip && { fromName: trip.fromName, toName: trip.toName, date: trip.departDate, departTime: trip.departTime, busName: trip.bus.name },
          payment: { method, transactionCode: transactionCode.trim(), status: "pending" },
        })
      );
      clearDraft();
      router.push("/confirmation");
    } catch (err) {
      console.error("Submit error:", err);
      setError("Une erreur est survenue. Veuillez réessayer.");
      setSubmitting(false);
    }
  }

  const mtnNumber = company.phone_mtn;
  const airtelNumber = company.phone_airtel;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <button onClick={() => router.back()} className="text-night hover:text-accent-700 text-sm mb-4 inline-flex items-center gap-1">
        ← Retour
      </button>

      <h1 className="section-title mt-2 mb-4">Paiement Mobile Money</h1>
      <div className="mb-6">
        <HoldTimer expiresAt={expiresAt} />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {/* Étapes */}
      <div className="card mb-6 bg-accent-50 border-accent-200">
        <h2 className="font-bold text-night mb-4">📲 Comment payer ?</h2>
        <ol className="space-y-3 text-sm text-gray-700">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-night text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
            <span>Choisissez votre opérateur (MTN ou Airtel) ci-dessous</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-night text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
            <span>
              Envoyez <strong className="text-accent-700">{formatXAF(amount)}</strong> au numéro indiqué
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-night text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
            <span>Vous recevrez un <strong>code de transaction</strong> par SMS</span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-night text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
            <span>Saisissez ce code ci-dessous et validez</span>
          </li>
        </ol>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Choix opérateur */}
        <div className="card">
          <h3 className="font-bold text-night mb-4">Opérateur de paiement</h3>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setMethod("mtn")}
              className={`p-4 rounded-lg border-2 text-center transition-all ${
                method === "mtn"
                  ? "border-yellow-400 bg-yellow-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="text-2xl mb-1">📱</div>
              <div className="font-bold text-sm">MTN MoMo</div>
              <div className="text-xs text-gray-500 mt-1">{mtnNumber}</div>
            </button>
            <button
              type="button"
              onClick={() => setMethod("airtel")}
              className={`p-4 rounded-lg border-2 text-center transition-all ${
                method === "airtel"
                  ? "border-red-400 bg-red-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="text-2xl mb-1">📱</div>
              <div className="font-bold text-sm">Airtel Money</div>
              <div className="text-xs text-gray-500 mt-1">{airtelNumber}</div>
            </button>
          </div>
        </div>

        {/* Montant à envoyer */}
        <div className="card bg-night text-white text-center">
          <p className="text-sm text-gray-300 mb-1">Montant à envoyer</p>
          <p className="text-3xl font-black text-accent-500">{formatXAF(amount)}</p>
          <p className="text-sm text-gray-300 mt-2">
            Au numéro : <strong>{(method === "mtn" ? mtnNumber : airtelNumber) || "numéro communiqué en agence"}</strong>
          </p>
        </div>

        {/* Formulaire de confirmation */}
        <div className="card">
          <h3 className="font-bold text-night mb-4">Confirmer le paiement</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Code de transaction (reçu par SMS) *
              </label>
              <input
                type="text"
                value={transactionCode}
                onChange={(e) => setTransactionCode(e.target.value)}
                className="input-field font-mono tracking-wider"
                placeholder="Ex: MP240625.1234.A56789"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Numéro qui a envoyé *
              </label>
              <input
                type="tel"
                value={phoneSender}
                onChange={(e) => setPhoneSender(e.target.value)}
                className="input-field"
                placeholder="06 XXX XX XX"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email (pour recevoir votre billet)
              </label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="input-field"
                placeholder="votre@email.com (optionnel)"
              />
            </div>
          </div>
        </div>

        <div className="text-center">
          <button
            type="submit"
            disabled={submitting}
            className="btn-accent text-lg px-10 disabled:opacity-50"
          >
            {submitting ? "Envoi en cours..." : "✅ Confirmer mon paiement"}
          </button>
        </div>
      </form>
    </div>
  );
}
