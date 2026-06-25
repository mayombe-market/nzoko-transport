"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Bus {
  id: string;
  name: string;
  bus_type: string;
  seats_per_row: number;
  rows: number;
  back_row_seats: number;
  amenities: string[];
  is_active: boolean;
}

const AMENITY_OPTIONS = [
  { id: "clim", label: "Climatisation" },
  { id: "wifi", label: "Wi-Fi" },
  { id: "usb", label: "Prises USB" },
  { id: "toilettes", label: "Toilettes" },
  { id: "collation", label: "Collation offerte" },
];

export function BusFleetTab({ isAdmin }: { isAdmin: boolean }) {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Form fields
  const [busName, setBusName] = useState("");
  const [busType, setBusType] = useState<"coach" | "minibus">("coach");
  const [seatsPerRow, setSeatsPerRow] = useState(5);
  const [rows, setRows] = useState(20);
  const [backRowSeats, setBackRowSeats] = useState(5);
  const [amenities, setAmenities] = useState<string[]>(["clim"]);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadBuses();
  }, []);

  async function loadBuses() {
    if (!supabase) {
      // Mode démo sans Supabase
      setBuses([
        { id: "1", name: "Grand Car 01", bus_type: "coach", seats_per_row: 5, rows: 20, back_row_seats: 5, amenities: ["clim", "wifi", "usb", "toilettes"], is_active: true },
        { id: "2", name: "Grand Car 02", bus_type: "coach", seats_per_row: 5, rows: 20, back_row_seats: 5, amenities: ["clim", "usb", "toilettes", "collation"], is_active: true },
        { id: "3", name: "Minibus 01", bus_type: "minibus", seats_per_row: 4, rows: 5, back_row_seats: 4, amenities: ["clim"], is_active: true },
        { id: "4", name: "Minibus 02", bus_type: "minibus", seats_per_row: 4, rows: 5, back_row_seats: 4, amenities: ["clim", "usb"], is_active: true },
      ]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("buses")
      .select("*")
      .order("created_at", { ascending: true });

    if (data) {
      setBuses(data as Bus[]);
    }
    setLoading(false);
  }

  function calculateCapacity(): number {
    // 2 colonnes gauche + 3 colonnes droite = 5 par rangée
    return seatsPerRow * rows;
  }

  function resetForm() {
    setBusName("");
    setBusType("coach");
    setSeatsPerRow(5);
    setRows(20);
    setBackRowSeats(5);
    setAmenities(["clim"]);
    setEditingId(null);
    setShowForm(false);
    setMessage("");
  }

  function startEdit(bus: Bus) {
    setBusName(bus.name);
    setBusType(bus.bus_type as "coach" | "minibus");
    setSeatsPerRow(bus.seats_per_row);
    setRows(bus.rows);
    setBackRowSeats(bus.back_row_seats);
    setAmenities(bus.amenities || []);
    setEditingId(bus.id);
    setShowForm(true);
  }

  function toggleAmenity(id: string) {
    setAmenities((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setMessage("❌ Supabase non configuré.");
      return;
    }

    if (!busName.trim()) {
      setMessage("❌ Le nom du bus est requis.");
      return;
    }

    setSaving(true);
    setMessage("");

    const busData = {
      name: busName.trim(),
      bus_type: busType,
      seats_per_row: seatsPerRow,
      rows: rows,
      back_row_seats: backRowSeats,
      amenities: amenities,
      is_active: true,
    };

    if (editingId) {
      // Modifier
      const { error } = await supabase
        .from("buses")
        .update(busData)
        .eq("id", editingId);

      if (error) {
        setMessage(`❌ Erreur : ${error.message}`);
      } else {
        setMessage("✅ Bus modifié avec succès !");
        resetForm();
        loadBuses();
      }
    } else {
      // Créer
      const { error } = await supabase
        .from("buses")
        .insert(busData);

      if (error) {
        setMessage(`❌ Erreur : ${error.message}`);
      } else {
        setMessage("✅ Bus ajouté avec succès !");
        resetForm();
        loadBuses();
      }
    }

    setSaving(false);
  }

  async function toggleBusStatus(busId: string, currentActive: boolean) {
    if (!supabase) return;
    await supabase
      .from("buses")
      .update({ is_active: !currentActive })
      .eq("id", busId);
    loadBuses();
  }

  async function deleteBus(busId: string, busName: string) {
    if (!confirm(`Supprimer le bus "${busName}" ? Cette action est irréversible.`)) return;
    if (!supabase) return;
    await supabase
      .from("buses")
      .delete()
      .eq("id", busId);
    loadBuses();
    setMessage(`✅ Bus "${busName}" supprimé.`);
  }

  if (loading) {
    return <div className="card text-center py-8 text-gray-400">Chargement de la flotte...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Message */}
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {message}
        </div>
      )}

      {/* Header + bouton ajouter */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-night text-lg">Flotte de bus ({buses.length})</h2>
        {isAdmin && (
          <button
            onClick={() => { resetForm(); setShowForm(!showForm); }}
            className="btn-accent text-sm px-4 py-2"
          >
            {showForm ? "Annuler" : "+ Ajouter un bus"}
          </button>
        )}
      </div>

      {/* Formulaire d'ajout/modification */}
      {showForm && isAdmin && (
        <div className="card border-2 border-accent-400">
          <h3 className="font-bold text-night mb-4">
            {editingId ? "Modifier le bus" : "Ajouter un nouveau bus"}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nom */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom du bus *</label>
                <input
                  type="text"
                  value={busName}
                  onChange={(e) => setBusName(e.target.value)}
                  className="input-field"
                  placeholder="Ex: Grand Car 03"
                  required
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={busType}
                  onChange={(e) => {
                    const type = e.target.value as "coach" | "minibus";
                    setBusType(type);
                    if (type === "coach") {
                      setSeatsPerRow(5);
                      setRows(20);
                      setBackRowSeats(5);
                    } else {
                      setSeatsPerRow(4);
                      setRows(5);
                      setBackRowSeats(4);
                    }
                  }}
                  className="input-field"
                >
                  <option value="coach">Grand car (coach)</option>
                  <option value="minibus">Minibus</option>
                </select>
              </div>

              {/* Colonnes par rangée */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Places par rangée</label>
                <select
                  value={seatsPerRow}
                  onChange={(e) => setSeatsPerRow(Number(e.target.value))}
                  className="input-field"
                >
                  <option value={4}>4 (2+2)</option>
                  <option value={5}>5 (2+3)</option>
                </select>
              </div>

              {/* Nombre de rangées */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de rangées</label>
                <input
                  type="number"
                  value={rows}
                  onChange={(e) => setRows(Number(e.target.value))}
                  className="input-field"
                  min={3}
                  max={30}
                />
              </div>
            </div>

            {/* Capacité calculée */}
            <div className="bg-night/5 p-3 rounded-lg">
              <p className="text-sm text-night">
                <strong>Capacité totale :</strong> {calculateCapacity()} places
                ({seatsPerRow} colonnes × {rows} rangées)
              </p>
            </div>

            {/* Équipements */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Équipements</label>
              <div className="flex flex-wrap gap-2">
                {AMENITY_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleAmenity(option.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      amenities.includes(option.id)
                        ? "bg-accent-500 text-night"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {amenities.includes(option.id) ? "✓ " : ""}{option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bouton submit */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="btn-primary disabled:opacity-50"
              >
                {saving ? "Enregistrement..." : editingId ? "Modifier" : "Ajouter le bus"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="btn-outline"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Liste des bus */}
      <div className="card">
        {buses.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <div className="text-4xl mb-2">🚌</div>
            <p>Aucun bus enregistré. Ajoutez votre premier bus !</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 pr-4">Nom</th>
                  <th className="pb-3 pr-4">Type</th>
                  <th className="pb-3 pr-4">Capacité</th>
                  <th className="pb-3 pr-4">Équipements</th>
                  <th className="pb-3 pr-4">Statut</th>
                  {isAdmin && <th className="pb-3">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {buses.map((bus) => (
                  <tr key={bus.id} className={`border-b hover:bg-gray-50 ${!bus.is_active ? "opacity-50" : ""}`}>
                    <td className="py-3 pr-4 font-medium">{bus.name}</td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        bus.bus_type === "coach" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                      }`}>
                        {bus.bus_type === "coach" ? "Grand car" : "Minibus"}
                      </span>
                    </td>
                    <td className="py-3 pr-4">{bus.seats_per_row * bus.rows} places</td>
                    <td className="py-3 pr-4 text-xs text-gray-500">
                      {bus.amenities?.join(", ") || "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        bus.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}>
                        {bus.is_active ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(bus)}
                            className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => toggleBusStatus(bus.id, bus.is_active)}
                            className={`text-xs px-2 py-1 rounded border ${
                              bus.is_active ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"
                            }`}
                          >
                            {bus.is_active ? "⏸️" : "▶️"}
                          </button>
                          <button
                            onClick={() => deleteBus(bus.id, bus.name)}
                            className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
