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

// Terminus par ville (gares routières)
const TERMINALS: Record<string, { id: string; name: string }[]> = {
  brazzaville: [
    { id: "chateau-deau", name: "Château d'eau" },
    { id: "mpila", name: "Mpila" },
    { id: "mafouta", name: "Mafouta" },
  ],
  pointenoire: [
    { id: "centre-ville", name: "Centre-ville" },
    { id: "nkouikou", name: "Nkouikou" },
    { id: "ngoyo", name: "Ngoyo" },
  ],
};

export function SearchForm() {
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fromTerminal, setFromTerminal] = useState("");
  const [toTerminal, setToTerminal] = useState("");
  const [date, setDate] = useState("");
  const [passengers, setPassengers] = useState(1);

  // Date minimum = aujourd'hui
  const today = new Date().toISOString().split("T")[0];

  // Vérifier si une ville a des terminus
  const fromTerminals = TERMINALS[from] || [];
  const toTerminals = TERMINALS[to] || [];

  function handleFromChange(value: string) {
    setFrom(value);
    setFromTerminal(""); // Reset terminal quand on change de ville
  }

  function handleToChange(value: string) {
    setTo(value);
    setToTerminal(""); // Reset terminal quand on change de ville
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to || !date) return;
    if (from === to) {
      alert("Les villes de départ et d'arrivée doivent être différentes.");
      return;
    }
    if (fromTerminals.length > 0 && !fromTerminal) {
      alert("Veuillez choisir un terminus de départ.");
      return;
    }
    if (toTerminals.length > 0 && !toTerminal) {
      alert("Veuillez choisir un terminus d'arrivée.");
      return;
    }

    const params = new URLSearchParams({
      from,
      to,
      date,
      passengers: String(passengers),
      ...(fromTerminal && { fromTerminal }),
      ...(toTerminal && { toTerminal }),
    });
    router.push(`/recherche?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-4xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Départ */}
        <div>
          <label className="block text-sm font-bold text-night mb-2">
            🚏 Ville de départ
          </label>
          <select
            value={from}
            onChange={(e) => handleFromChange(e.target.value)}
            className="input-field text-lg"
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
          <label className="block text-sm font-bold text-night mb-2">
            📍 Ville d&apos;arrivée
          </label>
          <select
            value={to}
            onChange={(e) => handleToChange(e.target.value)}
            className="input-field text-lg"
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
          <label className="block text-sm font-bold text-night mb-2">
            📅 Date de voyage
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={today}
            className="input-field text-lg"
            required
          />
        </div>

        {/* Passagers */}
        <div>
          <label className="block text-sm font-bold text-night mb-2">
            👥 Passagers
          </label>
          <select
            value={passengers}
            onChange={(e) => setPassengers(Number(e.target.value))}
            className="input-field text-lg"
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} passager{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Terminus (apparaît seulement si la ville a plusieurs gares) */}
      {(fromTerminals.length > 0 || toTerminals.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200">
          {fromTerminals.length > 0 && (
            <div>
              <label className="block text-sm font-bold text-night mb-2">
                📌 Terminus de départ à {CITIES.find(c => c.id === from)?.name}
              </label>
              <select
                value={fromTerminal}
                onChange={(e) => setFromTerminal(e.target.value)}
                className="input-field text-lg"
                required
              >
                <option value="">Choisir le terminus...</option>
                {fromTerminals.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {toTerminals.length > 0 && (
            <div>
              <label className="block text-sm font-bold text-night mb-2">
                📌 Terminus d&apos;arrivée à {CITIES.find(c => c.id === to)?.name}
              </label>
              <select
                value={toTerminal}
                onChange={(e) => setToTerminal(e.target.value)}
                className="input-field text-lg"
                required
              >
                <option value="">Choisir le terminus...</option>
                {toTerminals.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 text-center">
        <button type="submit" className="btn-accent text-lg px-10">
          🔍 Rechercher des trajets
        </button>
      </div>
    </form>
  );
}
