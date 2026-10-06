"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useNetwork } from "@/lib/network";

export function SearchForm() {
  const router = useRouter();
  // Villes et agences lues en base : une nouvelle agence apparaît sans redéploiement
  const { cities: CITIES, terminalsOf, cityLabel } = useNetwork();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fromTerminal, setFromTerminal] = useState("");
  const [toTerminal, setToTerminal] = useState("");
  const [date, setDate] = useState("");
  const [passengers, setPassengers] = useState(1);

  // Date minimum = aujourd'hui
  const today = new Date().toISOString().split("T")[0];

  // Vérifier si une ville a des terminus
  const fromTerminals = from ? terminalsOf(from) : [];
  const toTerminals = to ? terminalsOf(to) : [];

  // Une ville avec une seule agence : elle est choisie d'office
  function handleFromChange(value: string) {
    setFrom(value);
    const list = terminalsOf(value);
    setFromTerminal(list.length === 1 ? list[0].id : "");
  }

  function handleToChange(value: string) {
    setTo(value);
    const list = terminalsOf(value);
    setToTerminal(list.length === 1 ? list[0].id : "");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to || !date) return;
    if (from === to) {
      alert("Les villes de départ et d'arrivée doivent être différentes.");
      return;
    }
    if (fromTerminals.length > 0 && !fromTerminal) {
      alert("Veuillez choisir votre agence de départ.");
      return;
    }
    if (toTerminals.length > 0 && !toTerminal) {
      alert("Veuillez choisir votre agence d'arrivée.");
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
    <form onSubmit={handleSubmit} className="card max-w-4xl mx-auto border-t-4 border-t-accent-500 text-left">
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
                {city.name}{city.region && city.region !== city.name ? ` (${city.region})` : ""}
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
                {city.name}{city.region && city.region !== city.name ? ` (${city.region})` : ""}
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

      {/* Agences Nzoko de la ville (lues en base) */}
      {(fromTerminals.length > 0 || toTerminals.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200">
          {fromTerminals.length > 0 && (
            <div>
              <label className="block text-sm font-bold text-night mb-2">
                📌 Agence de départ à {cityLabel(from)}
              </label>
              <select
                value={fromTerminal}
                onChange={(e) => setFromTerminal(e.target.value)}
                className="input-field text-lg"
                required
              >
                <option value="">Choisir l&apos;agence...</option>
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
                📌 Agence d&apos;arrivée à {cityLabel(to)}
              </label>
              <select
                value={toTerminal}
                onChange={(e) => setToTerminal(e.target.value)}
                className="input-field text-lg"
                required
              >
                <option value="">Choisir l&apos;agence...</option>
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
