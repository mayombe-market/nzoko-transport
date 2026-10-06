"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { formatXAF } from "@/lib/utils";
import Link from "next/link";
import { PhoneInput } from "@/components/PhoneInput";
import { isValidPhone } from "@/lib/phone";
import { useNetwork } from "@/lib/network";

interface BookingWithPassengers {
  id: string;
  reference: string;
  from_city: string;
  to_city: string;
  from_city_name?: string;
  to_city_name?: string;
  from_terminal: string | null;
  from_terminal_name?: string | null;
  date: string;
  departure_time: string;
  total_price: number;
  passenger_count: number;
  status: string;
  created_at: string;
  passengers?: { full_name: string; seat_number: string; is_primary: boolean }[];
  access_key?: string | null;
  trip_status?: string | null;
  delay_minutes?: number;
  trip_status_reason?: string | null;
}

const REFERENCE = /^NZK-\d{6}-[A-Z0-9]{4}$/;

const STATUS: Record<string, { label: string; badge: string; border: string }> = {
  confirmed: { label: "✅ Confirmé", badge: "bg-green-100 text-green-700", border: "border-l-green-500" },
  pending: { label: "⏳ En attente de vérification", badge: "bg-yellow-100 text-yellow-700", border: "border-l-yellow-500" },
  cancelled: { label: "❌ Annulé", badge: "bg-red-100 text-red-700", border: "border-l-red-500" },
  expired: { label: "⌛ Expiré (paiement non confirmé)", badge: "bg-gray-100 text-gray-600", border: "border-l-gray-300" },
};

export default function MesReservationsPage() {
  const { cityLabel, terminalLabel } = useNetwork();
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [bookings, setBookings] = useState<BookingWithPassengers[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [userBookings, setUserBookings] = useState<BookingWithPassengers[]>([]);

  // Client connecté (email confirmé) : ses réservations, lues sous la protection de la base
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

  const ref = reference.trim().toUpperCase();
  const canSearch = REFERENCE.test(ref) && isValidPhone(phone);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!canSearch) return;

    setLoading(true);
    setSearched(true);
    setBookings([]);
    setError("");

    // Référence ET téléphone : un numéro seul ne donne jamais accès à une réservation
    try {
      const res = await fetch("/api/reservations/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: ref, phone }),
      });
      const json = await res.json();
      if (json.success) setBookings(json.bookings as BookingWithPassengers[]);
      else setError(json.message || "Aucune réservation trouvée.");
    } catch {
      setError("Connexion impossible. Réessayez.");
    }

    setLoading(false);
  }

  function renderBookingCard(booking: BookingWithPassengers) {
    const primaryPassenger = booking.passengers?.find((p) => p.is_primary) || booking.passengers?.[0];
    const seats = booking.passengers?.map((p) => p.seat_number).filter(Boolean).join(", ") || "—";
    const fromName = booking.from_city_name || cityLabel(booking.from_city);
    const toName = booking.to_city_name || cityLabel(booking.to_city);
    const terminalName = booking.from_terminal_name || (booking.from_terminal ? terminalLabel(booking.from_terminal) : null);
    const status = STATUS[booking.status] ?? { label: booking.status, badge: "bg-gray-100 text-gray-600", border: "border-l-gray-300" };
    const isPast = new Date(booking.date) < new Date(new Date().toISOString().split("T")[0]);

    return (
      <div key={booking.id} className={`card border-l-4 ${status.border} ${isPast ? "opacity-70" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="font-mono font-bold text-night">{booking.reference}</span>
              <span className={`px-2 py-0.5 text-xs rounded-full font-semibold ${status.badge}`}>{status.label}</span>
              {isPast && <span className="text-xs text-gray-400">Passé</span>}
            </div>

            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-night text-lg">{fromName}</span>
              <span className="text-gray-400">→</span>
              <span className="font-bold text-night text-lg">{toName}</span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 mt-2">
              <span>📅 {new Date(booking.date + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</span>
              <span>🕐 {booking.departure_time}</span>
              <span>💺 {seats}</span>
              <span className="font-semibold text-accent-700">{formatXAF(booking.total_price)}</span>
            </div>

            {booking.trip_status === "cancelled" && (
              <p className="mt-2 text-sm rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">
                ❌ Départ annulé{booking.trip_status_reason ? ` — ${booking.trip_status_reason}` : ""}. Contactez votre agence Nzoko.
              </p>
            )}
            {booking.trip_status !== "cancelled" && (booking.delay_minutes ?? 0) > 0 && (
              <p className="mt-2 text-sm rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">
                ⏱ Départ retardé de {booking.delay_minutes} min{booking.trip_status_reason ? ` (${booking.trip_status_reason})` : ""}.
              </p>
            )}

            {terminalName && <p className="text-xs text-gray-500 mt-1">📍 Départ depuis l&apos;agence : {terminalName}</p>}

            {primaryPassenger && (
              <p className="text-xs text-gray-500 mt-1">
                👤 {primaryPassenger.full_name}
                {booking.passenger_count > 1 && ` (+${booking.passenger_count - 1} passager${booking.passenger_count > 2 ? "s" : ""})`}
              </p>
            )}
          </div>

          {(booking.status === "confirmed" || booking.status === "pending") && booking.access_key && (
            <Link
              href={`/billet/${booking.reference}?k=${encodeURIComponent(booking.access_key)}`}
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

      <div className="card mb-6">
        <h2 className="font-bold text-night mb-1">🔍 Retrouver une réservation</h2>
        <p className="text-xs text-gray-500 mb-4">
          Pour protéger les voyageurs, il faut la <strong>référence</strong> (NZK-…) <strong>et</strong> le numéro de téléphone donné lors de la réservation.
        </p>

        <form onSubmit={handleSearch} className="space-y-3">
          <div>
            <label htmlFor="ref" className="block text-sm font-medium text-gray-700 mb-1">Référence de réservation</label>
            <input
              id="ref"
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value.toUpperCase())}
              className="input-field font-mono uppercase tracking-wider"
              placeholder="NZK-261008-XXXX"
              autoComplete="off"
              required
            />
          </div>
          <PhoneInput label="Téléphone utilisé pour la réservation" required value={phone} onChange={(v) => setPhone(v)} />
          <button type="submit" disabled={loading || !canSearch} className="btn-accent w-full sm:w-auto disabled:opacity-50 py-3">
            {loading ? "Recherche…" : "Rechercher"}
          </button>
        </form>
      </div>

      {searched && !loading && (
        <div className="mb-8">
          {bookings.length === 0 ? (
            <div className="card text-center py-6 text-gray-500">
              <p>{error || "Aucune réservation trouvée."}</p>
              <p className="text-xs mt-1 text-gray-400">Vérifiez la référence et le numéro de téléphone.</p>
            </div>
          ) : (
            <div className="space-y-4">{bookings.map(renderBookingCard)}</div>
          )}
        </div>
      )}

      {userBookings.length > 0 && (
        <div>
          <h3 className="font-bold text-night mb-3">📋 Mes dernières réservations</h3>
          <div className="space-y-4">{userBookings.map(renderBookingCard)}</div>
        </div>
      )}

      {!searched && userBookings.length === 0 && (
        <div className="text-center text-gray-500 mt-8">
          <div className="text-4xl mb-3">🎫</div>
          <p>Votre référence figure sur la page de confirmation de votre réservation.</p>
          <p className="text-sm mt-2">
            <Link href="/auth/login" className="text-night font-semibold hover:text-accent-700">
              Connectez-vous
            </Link>
            {" "}pour voir automatiquement les réservations faites avec votre email.
          </p>
          <Link href="/" className="text-night font-semibold hover:text-accent-700 mt-4 inline-block">
            ← Réserver un trajet
          </Link>
        </div>
      )}
    </div>
  );
}
