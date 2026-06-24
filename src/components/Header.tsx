"use client";

import Link from "next/link";
import { useState } from "react";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bg-night text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent-500 rounded-lg flex items-center justify-center">
              <span className="text-night font-black text-lg">N</span>
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight">Nzoko Transport</span>
              <span className="hidden sm:block text-xs text-accent-400">
                Voyagez en toute sécurité
              </span>
            </div>
          </Link>

          {/* Navigation desktop */}
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/" className="hover:text-accent-400 transition-colors">
              Accueil
            </Link>
            <Link href="/mes-reservations" className="hover:text-accent-400 transition-colors">
              Mes réservations
            </Link>
            <Link
              href="/admin"
              className="bg-accent-500 text-night px-4 py-2 rounded-lg font-semibold hover:bg-accent-400 transition-colors"
            >
              Espace Agent
            </Link>
          </nav>

          {/* Menu mobile burger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-night-light transition-colors"
            aria-label="Menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Menu mobile déroulant */}
        {menuOpen && (
          <nav className="md:hidden pb-4 border-t border-night-light pt-3 space-y-2">
            <Link
              href="/"
              className="block py-2 hover:text-accent-400 transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              Accueil
            </Link>
            <Link
              href="/mes-reservations"
              className="block py-2 hover:text-accent-400 transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              Mes réservations
            </Link>
            <Link
              href="/admin"
              className="block bg-accent-500 text-night px-4 py-2 rounded-lg font-semibold text-center hover:bg-accent-400 transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              Espace Agent
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
