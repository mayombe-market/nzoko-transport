"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

// Les terminus par ville
const TERMINALS: Record<string, { name: string; city: string }> = {
  "chateau-deau": { name: "Château d'eau", city: "Brazzaville" },
  "mpila": { name: "Mpila", city: "Brazzaville" },
  "mafouta": { name: "Mafouta", city: "Brazzaville" },
  "centre-ville": { name: "Centre-ville", city: "Pointe-Noire" },
  "nkouikou": { name: "Nkouikou", city: "Pointe-Noire" },
  "ngoyo": { name: "Ngoyo", city: "Pointe-Noire" },
};

// Noms des villes
const CITY_NAMES: Record<string, string> = {
  brazzaville: "Brazzaville",
  pointenoire: "Pointe-Noire",
  dolisie: "Dolisie",
  nkayi: "Nkayi",
  oyo: "Oyo",
  ouesso: "Ouesso",
  djambala: "Djambala",
  sibiti: "Sibiti",
  kinkala: "Kinkala",
  mindouli: "Mindouli",
  madingou: "Madingou",
  loudima: "Loudima",
  gamboma: "Gamboma",
  owando: "Owando",
  makoua: "Makoua",
};

interface Booking {
  id: string;
  reference: string;
  from_city: string;
  to_city: string;
  from_terminal: string;
  date: string;
  departure_time: string;
  total_price: number;
  passenger_count: number;
  status: string;
  customer_phone: string | null;
  created_at: string;
  passengers?: { full_name: string; seat_number: string; is_primary: boolean }[];
}

export default function TerminalDashboard() {
  const params = useParams();
  const terminalId = params.terminalId as string;
  const terminal = TERMINALS[terminalId];

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);
  const [confirmMessage, setConfirmMessage] = useState("");

  useEffect(() => {
    loadBookings();
  }, [terminalId, filterDate]);

  async function loadBookings() {
    if (!supabase || !terminalId) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("bookings")
      .select("*, passengers(*)")
      .eq("from_terminal", terminalId)
      .eq("date", filterDate)
      .order("departure_time", { ascending: true });

    if (data) {
      setBookings(data as Booking[]);
    }
    setLoading(false);
  }

  async function confirmBooking(bookingId: string) {
    if (!supabase) return;

    // 1. Confirmer la réservation
    setConfirmMessage("⏳ Confirmation en cours...");
    await supabase
      .from("bookings")
      .update({ status: "confirmed" })
      .eq("id", bookingId);

    // 2. Récupérer les infos complètes pour l'email
    const { data: bookingData } = await supabase
      .from("bookings")
      .select("*, passengers(*)")
      .eq("id", bookingId)
      .single();

    // 3. Envoyer le billet par email si le client a un email
    if (bookingData && bookingData.customer_email) {
      const primaryPassenger = bookingData.passengers?.find((p: any) => p.is_primary) || bookingData.passengers?.[0];
      const seats = bookingData.passengers?.map((p: any) => p.seat_number).filter(Boolean).join(", ") || "N/A";

      const fromCityName = CITY_NAMES[bookingData.from_city] || bookingData.from_city;
      const toCityName = CITY_NAMES[bookingData.to_city] || bookingData.to_city;

      try {
        await fetch("/api/send-ticket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            booking: {
              reference: bookingData.reference,
              email: bookingData.customer_email,
              passengerName: primaryPassenger?.full_name || "Passager",
              from: fromCityName,
              to: toCityName,
              date: bookingData.date,
              departureTime: bookingData.departure_time,
              seats,
              totalPrice: bookingData.total_price,
            },
          }),
        });
        setConfirmMessage(`✅ Réservation confirmée ! Email envoyé à ${bookingData.customer_email}`);
      } catch (err) {
        console.error("Email send error:", err);
        setConfirmMessage("✅ Réservation confirmée ! (email non envoyé)");
      }
    } else {
      setConfirmMessage("✅ Réservation confirmée !");
    }

    // Masquer le message après 5 secondes
    setTimeout(() => setConfirmMessage(""), 5000);

    loadBookings();
  }

  async function cancelBooking(bookingId: string) {
    if (!confirm("Annuler cette réservation ?")) return;
    if (!supabase) return;
    await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", bookingId);
    loadBookings();
  }

  if (!terminal) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <h1 className="section-title mb-4">Terminus introuvable</h1>
        <Link href="/admin" className="btn-primary">Retour</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/admin" className="text-night hover:text-accent-700 text-sm mb-2 inline-flex items-center gap-1">
            ← Tous les sites
          </Link>
          <h1 className="section-title">📍 {terminal.name}</h1>
          <p className="text-gray-600 text-sm">{terminal.city} — Réservations des départs</p>
        </div>
        <Link
          href="/admin/scanner"
          className="btn-accent text-sm px-4 py-2"
        >
          📷 Scanner
        </Link>
      </div>

      {/* Filtre date */}
      <div className="card mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-sm font-medium text-night">📅 Date :</label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="input-field w-auto"
          />
          <span className="text-sm text-gray-500">
            {bookings.length} réservation(s) pour cette date
          </span>
        </div>
      </div>

      {/* Stats rapides */}
      {confirmMessage && (
        <div className={`mb-6 p-3 rounded-lg text-sm font-medium ${
          confirmMessage.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" :
          confirmMessage.startsWith("⏳") ? "bg-blue-50 text-blue-700 border border-blue-200" :
          "bg-gray-50 text-gray-700 border border-gray-200"
        }`}>
          {confirmMessage}
        </div>
      )}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-2xl font-black text-night">{bookings.length}</p>
          <p className="text-xs text-gray-500">Réservations</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-black text-green-600">
            {bookings.filter(b => b.status === "confirmed").length}
          </p>
          <p className="text-xs text-gray-500">Confirmées</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-black text-yellow-600">
            {bookings.filter(b => b.status === "pending").length}
          </p>
          <p className="text-xs text-gray-500">En attente</p>
        </div>
      </div>

      {/* Liste des réservations */}
      <div className="card">
        <h2 className="font-bold text-night mb-4">
          Passagers — Départs depuis {terminal.name}
        </h2>

        {loading ? (
          <div className="text-center py-8 text-gray-400">Chargement...</div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <div className="text-4xl mb-2">🎫</div>
            <p>Aucune réservation pour le {filterDate} depuis {terminal.name}.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((booking) => {
              const primaryPassenger = booking.passengers?.find(p => p.is_primary) || booking.passengers?.[0];

              return (
                <div
                  key={booking.id}
                  className={`p-4 rounded-lg border ${
                    booking.status === "confirmed" ? "border-green-200 bg-green-50" :
                    booking.status === "pending" ? "border-yellow-200 bg-yellow-50" :
                    booking.status === "cancelled" ? "border-red-200 bg-red-50 opacity-60" :
                    "border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <p className="font-bold text-night">
                          {primaryPassenger?.full_name || "Passager inconnu"}
                        </p>
                        <span className={`px-2 py-0.5 text-xs rounded-full font-semibold ${
                          booking.status === "confirmed" ? "bg-green-100 text-green-700" :
                          booking.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {booking.status === "confirmed" ? "✅ Confirmé" :
                           booking.status === "pending" ? "⏳ En attente" :
                           "❌ Annulé"}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                        <span>🕐 {booking.departure_time}</span>
                        <span>→ {CITY_NAMES[booking.to_city] || booking.to_city}</span>
                        <span>💺 {primaryPassenger?.seat_number || "?"}</span>
                        <span className="font-semibold text-accent-700">
                          {new Intl.NumberFormat("fr-FR").format(booking.total_price)} FCFA
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                        <span>Réf: {booking.reference}</span>
                        {booking.customer_phone && <span>📞 {booking.customer_phone}</span>}
                        <span>{booking.passenger_count} passager(s)</span>
                      </div>
                    </div>

                    {/* Actions */}
                    {booking.status === "pending" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => confirmBooking(booking.id)}
                          className="px-3 py-2 text-sm rounded-lg bg-green-500 text-white font-semibold hover:bg-green-600"
                        >
                          ✅ Confirmer
                        </button>
                        <button
                          onClick={() => cancelBooking(booking.id)}
                          className="px-3 py-2 text-sm rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
                        >
                          ❌
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
