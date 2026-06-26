"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/lib/company";
import { formatXAF, generateReference } from "@/lib/utils";
import Link from "next/link";

interface BookingData {
  tripId: string;
  fromTerminal?: string;
  toTerminal?: string;
  trip: {
    from: string;
    to: string;
    fromName: string;
    toName: string;
    departTime: string;
    date: string;
    price: number;
    corridorLabel?: string;
  };
  passengers: { fullName: string; phone: string }[];
  seats: string[];
  totalPrice: number;
}

export default function PaiementPage() {
  const router = useRouter();
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [method, setMethod] = useState<"mtn" | "airtel">("mtn");
  const [transactionCode, setTransactionCode] = useState("");
  const [phoneSender, setPhoneSender] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const company = useCompany();

  useEffect(() => {
    const data = sessionStorage.getItem("nzoko_booking");
    if (data) {
      setBooking(JSON.parse(data));
    }
  }, []);

  if (!booking) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <h1 className="section-title mb-4">Aucune réservation en cours</h1>
        <Link href="/" className="btn-primary">Retour à l&apos;accueil</Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!transactionCode.trim() || !phoneSender.trim()) {
      alert("Veuillez remplir tous les champs.");
      return;
    }

    setSubmitting(true);
    setError("");

    const reference = generateReference();

    try {
      // ====== SAUVEGARDER DANS SUPABASE ======
      if (supabase) {
        // 1. Créer la réservation
        const { data: bookingRow, error: bookingError } = await supabase
          .from("bookings")
          .insert({
            reference,
            corridor_id: booking.tripId.split("|")[1] || null,
            from_city: booking.trip.from,
            to_city: booking.trip.to,
            from_terminal: booking.fromTerminal || null,
            to_terminal: booking.toTerminal || null,
            date: booking.trip.date,
            departure_time: booking.trip.departTime,
            total_price: booking.totalPrice,
            passenger_count: booking.passengers.length,
            status: "pending",
            customer_phone: booking.passengers[0]?.phone || phoneSender,
            customer_email: customerEmail || null,
          })
          .select()
          .single();

        if (bookingError) {
          console.error("Booking error:", bookingError);
          setError("Erreur lors de la réservation : " + bookingError.message);
          setSubmitting(false);
          return;
        }

        // 2. Ajouter les passagers
        if (bookingRow) {
          const passengersData = booking.passengers.map((p, i) => ({
            booking_id: bookingRow.id,
            full_name: p.fullName,
            phone: p.phone || null,
            seat_number: booking.seats[i] || null,
            is_primary: i === 0,
          }));

          const { error: passError } = await supabase
            .from("passengers")
            .insert(passengersData);

          if (passError) {
            console.error("Passengers error:", passError);
          }

          // 3. Créer le paiement
          const { error: payError } = await supabase
            .from("payments")
            .insert({
              booking_id: bookingRow.id,
              method,
              amount: booking.totalPrice,
              transaction_code: transactionCode.trim(),
              phone_sender: phoneSender.trim(),
              status: "pending",
            });

          if (payError) {
            console.error("Payment error:", payError);
          }
        }
      }

      // Stocker pour la page confirmation (affichage immédiat)
      const confirmationData = {
        reference,
        ...booking,
        payment: {
          method,
          transactionCode,
          phoneSender,
          status: "pending",
        },
      };

      sessionStorage.setItem("nzoko_confirmation", JSON.stringify(confirmationData));
      sessionStorage.removeItem("nzoko_booking");

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
      <Link href="javascript:history.back()" className="text-night hover:text-accent-700 text-sm mb-4 inline-flex items-center gap-1">
        ← Retour
      </Link>

      <h1 className="section-title mt-2 mb-6">Paiement Mobile Money</h1>

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
              Envoyez <strong className="text-accent-700">{formatXAF(booking.totalPrice)}</strong> au numéro indiqué
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
          <p className="text-3xl font-black text-accent-500">{formatXAF(booking.totalPrice)}</p>
          <p className="text-sm text-gray-300 mt-2">
            Au numéro : <strong>{method === "mtn" ? mtnNumber : airtelNumber}</strong>
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
