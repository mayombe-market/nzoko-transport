"use client";

import Link from "next/link";

export default function MesReservationsPage() {
  // En production, on cherchera par numéro de téléphone dans Supabase
  // Pour l'instant, page placeholder

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="section-title mb-6">Mes réservations</h1>

      <div className="card">
        <h2 className="font-bold text-night mb-4">🔍 Rechercher une réservation</h2>
        <p className="text-sm text-gray-600 mb-4">
          Entrez votre numéro de référence ou votre numéro de téléphone pour retrouver vos billets.
        </p>

        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Référence ou téléphone
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Ex: NZK-260624-A3F2 ou 06XXXXXXX"
            />
          </div>
          <button type="submit" className="btn-accent">
            Rechercher
          </button>
        </form>
      </div>

      <div className="mt-8 text-center text-gray-500">
        <div className="text-4xl mb-3">🎫</div>
        <p>Vos réservations apparaîtront ici une fois connecté à Supabase.</p>
        <Link href="/" className="text-night font-semibold hover:text-accent-700 mt-2 inline-block">
          ← Réserver un trajet
        </Link>
      </div>
    </div>
  );
}
