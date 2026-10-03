"use client";

import { useState } from "react";
import { Watermark } from "@/components/Logo";

const STEPS: { key: string; label: (p: Tracked) => string }[] = [
  { key: "depose", label: (p) => `Déposé à ${p.from_city}` },
  { key: "en_transit", label: () => "En transit" },
  { key: "arrive", label: (p) => `Arrivé à ${p.to_city}` },
  { key: "pret_au_retrait", label: (p) => `Prêt au retrait — agence ${p.to_terminal}` },
  { key: "retire", label: () => "Retiré" },
];

interface Tracked {
  reference: string;
  status: string;
  from_city: string;
  to_city: string;
  to_terminal: string;
  payment_due: boolean;
  timeline: { status: string; at: string }[];
}

export default function SuiviColisPage() {
  const [reference, setReference] = useState("");
  const [phone4, setPhone4] = useState("");
  const [parcel, setParcel] = useState<Tracked | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setParcel(null);
    setLoading(true);
    try {
      const res = await fetch("/api/colis/suivi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: reference.trim().toUpperCase(), phone4 }),
      });
      const json = await res.json();
      if (json.success) setParcel(json.parcel);
      else setError(json.message);
    } catch {
      setError("Connexion impossible.");
    }
    setLoading(false);
  }

  const reached = (key: string) => parcel?.timeline.find((t) => t.status === key);
  const fmt = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Africa/Brazzaville", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <section className="relative overflow-hidden bg-night text-white py-12 px-4">
        <Watermark className="left-1/2 -translate-x-1/2 -top-6 w-[320px]" />
        <div className="relative max-w-xl mx-auto text-center">
          <h1 className="font-display text-3xl font-semibold tracking-[0.1em]">SUIVRE UN <span className="text-accent-500">COLIS</span></h1>
          <p className="text-gray-300 mt-2">Référence du reçu + 4 derniers chiffres du téléphone de l&apos;expéditeur ou du destinataire.</p>
        </div>
      </section>

      <div className="max-w-xl mx-auto px-4 py-8">
        <form onSubmit={search} className="card border-t-4 border-t-accent-500 space-y-3">
          <input className="input-field font-mono uppercase" placeholder="NZK-C-XXXXXX" value={reference} onChange={(e) => setReference(e.target.value)} required maxLength={12} />
          <input
            className="input-field font-mono"
            placeholder="4 derniers chiffres du téléphone"
            inputMode="numeric"
            maxLength={4}
            value={phone4}
            onChange={(e) => setPhone4(e.target.value.replace(/\D/g, ""))}
            required
          />
          <button disabled={loading} className="btn-accent w-full disabled:opacity-50">{loading ? "Recherche…" : "Suivre mon colis"}</button>
        </form>

        {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {parcel && (
          <div className="card mt-6">
            <p className="font-mono font-bold text-night text-lg">{parcel.reference}</p>
            <p className="text-sm text-gray-600 mb-4">{parcel.from_city} → {parcel.to_city}</p>

            {parcel.status === "annule" ? (
              <p className="text-red-700 font-semibold">Envoi annulé. Contactez l&apos;agence de départ.</p>
            ) : parcel.status === "verification" ? (
              <p className="text-accent-800 font-semibold">Votre colis est en cours de vérification par nos équipes.</p>
            ) : (
              <ol className="space-y-4">
                {STEPS.map((s) => {
                  const done = reached(s.key);
                  return (
                    <li key={s.key} className="flex gap-3">
                      <span className={`mt-1 w-3 h-3 rounded-full shrink-0 ${done ? "bg-accent-500" : "bg-gray-200"}`} />
                      <div>
                        <p className={`font-semibold ${done ? "text-night" : "text-gray-400"}`}>{s.label(parcel)}</p>
                        {done && <p className="text-xs text-gray-500">{fmt(done.at)}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {parcel.status === "pret_au_retrait" && (
              <p className="mt-4 text-sm bg-green-50 border border-green-200 rounded-lg p-3 text-green-800">
                Le destinataire peut retirer le colis à l&apos;agence {parcel.to_terminal} avec le <strong>code secret</strong> figurant sur le reçu de l&apos;expéditeur.
                {parcel.payment_due && " Le transport est à payer au retrait."}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
