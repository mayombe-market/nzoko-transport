import Link from "next/link";
import { LogoIcon } from "./Logo";

export function Footer() {
  return (
    <footer className="bg-night text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Marque */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <LogoIcon className="w-10 h-10" />
              <span className="font-bold text-lg">Nzoko Transport</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              Voyagez en toute sécurité partout au Congo-Brazzaville.
              Réservation en ligne, paiement Mobile Money.
            </p>
          </div>

          {/* Liens */}
          <div>
            <h3 className="font-semibold text-accent-400 mb-3">Liens utiles</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li>
                <Link href="/" className="hover:text-accent-400 transition-colors">
                  Rechercher un trajet
                </Link>
              </li>
              <li>
                <Link href="/mes-reservations" className="hover:text-accent-400 transition-colors">
                  Mes réservations
                </Link>
              </li>
              <li>
                <Link href="/admin" className="hover:text-accent-400 transition-colors">
                  Espace Agent
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-accent-400 mb-3">Contact</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-center gap-2">
                <span>📞</span>
                <span>MTN : 06 XXX XX XX</span>
              </li>
              <li className="flex items-center gap-2">
                <span>📞</span>
                <span>Airtel : 05 XXX XX XX</span>
              </li>
              <li className="flex items-center gap-2">
                <span>📍</span>
                <span>Brazzaville, Congo</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-700 mt-8 pt-6 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Nzoko Transport. Tous droits réservés.
        </div>
      </div>
    </footer>
  );
}
