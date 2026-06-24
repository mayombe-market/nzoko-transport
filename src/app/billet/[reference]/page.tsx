"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { formatXAF } from "@/lib/utils";
import Link from "next/link";

interface TicketData {
  reference: string;
  passengerName: string;
  phone: string;
  from: string;
  to: string;
  date: string;
  departureTime: string;
  seats: string;
  totalPrice: number;
  status: string;
}

export default function BilletPage() {
  const params = useParams();
  const reference = (params.reference as string)?.toUpperCase();
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadTicket();
  }, [reference]);

  async function loadTicket() {
    if (!reference) {
      setError("Référence manquante.");
      setLoading(false);
      return;
    }

    // Essayer de charger depuis sessionStorage d'abord (pour la démo)
    const stored = sessionStorage.getItem("nzoko_confirmation");
    if (stored) {
      const data = JSON.parse(stored);
      if (data.reference === reference) {
        setTicket({
          reference: data.reference,
          passengerName: data.passengers?.[0]?.fullName || "Inconnu",
          phone: data.passengers?.[0]?.phone || "",
          from: data.trip?.fromName || "?",
          to: data.trip?.toName || "?",
          date: data.trip?.date || "",
          departureTime: data.trip?.departTime || "",
          seats: data.seats?.join(", ") || "",
          totalPrice: data.totalPrice || 0,
          status: "confirmed",
        });
        setLoading(false);
        return;
      }
    }

    // Sinon essayer depuis Supabase
    if (supabase) {
      const { data: booking } = await supabase
        .from("bookings")
        .select("*, passengers(*)")
        .eq("reference", reference)
        .single();

      if (booking) {
        const primary = booking.passengers?.find((p: any) => p.is_primary) || booking.passengers?.[0];
        setTicket({
          reference: booking.reference,
          passengerName: primary?.full_name || "Inconnu",
          phone: primary?.phone || "",
          from: booking.from_city || "?",
          to: booking.to_city || "?",
          date: booking.date,
          departureTime: booking.departure_time,
          seats: booking.passengers?.map((p: any) => p.seat_number).join(", ") || "",
          totalPrice: booking.total_price,
          status: booking.status,
        });
        setLoading(false);
        return;
      }
    }

    setError("Billet introuvable.");
    setLoading(false);
  }

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="animate-pulse text-gray-400">Chargement du billet...</div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-4xl mb-3">❌</div>
        <h1 className="text-xl font-bold text-night mb-2">Billet introuvable</h1>
        <p className="text-gray-600 text-sm">{error || "Ce billet n'existe pas."}</p>
        <Link href="/" className="btn-primary inline-block mt-4">Retour à l&apos;accueil</Link>
      </div>
    );
  }

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(ticket.reference)}`;

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
      {/* Actions (ne s'impriment pas) */}
      <div className="flex justify-between items-center mb-6 print:hidden">
        <Link href="/" className="text-night hover:text-accent-700 text-sm">
          ← Accueil
        </Link>
        <button onClick={handlePrint} className="btn-accent text-sm px-4 py-2">
          🖨️ Imprimer / PDF
        </button>
      </div>

      {/* Billet */}
      <div className="card border-2 border-night print:border-black print:shadow-none">
        {/* Header */}
        <div className="bg-night text-white p-4 -mx-6 -mt-6 rounded-t-xl mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center">
              <span className="text-night font-black text-lg">N</span>
            </div>
            <div>
              <span className="font-bold">Nzoko Transport</span>
              <p className="text-xs text-gray-300">Billet de voyage</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-300">Référence</p>
            <p className="font-mono font-bold text-accent-400">{ticket.reference}</p>
          </div>
        </div>

        {/* Infos voyage */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-xs text-gray-500">Passager</p>
            <p className="font-bold text-night">{ticket.passengerName}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Téléphone</p>
            <p className="font-medium">{ticket.phone || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Départ</p>
            <p className="font-bold text-night">{ticket.from}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Arrivée</p>
            <p className="font-bold text-night">{ticket.to}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Date</p>
            <p className="font-medium">{ticket.date}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Heure de départ</p>
            <p className="font-bold text-night">{ticket.departureTime}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Place(s)</p>
            <p className="font-bold text-xl text-night">{ticket.seats}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Montant payé</p>
            <p className="font-bold text-xl text-accent-700">{formatXAF(ticket.totalPrice)}</p>
          </div>
        </div>

        {/* QR Code */}
        <div className="border-t border-dashed pt-6 text-center">
          <p className="text-xs text-gray-500 mb-3">
            Présentez ce QR code à l&apos;agent avant de monter dans le bus
          </p>
          <img
            src={qrCodeUrl}
            alt={`QR Code - ${ticket.reference}`}
            className="w-48 h-48 mx-auto border border-gray-200 rounded-lg p-2"
          />
          <p className="font-mono text-sm text-night font-bold mt-3">
            {ticket.reference}
          </p>
        </div>

        {/* Statut */}
        <div className="mt-6 pt-4 border-t text-center">
          <span className={`inline-block px-4 py-1 rounded-full text-sm font-semibold ${
            ticket.status === "confirmed" ? "bg-green-100 text-green-700" :
            ticket.status === "pending" ? "bg-yellow-100 text-yellow-700" :
            "bg-gray-100 text-gray-600"
          }`}>
            {ticket.status === "confirmed" ? "✅ Confirmé" :
             ticket.status === "pending" ? "⏳ En attente" :
             ticket.status}
          </span>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t text-center text-xs text-gray-400">
          <p>Nzoko Transport — Voyagez en toute sécurité 🇨🇬</p>
          <p className="mt-1">Ce billet est valable uniquement pour le voyage indiqué.</p>
        </div>
      </div>
    </div>
  );
}
