"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Données statiques des villes (sera remplacé par Supabase plus tard)
const CITIES = [
  { id: "brazzaville", name: "Brazzaville", region: "Brazzaville" },
  { id: "djambala", name: "Djambala", region: "Plateaux" },
  { id: "dolisie", name: "Dolisie", region: "Niari" },
  { id: "gamboma", name: "Gamboma", region: "Plateaux" },
  { id: "kinkala", name: "Kinkala", region: "Pool" },
  { id: "loudima", name: "Loudima", region: "Bouenza" },
  { id: "madingou", name: "Madingou", region: "Bouenza" },
  { id: "makoua", name: "Makoua", region: "Cuvette" },
  { id: "mindouli", name: "Mindouli", region: "Pool" },
  { id: "nkayi", name: "Nkayi", region: "Bouenza" },
  { id: "owando", name: "Owando", region: "Cuvette" },
  { id: "oyo", name: "Oyo", region: "Cuvette" },
  { id: "ouesso", name: "Ouesso", region: "Sangha" },
  { id: "pointenoire", name: "Pointe-Noire", region: "Pointe-Noire" },
  { id: "sibiti", name: "Sibiti", region: "Lékoumou" },
];

export function SearchForm() {
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState("");
  const [passengers, setPassengers] = useState(1);

  // Date minimum = aujourd'hui
  const today = new Date().toISOString().split("T")[0];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to || !date) return;
    if (from === to) {
      alert("Les villes de départ et d'arrivée doivent être différentes.");
      return;
    }
    const params = new URLSearchParams({ from, to, date, passengers: String(passengers) });
    router.push(`/recherche?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-4xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Départ */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            🚏 Ville de départ
          </label>
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input-field"
            required
          >
            <option value="">Choisir...</option>
            {CITIES.map((city) => (
              <option key={city.id} value={city.id} disabled={city.id === to}>
                {city.name} ({city.region})
              </option>
            ))}
          </select>
        </div>

        {/* Arrivée */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            📍 Ville d&apos;arrivée
          </label>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input-field"
            required
          >
            <option value="">Choisir...</option>
            {CITIES.map((city) => (
              <option key={city.id} value={city.id} disabled={city.id === from}>
                {city.name} ({city.region})
              </option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            📅 Date de voyage
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={today}
            className="input-field"
            required
          />
        </div>

        {/* Passagers */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            👥 Passagers
          </label>
          <select
            value={passengers}
            onChange={(e) => setPassengers(Number(e.target.value))}
            className="input-field"
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} passager{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-6 text-center">
        <button type="submit" className="btn-accent text-lg px-10">
          🔍 Rechercher des trajets
        </button>
      </div>
    </form>
  );
}
