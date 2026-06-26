"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { formatXAF } from "@/lib/utils";
import Link from "next/link";

interface BookingWithPassengers {
  id: string;
  reference: string;
  from_city: string;
  to_city: string;
  from_terminal: string | null;
  date: string;
  departure_time: string;
  total_price: number;
  passenger_count: number;
  status: string;
  created_at: string;
  passengers?: { full_name: string; seat_number: string; is_primary: boolean }[];
}

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

const TERMINAL_NAMES: Record<string, string> = {
  "chateau-deau": "Château d'eau",
  "mpila": "Mpila",
  "mafouta": "Mafouta",
  "centre-ville": "Centre-ville",
  "nkouikou": "Nkouikou",
  "ngoyo": "Ngoyo",
};

export default function MesReservationsPage() {
  const [searchMode, setSearchMode] = useState<"phone" | "reference">("phone");
  const [searchValue, setSearchValue] = useState("");
  const [bookings, setBookings] = useState<BookingWithPassengers[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [userBookings, setUserBookings] = useState<BookingWithPassengers[]>([]);

  // Si l'utilisateur est connecté, charger ses réservations automatiquement
  useEffect(() => {
    loadUserBookings();
  }, []);

  async function loadUserBookings() {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { data } = await supabase
      .from("bookings")
      .select("*, passengers(*)")
      .eq("customer_email", session.user.email)
      .order("created_at", { ascending: false })
      .limit(20);

    if (data) {
      setUserBookings(data as BookingWithPassengers[]);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !searchValue.trim()) return;

    setLoading(true);
    setSearched(true);
    setBookings([]);

    if (searchMode === "reference") {
      // Recherche par référence exacte
      const { data } = await supabase
        .from("bookings")
        .select("*, passengers(*)")
        .eq("reference", searchValue.trim().toUpperCase());

      if (data) setBookings(data as BookingWithPassengers[]);
    } else {
      // Recherche par téléphone
      const { data } = await supabase
        .from("bookings")
        .select("*, passengers(*)")
        .eq("customer_phone", searchValue.trim())
        .order("created_at", { ascending: false })
        .limit(20);

      if (data) setBookings(data as BookingWithPassengers[]);
    }

    setLoading(false);
  }

  function renderBookingCard(booking: BookingWithPassengers) {
    const primaryPassenger = booking.passengers?.find(p => p.is_primary) || booking.passengers?.[0];
    const seats = booking.passengers?.map(p => p.seat_number).filter(Boolean).join(", ") || "—";
    const fromName = CITY_NAMES[booking.from_city] || booking.from_city;
    const toName = CITY_NAMES[booking.to_city] || booking.to_city;
    const terminalName = booking.from_terminal ? TERMINAL_NAMES[booking.from_terminal] || booking.from_terminal : null;

    const isPast = new Date(booking.date) < new Date(new Date().toISOString().split("T")[0]);

    return (
      <div key={booking.id} className={`card border-l-4 ${
        booking.status === "confirmed" ? "border-l-green-500" :
        booking.status === "pending" ? "border-l-yellow-500" :
        booking.status === "cancelled" ? "border-l-red-500" :
        "border-l-gray-300"
      } ${isPast ? "opacity-70" : ""}`}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {/* Référence + statut */}
            <div className="flex items-center gap-3 mb-2">
              <span className="font-mono font-bold text-night">{booking.reference}</span>
              <span className={`px-2 py-0.5 text-xs rounded-full font-semibold ${
                booking.status === "confirmed" ? "bg-green-100 text-green-700" :
                booking.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                booking.status === "cancelled" ? "bg-red-100 text-red-700" :
                "bg-gray-100 text-gray-600"
              }`}>
                {booking.status === "confirmed" ? "✅ Confirmé" :
                 booking.status === "pending" ? "⏳ En attente" :
                 booking.status === "cancelled" ? "❌ Annulé" :
                 booking.status}
              </span>
              {isPast && <span className="text-xs text-gray-400">Passé</span>}
            </div>

            {/* Trajet */}
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-night text-lg">{fromName}</span>
              <span className="text-gray-400">→</span>
              <span className="font-bold text-night text-lg">{toName}</span>
            </div>

            {/* Détails */}
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 mt-2">
              <span>📅 {new Date(booking.date + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</span>
              <span>🕐 {booking.departure_time}</span>
              <span>💺 {seats}</span>
              <span className="font-semibold text-accent-700">{formatXAF(booking.total_price)}</span>
            </div>

            {terminalName && (
              <p className="text-xs text-gray-500 mt-1">📍 Départ depuis : {terminalName}</p>
            )}

            {primaryPassenger && (
              <p className="text-xs text-gray-500 mt-1">
                👤 {primaryPassenger.full_name}
                {booking.passenger_count > 1 && ` (+${booking.passenger_count - 1} passager${booking.passenger_count > 2 ? "s" : ""})`}
              </p>
            )}
          </div>

          {/* Action : voir billet */}
          {booking.status === "confirmed" && (
            <Link
              href={`/billet/${booking.reference}`}
              className="btn-accent text-xs px-3 py-2 flex-shrink-0"
            >
              🎫 Billet
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="section-title mb-6">Mes réservations</h1>

      {/* Recherche */}
      <div className="card mb-6">
        <h2 className="font-bold text-night mb-4">🔍 Rechercher une réservation</h2>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setSearchMode("phone")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              searchMode === "phone" ? "bg-night text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            Par téléphone
          </button>
          <button
            onClick={() => setSearchMode("reference")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              searchMode === "reference" ? "bg-night text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            Par référence
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex gap-3">
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className={`input-field flex-1 ${searchMode === "reference" ? "font-mono uppercase tracking-wider" : ""}`}
            placeholder={searchMode === "phone" ? "06 XXX XX XX" : "NZK-260624-XXXX"}
            required
          />
          <button type="submit" disabled={loading} className="btn-accent disabled:opacity-50">
            {loading ? "..." : "Rechercher"}
          </button>
        </form>
      </div>

      {/* Résultats de recherche */}
      {searched && (
        <div className="mb-8">
          <h3 className="font-bold text-night mb-3">
            Résultats ({bookings.length})
          </h3>
          {bookings.length === 0 ? (
            <div className="card text-center py-6 text-gray-400">
              <p>Aucune réservation trouvée pour &quot;{searchValue}&quot;.</p>
              <p className="text-xs mt-1">Vérifiez le numéro ou la référence.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {bookings.map(renderBookingCard)}
            </div>
          )}
        </div>
      )}

      {/* Réservations de l'utilisateur connecté */}
      {userBookings.length > 0 && (
        <div>
          <h3 className="font-bold text-night mb-3">
            📋 Mes dernières réservations
          </h3>
          <div className="space-y-4">
            {userBookings.map(renderBookingCard)}
          </div>
        </div>
      )}

      {/* Message si pas connecté et pas de recherche */}
      {!searched && userBookings.length === 0 && (
        <div className="text-center text-gray-500 mt-8">
          <div className="text-4xl mb-3">🎫</div>
          <p>Recherchez vos réservations par téléphone ou référence.</p>
          <p className="text-sm mt-2">
            <Link href="/auth/login" className="text-night font-semibold hover:text-accent-700">
              Connectez-vous
            </Link>
            {" "}pour voir automatiquement toutes vos réservations.
          </p>
          <Link href="/" className="text-night font-semibold hover:text-accent-700 mt-4 inline-block">
            ← Réserver un trajet
          </Link>
        </div>
      )}
    </div>
  );
}
