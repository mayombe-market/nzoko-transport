"use client";

import { useState } from "react";
import Link from "next/link";

export default function AdminPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState<"reservations" | "bus" | "lignes" | "stats">("reservations");

  // Login simple pour la démo (sera remplacé par Supabase Auth)
  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (password === "nzoko2026") {
      setIsLoggedIn(true);
    } else {
      alert("Code d'accès incorrect");
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="card text-center">
          <div className="w-16 h-16 bg-night rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔒</span>
          </div>
          <h1 className="text-xl font-bold text-night mb-2">Espace Agent</h1>
          <p className="text-sm text-gray-600 mb-6">
            Connectez-vous pour gérer les réservations et la flotte.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field text-center"
              placeholder="Code d'accès"
              required
            />
            <button type="submit" className="btn-primary w-full">
              Se connecter
            </button>
          </form>

          <p className="text-xs text-gray-400 mt-4">
            Code démo : nzoko2026
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header admin */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title">Dashboard Nzoko Transport</h1>
          <p className="text-gray-600 text-sm">Gestion des opérations</p>
        </div>
        <button
          onClick={() => setIsLoggedIn(false)}
          className="text-sm text-gray-500 hover:text-red-600"
        >
          Déconnexion
        </button>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card text-center">
          <p className="text-3xl font-black text-night">0</p>
          <p className="text-xs text-gray-500">Réservations du jour</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-black text-accent-700">0 FCFA</p>
          <p className="text-xs text-gray-500">Revenus du jour</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-black text-yellow-600">0</p>
          <p className="text-xs text-gray-500">Paiements en attente</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-black text-green-600">4</p>
          <p className="text-xs text-gray-500">Bus actifs</p>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b mb-6 overflow-x-auto">
        {[
          { key: "reservations", label: "🎫 Réservations" },
          { key: "bus", label: "🚌 Flotte" },
          { key: "lignes", label: "🛣️ Lignes" },
          { key: "stats", label: "📊 Statistiques" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-night text-night"
                : "border-transparent text-gray-500 hover:text-night"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenu des onglets */}
      {activeTab === "reservations" && (
        <div className="card">
          <h2 className="font-bold text-night mb-4">Réservations récentes</h2>
          <div className="text-center py-8 text-gray-400">
            <div className="text-4xl mb-2">🎫</div>
            <p>Les réservations apparaîtront ici une fois connecté à Supabase.</p>
            <p className="text-xs mt-2">
              Vous pourrez confirmer ou refuser les paiements Mobile Money.
            </p>
          </div>
        </div>
      )}

      {activeTab === "bus" && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-night">Flotte de bus</h2>
            <button className="btn-accent text-sm px-4 py-2">+ Ajouter un bus</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-4">Nom</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Capacité</th>
                  <th className="pb-2 pr-4">Équipements</th>
                  <th className="pb-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: "Grand Car 01", type: "Coach", capacity: 49, amenities: "Clim, WiFi, USB, Toilettes", active: true },
                  { name: "Grand Car 02", type: "Coach", capacity: 49, amenities: "Clim, USB, Toilettes, Collation", active: true },
                  { name: "Minibus 01", type: "Minibus", capacity: 16, amenities: "Clim", active: true },
                  { name: "Minibus 02", type: "Minibus", capacity: 16, amenities: "Clim, USB", active: true },
                ].map((bus) => (
                  <tr key={bus.name} className="border-b hover:bg-gray-50">
                    <td className="py-3 pr-4 font-medium">{bus.name}</td>
                    <td className="py-3 pr-4">{bus.type}</td>
                    <td className="py-3 pr-4">{bus.capacity} places</td>
                    <td className="py-3 pr-4 text-xs text-gray-500">{bus.amenities}</td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                        Actif
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "lignes" && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-night">Lignes & horaires</h2>
            <button className="btn-accent text-sm px-4 py-2">+ Nouvelle ligne</button>
          </div>

          <div className="space-y-4">
            {[
              { route: "RN1 — Brazzaville ↔ Pointe-Noire", services: 3, times: "05:30 – 21:00" },
              { route: "RN2 — Brazzaville ↔ Ouesso", services: 2, times: "05:00 – 19:30" },
              { route: "Axe des Plateaux — Brazzaville ↔ Djambala", services: 1, times: "07:00 – 13:30" },
              { route: "Axe Niari — Pointe-Noire ↔ Sibiti", services: 1, times: "08:00 – 15:00" },
            ].map((line) => (
              <div key={line.route} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-night">{line.route}</p>
                  <p className="text-xs text-gray-500">{line.services} service(s) • Horaires : {line.times}</p>
                </div>
                <button className="text-sm text-night hover:text-accent-700 font-medium">
                  Modifier →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "stats" && (
        <div className="card text-center py-8">
          <div className="text-4xl mb-2">📊</div>
          <h2 className="font-bold text-night mb-2">Statistiques</h2>
          <p className="text-gray-500">
            Les statistiques (revenus, taux d&apos;occupation, trajets populaires) seront disponibles après connexion à Supabase.
          </p>
        </div>
      )}
    </div>
  );
}
