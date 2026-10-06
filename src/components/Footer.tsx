"use client";

import Link from "next/link";
import { LogoFull } from "./Logo";
import { useNetwork } from "@/lib/network";

export function Footer() {
  const { cities, terminals } = useNetwork();
  // Villes qui ont au moins une agence Nzoko (lues en base)
  const agencyCities = cities.filter((c) => terminals.some((t) => t.city_id === c.id));

  return (
    <footer className="bg-night text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Marque */}
          <div>
            <LogoFull className="h-20 w-auto mb-4" />
            <p className="text-gray-400 text-sm leading-relaxed">
              Voyagez en toute sécurité partout au Congo-Brazzaville.
              Réservation en ligne, paiement Mobile Money, billets et colis suivis agence par agence.
            </p>
          </div>

          {/* Liens */}
          <div>
            <h3 className="font-semibold text-accent-400 mb-3">Liens utiles</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>
                <Link href="/" className="hover:text-accent-400 transition-colors">Rechercher un trajet</Link>
              </li>
              <li>
                <Link href="/mes-reservations" className="hover:text-accent-400 transition-colors">Mes réservations</Link>
              </li>
              <li>
                <Link href="/suivi-colis" className="hover:text-accent-400 transition-colors">Suivre un colis</Link>
              </li>
            </ul>
          </div>

          {/* Agences */}
          <div>
            <h3 className="font-semibold text-accent-400 mb-3">Nos agences</h3>
            {agencyCities.length === 0 ? (
              <p className="text-sm text-gray-400">Brazzaville · Pointe-Noire</p>
            ) : (
              <ul className="space-y-2 text-sm text-gray-300">
                {agencyCities.map((c) => (
                  <li key={c.id}>
                    <span className="font-medium text-white">{c.name}</span>
                    <span className="text-gray-400"> — {terminals.filter((t) => t.city_id === c.id).map((t) => t.name).join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t border-white/10 mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-500">
          <span>© {new Date().getFullYear()} Nzoko Transport. Tous droits réservés.</span>
          <Link href="/admin" className="text-xs text-gray-500 hover:text-accent-400 transition-colors">
            Connexion personnel Nzoko
          </Link>
        </div>
      </div>
    </footer>
  );
}
