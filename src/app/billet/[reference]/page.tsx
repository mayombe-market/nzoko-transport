"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { formatXAF } from "@/lib/utils";
import { LogoFull, Watermark } from "@/components/Logo";

interface TicketPassenger {
  full_name: string;
  seat_number: string | null;
  is_primary: boolean;
  ticket_code: string | null;
  ticket_status: string | null;
}

interface TicketData {
  reference: string;
  status: string;
  date: string;
  departure_time: string;
  from_city_name: string;
  to_city_name: string;
  from_terminal_name: string | null;
  to_terminal_name: string | null;
  total_price: number;
  bus_name: string | null;
  authorized: boolean;
  customer_phone_masked: string | null;
  passengers: TicketPassenger[];
  trip_status?: string | null;
  delay_minutes?: number;
  trip_status_reason?: string | null;
}

const QR_PREFIX = "NZK-T:";
const formatCode = (c: string) => c.replace(/(.{4})(?=.)/g, "$1-");

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "✅ Confirmé", cls: "bg-green-100 text-green-700" },
  pending: { label: "⏳ Paiement en cours de vérification", cls: "bg-yellow-100 text-yellow-700" },
  cancelled: { label: "❌ Annulé", cls: "bg-red-100 text-red-700" },
  expired: { label: "⌛ Expiré — paiement non confirmé", cls: "bg-gray-100 text-gray-600" },
};

function BilletContent() {
  const params = useParams();
  const search = useSearchParams();
  const reference = String(params.reference || "").toUpperCase();
  const key = search.get("k") || "";
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/billet/${encodeURIComponent(reference)}${key ? `?k=${encodeURIComponent(key)}` : ""}`)
      .then((r) => r.json())
      .then(async (json) => {
        if (!json.success) {
          setError(json.message || "Billet introuvable.");
          return;
        }
        setTicket(json.booking);
        const codes: Record<string, string> = {};
        for (const p of json.booking.passengers as TicketPassenger[]) {
          if (p.ticket_code) {
            codes[p.ticket_code] = await QRCode.toDataURL(`${QR_PREFIX}${p.ticket_code}`, {
              errorCorrectionLevel: "M",
              margin: 1,
              width: 360,
              color: { dark: "#0E2930", light: "#FFFFFF" },
            });
          }
        }
        setQrs(codes);
      })
      .catch(() => setError("Connexion impossible."));
  }, [reference, key]);

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-4xl mb-3">❌</div>
        <h1 className="text-xl font-bold text-night mb-2">Billet introuvable</h1>
        <p className="text-gray-600 text-sm">{error}</p>
        <Link href="/mes-reservations" className="btn-primary inline-block mt-4">Mes réservations</Link>
      </div>
    );
  }
  if (!ticket) {
    return <div className="max-w-lg mx-auto px-4 py-16 text-center animate-pulse text-gray-400">Chargement du billet...</div>;
  }

  const status = STATUS[ticket.status] ?? { label: ticket.status, cls: "bg-gray-100 text-gray-600" };
  const showQr = ticket.authorized && ticket.status === "confirmed";
  const pdfUrl = `/api/billet/${encodeURIComponent(ticket.reference)}/pdf?k=${encodeURIComponent(key)}`;

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
      <div className="flex justify-between items-center mb-6 print:hidden">
        <Link href="/" className="text-night hover:text-accent-700 text-sm">← Accueil</Link>
        {showQr && (
          <a href={pdfUrl} target="_blank" rel="noopener" className="btn-accent text-sm px-4 py-2">
            📄 Télécharger le billet PDF
          </a>
        )}
      </div>

      <div className="card relative overflow-hidden border-2 border-night print:shadow-none [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
        <div className="bg-night text-white p-4 -mx-6 -mt-6 rounded-t-xl mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoFull className="h-14 w-auto" />
            <p className="text-xs text-gray-300 border-l border-white/20 pl-3">Billet de voyage</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-300">Référence</p>
            <p className="font-mono font-bold text-accent-400">{ticket.reference}</p>
          </div>
        </div>

        <Watermark className="right-2 top-28 w-48" />

        {ticket.trip_status === "cancelled" && (
          <div className="relative mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            ❌ Départ annulé{ticket.trip_status_reason ? ` — ${ticket.trip_status_reason}` : ""}. Contactez votre agence Nzoko.
          </div>
        )}
        {ticket.trip_status !== "cancelled" && (ticket.delay_minutes ?? 0) > 0 && (
          <div className="relative mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ⏱ Départ retardé de {ticket.delay_minutes} min{ticket.trip_status_reason ? ` (${ticket.trip_status_reason})` : ""}.
          </div>
        )}

        <div className="relative grid grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-xs text-gray-500">Départ</p>
            <p className="font-bold text-night">{ticket.from_city_name}</p>
            {ticket.from_terminal_name && <p className="text-xs text-gray-500">{ticket.from_terminal_name}</p>}
          </div>
          <div>
            <p className="text-xs text-gray-500">Arrivée</p>
            <p className="font-bold text-night">{ticket.to_city_name}</p>
            {ticket.to_terminal_name && <p className="text-xs text-gray-500">{ticket.to_terminal_name}</p>}
          </div>
          <div>
            <p className="text-xs text-gray-500">Date</p>
            <p className="font-medium">
              {new Date(ticket.date + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Heure de départ</p>
            <p className="font-bold text-night">{ticket.departure_time}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Bus</p>
            <p className="font-medium">{ticket.bus_name || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Montant</p>
            <p className="font-bold text-xl text-accent-700">{formatXAF(ticket.total_price)}</p>
          </div>
        </div>

        <div className="relative mb-4 text-center">
          <span className={`inline-block px-4 py-1 rounded-full text-sm font-semibold ${status.cls}`}>{status.label}</span>
        </div>

        {/* Un QR par passager */}
        <div className="relative bg-creme border-t-2 border-dashed border-accent-500 -mx-6 px-6 py-6 space-y-6">
          {ticket.passengers.map((p, i) => (
            <div key={i} className="text-center">
              <p className="font-bold text-night">{p.full_name}</p>
              <p className="text-sm text-gray-600 mb-3">Siège {p.seat_number ?? "—"}</p>
              {showQr && p.ticket_code ? (
                <>
                  {qrs[p.ticket_code] ? (
                    <img src={qrs[p.ticket_code]} alt={`QR code du billet de ${p.full_name}`} className="w-48 h-48 mx-auto bg-white rounded-lg p-2" />
                  ) : (
                    <div className="w-48 h-48 mx-auto bg-white rounded-lg animate-pulse" />
                  )}
                  <p className="font-mono text-sm text-night font-bold mt-2">{formatCode(p.ticket_code)}</p>
                  {p.ticket_status === "used" && <p className="text-xs text-red-600 mt-1">Billet déjà utilisé</p>}
                </>
              ) : ticket.status === "confirmed" && !ticket.authorized ? (
                <p className="text-xs text-gray-500">QR code visible uniquement avec le lien personnel du billet.</p>
              ) : ticket.status === "pending" ? (
                <p className="text-xs text-gray-500">Le QR code apparaîtra ici dès la confirmation du paiement.</p>
              ) : null}
            </div>
          ))}
          {showQr && (
            <p className="text-xs text-gray-500 text-center">
              Présentez ce QR code à l&apos;agent avant de monter dans le bus. Chaque billet n&apos;est valable qu&apos;une fois.
            </p>
          )}
        </div>

        <div className="relative mt-6 pt-4 border-t text-center text-xs text-gray-400">
          <p>Nzoko Transport — Voyagez en toute sécurité 🇨🇬</p>
          <p className="mt-1">Ce billet est valable uniquement pour le voyage indiqué.</p>
        </div>
      </div>
    </div>
  );
}

export default function BilletPage() {
  return (
    <Suspense fallback={<div className="text-center py-16 text-gray-400">Chargement du billet...</div>}>
      <BilletContent />
    </Suspense>
  );
}
