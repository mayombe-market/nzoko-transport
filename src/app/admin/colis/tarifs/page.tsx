"use client";

import { useEffect, useState } from "react";
import { colisApi, useAgent } from "@/lib/parcel-ui";
import { ParcelNav } from "@/components/colis/ParcelNav";

interface Category {
  id: string;
  label: string;
  fare_percent: number;
  min_price: number;
  price_per_kg: number;
  requires_weight: boolean;
  max_weight_kg: number | null;
  is_active: boolean;
}

// Tarifs colis (admin) : prix = % du tarif voyageur du tronçon (arrondi à 100 FCFA),
// au minimum « prix minimum » par colis, + prix au kilo pour les catégories au poids.
export default function TarifsPage() {
  const { agent, ready } = useAgent();
  const [cats, setCats] = useState<Category[]>([]);
  const [msg, setMsg] = useState("");

  const load = () => colisApi<Category[]>("categories").then((r) => r.success && setCats(r.data ?? []));
  useEffect(() => {
    if (ready) load();
  }, [ready]);

  if (!ready || !agent) return <div className="max-w-4xl mx-auto px-4 py-12 text-center text-gray-400">Chargement…</div>;
  if (agent.role !== "admin") return <div className="max-w-4xl mx-auto px-4 py-12 text-center text-red-600">Réservé aux administrateurs.</div>;

  async function save(c: Category) {
    const r = await colisApi("category_update", c as any);
    setMsg(r.success ? `Tarif « ${c.label} » enregistré.` : r.message || "Erreur.");
    load();
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <ParcelNav title="Tarifs colis" isAdmin />
      <p className="text-sm text-gray-600 mb-4">
        Prix d&apos;un colis = <strong>% du tarif voyageur</strong> du trajet (arrondi à 100 FCFA), jamais en dessous du <strong>prix minimum</strong>, plus le <strong>prix au kilo</strong> si renseigné.
        Le prix est toujours recalculé par le serveur au dépôt.
      </p>
      {msg && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{msg}</div>}
      <div className="space-y-3">
        {cats.map((c, i) => (
          <div key={c.id} className="card grid sm:grid-cols-5 gap-3 items-end">
            <div className="sm:col-span-2">
              <p className="font-semibold text-night">{c.label}</p>
              <label className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                <input type="checkbox" checked={c.is_active} onChange={(e) => setCats((all) => all.map((x, j) => (j === i ? { ...x, is_active: e.target.checked } : x)))} /> Active
              </label>
            </div>
            {(["fare_percent", "min_price", "price_per_kg"] as const).map((k) => (
              <div key={k}>
                <label className="block text-xs text-gray-500 mb-1">{k === "fare_percent" ? "% tarif voyageur" : k === "min_price" ? "Prix minimum (FCFA)" : "Prix / kg (FCFA)"}</label>
                <input type="number" min={0} className="input-field" value={c[k]} onChange={(e) => setCats((all) => all.map((x, j) => (j === i ? { ...x, [k]: Number(e.target.value) } : x)))} />
              </div>
            ))}
            <div className="sm:col-span-5 text-right">
              <button onClick={() => save(c)} className="btn-primary text-sm px-4 py-2">Enregistrer</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
