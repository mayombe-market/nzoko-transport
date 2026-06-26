"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface ServiceLine {
  id: string;
  corridor_id: string;
  bus_id: string | null;
  departure_times: string[];
  is_active: boolean;
}

interface Corridor {
  id: string;
  label: string;
}

interface Bus {
  id: string;
  name: string;
}

const DEFAULT_CORRIDORS: Corridor[] = [
  { id: "rn1", label: "RN1 — Brazzaville ↔ Pointe-Noire" },
  { id: "rn2", label: "RN2 — Brazzaville ↔ Ouesso" },
  { id: "plateaux", label: "Axe des Plateaux — Brazzaville ↔ Djambala" },
  { id: "niari", label: "Axe Niari — Pointe-Noire ↔ Sibiti" },
];

export function LinesTab({ isAdmin }: { isAdmin: boolean }) {
  const [lines, setLines] = useState<ServiceLine[]>([]);
  const [corridors, setCorridors] = useState<Corridor[]>(DEFAULT_CORRIDORS);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [corridorId, setCorridorId] = useState("");
  const [busId, setBusId] = useState("");
  const [departureTimes, setDepartureTimes] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    if (!supabase) {
      setLines([
        { id: "1", corridor_id: "rn1", bus_id: null, departure_times: ["06:00", "09:30", "14:00", "21:00"], is_active: true },
        { id: "2", corridor_id: "rn1", bus_id: null, departure_times: ["07:00", "12:00", "20:00"], is_active: true },
        { id: "3", corridor_id: "rn1", bus_id: null, departure_times: ["05:30", "08:00", "11:00", "16:00"], is_active: true },
        { id: "4", corridor_id: "rn2", bus_id: null, departure_times: ["05:00", "18:00"], is_active: true },
        { id: "5", corridor_id: "rn2", bus_id: null, departure_times: ["06:00", "19:30"], is_active: true },
        { id: "6", corridor_id: "plateaux", bus_id: null, departure_times: ["07:00", "13:30"], is_active: true },
        { id: "7", corridor_id: "niari", bus_id: null, departure_times: ["08:00", "15:00"], is_active: true },
      ]);
      setLoading(false);
      return;
    }

    const [servicesRes, corridorsRes, busesRes] = await Promise.all([
      supabase.from("services").select("*").order("created_at"),
      supabase.from("corridors").select("*"),
      supabase.from("buses").select("id, name").eq("is_active", true),
    ]);

    if (servicesRes.data) setLines(servicesRes.data as ServiceLine[]);
    if (corridorsRes.data && corridorsRes.data.length > 0) setCorridors(corridorsRes.data as Corridor[]);
    if (busesRes.data) setBuses(busesRes.data as Bus[]);
    setLoading(false);
  }

  function resetForm() {
    setEditingId(null);
    setCorridorId("");
    setBusId("");
    setDepartureTimes("");
    setShowForm(false);
    setMessage("");
  }

  function startEdit(line: ServiceLine) {
    setEditingId(line.id);
    setCorridorId(line.corridor_id);
    setBusId(line.bus_id || "");
    setDepartureTimes(line.departure_times.join(", "));
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setMessage("❌ Supabase non configuré.");
      return;
    }

    if (!corridorId || !departureTimes.trim()) {
      setMessage("❌ Corridor et horaires sont requis.");
      return;
    }

    setSaving(true);
    setMessage("");

    // Parser les horaires
    const times = departureTimes
      .split(",")
      .map((t) => t.trim())
      .filter((t) => /^\d{2}:\d{2}$/.test(t));

    if (times.length === 0) {
      setMessage("❌ Format d'horaire invalide. Utilisez HH:MM séparés par des virgules.");
      setSaving(false);
      return;
    }

    const lineData = {
      corridor_id: corridorId,
      bus_id: busId || null,
      departure_times: times,
      is_active: true,
    };

    if (editingId) {
      const { error } = await supabase.from("services").update(lineData).eq("id", editingId);
      if (error) {
        setMessage(`❌ Erreur : ${error.message}`);
      } else {
        setMessage("✅ Ligne modifiée !");
        resetForm();
        loadData();
      }
    } else {
      const { error } = await supabase.from("services").insert(lineData);
      if (error) {
        setMessage(`❌ Erreur : ${error.message}`);
      } else {
        setMessage("✅ Ligne ajoutée !");
        resetForm();
        loadData();
      }
    }
    setSaving(false);
  }

  async function toggleLine(lineId: string, currentActive: boolean) {
    if (!supabase) return;
    await supabase.from("services").update({ is_active: !currentActive }).eq("id", lineId);
    loadData();
  }

  async function deleteLine(lineId: string) {
    if (!confirm("Supprimer cette ligne ?")) return;
    if (!supabase) return;
    await supabase.from("services").delete().eq("id", lineId);
    loadData();
  }

  function getCorridorLabel(id: string): string {
    return corridors.find((c) => c.id === id)?.label || id;
  }

  function getBusName(id: string | null): string {
    if (!id) return "Non assigné";
    return buses.find((b) => b.id === id)?.name || id;
  }

  if (loading) {
    return <div className="card text-center py-8 text-gray-400">Chargement des lignes...</div>;
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-bold text-night text-lg">Lignes & horaires ({lines.length})</h2>
        {isAdmin && (
          <button
            onClick={() => { resetForm(); setShowForm(!showForm); }}
            className="btn-accent text-sm px-4 py-2"
          >
            {showForm ? "Annuler" : "+ Nouvelle ligne"}
          </button>
        )}
      </div>

      {/* Formulaire */}
      {showForm && isAdmin && (
        <div className="card border-2 border-accent-400">
          <h3 className="font-bold text-night mb-4">
            {editingId ? "Modifier la ligne" : "Ajouter une nouvelle ligne"}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Axe / Corridor *</label>
                <select
                  value={corridorId}
                  onChange={(e) => setCorridorId(e.target.value)}
                  className="input-field"
                  required
                >
                  <option value="">Choisir un axe...</option>
                  {corridors.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bus assigné</label>
                <select
                  value={busId}
                  onChange={(e) => setBusId(e.target.value)}
                  className="input-field"
                >
                  <option value="">Aucun bus spécifique</option>
                  {buses.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Horaires de départ * <span className="text-xs text-gray-400">(HH:MM séparés par virgule)</span>
              </label>
              <input
                type="text"
                value={departureTimes}
                onChange={(e) => setDepartureTimes(e.target.value)}
                className="input-field font-mono"
                placeholder="06:00, 09:30, 14:00, 21:00"
                required
              />
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? "Enregistrement..." : editingId ? "Modifier" : "Ajouter la ligne"}
              </button>
              <button type="button" onClick={resetForm} className="btn-outline">
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste des lignes */}
      <div className="space-y-3">
        {lines.length === 0 ? (
          <div className="card text-center py-8 text-gray-400">
            <div className="text-4xl mb-2">🛣️</div>
            <p>Aucune ligne enregistrée.</p>
          </div>
        ) : (
          lines.map((line) => (
            <div key={line.id} className={`card ${!line.is_active ? "opacity-50" : ""}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-night">{getCorridorLabel(line.corridor_id)}</p>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                    <span>🚌 {getBusName(line.bus_id)}</span>
                    <span>•</span>
                    <span>{line.departure_times.length} départ(s)/jour</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {line.departure_times.map((t) => (
                      <span key={t} className="px-2 py-0.5 text-xs rounded bg-night/10 text-night font-mono font-medium">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => startEdit(line)} className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100">
                      ✏️
                    </button>
                    <button
                      onClick={() => toggleLine(line.id, line.is_active)}
                      className={`text-xs px-2 py-1 rounded border ${line.is_active ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}
                    >
                      {line.is_active ? "⏸️" : "▶️"}
                    </button>
                    <button onClick={() => deleteLine(line.id)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50">
                      🗑️
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
