"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { refreshNetwork } from "@/lib/network";

interface City {
  id: string;
  name: string;
}

interface Terminal {
  id: string;
  name: string;
  city_id: string;
  address: string | null;
  is_active: boolean;
}

// Identifiant technique d'une agence : lettres minuscules et tirets uniquement
function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Agences (table terminals) : création, renommage, activation — administrateur uniquement
// (les droits d'écriture sont vérifiés par la base). Une nouvelle agence apparaît
// aussitôt dans la recherche, les formulaires et la finance, sans redéploiement.
export function AgenciesTab({ onChange }: { onChange?: () => void }) {
  const [cities, setCities] = useState<City[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [cityId, setCityId] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!supabase) return;
    const [c, t] = await Promise.all([
      supabase.from("cities").select("id, name").eq("is_active", true).order("name"),
      supabase.from("terminals").select("id, name, city_id, address, is_active").order("name"),
    ]);
    setCities(c.data ?? []);
    setTerminals((t.data ?? []) as Terminal[]);
  }

  useEffect(() => {
    load();
  }, []);

  function changed(text: string) {
    setMsg({ ok: true, text });
    refreshNetwork();
    onChange?.();
    load();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !cityId || name.trim().length < 2) return;
    let id = slugify(name);
    if (terminals.some((t) => t.id === id)) id = slugify(`${name}-${cityId}`);
    if (!id || terminals.some((t) => t.id === id)) {
      setMsg({ ok: false, text: "Une agence porte déjà ce nom : choisissez un autre nom." });
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("terminals")
      .insert({ id, name: name.trim(), city_id: cityId, address: address.trim() || null, is_active: true });
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: "Création impossible (droits administrateur requis)." });
      return;
    }
    setName("");
    setAddress("");
    changed(`Agence « ${name.trim()} » créée. Elle apparaît dès maintenant dans la recherche et les formulaires.`);
  }

  async function toggle(t: Terminal) {
    if (!supabase) return;
    if (t.is_active && !confirm(`Désactiver l'agence ${t.name} ? Elle ne sera plus proposée aux voyageurs ni dans les formulaires. Rien n'est supprimé.`)) return;
    const { error } = await supabase.from("terminals").update({ is_active: !t.is_active }).eq("id", t.id);
    if (error) setMsg({ ok: false, text: "Modification impossible (droits administrateur requis)." });
    else changed(`Agence ${t.name} ${t.is_active ? "désactivée" : "réactivée"}.`);
  }

  async function rename(t: Terminal) {
    if (!supabase) return;
    const value = prompt("Nouveau nom de l'agence :", t.name);
    if (!value || value.trim().length < 2 || value.trim() === t.name) return;
    const { error } = await supabase.from("terminals").update({ name: value.trim() }).eq("id", t.id);
    if (error) setMsg({ ok: false, text: "Modification impossible (droits administrateur requis)." });
    else changed(`Agence renommée en « ${value.trim()} ».`);
  }

  const cityName = (id: string) => cities.find((c) => c.id === id)?.name ?? id;
  const byCity = Array.from(new Set(terminals.map((t) => t.city_id))).sort((a, b) => cityName(a).localeCompare(cityName(b)));

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`p-3 rounded-lg text-sm border ${msg.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
          {msg.text}
        </div>
      )}

      <div className="card border-2 border-accent-400">
        <h3 className="font-bold text-night mb-1">Nouvelle agence</h3>
        <p className="text-xs text-gray-500 mb-4">
          Ensuite : rattachez-y du personnel (onglet Personnel) et ajoutez ses numéros MTN / Airtel (page Finance).
        </p>
        <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ville *</label>
            <select className="input-field" value={cityId} onChange={(e) => setCityId(e.target.value)} required>
              <option value="">Choisir…</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l&apos;agence *</label>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Dolisie Centre" required minLength={2} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
            <input className="input-field" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Facultatif" />
          </div>
          <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
            {busy ? "Création…" : "Créer l'agence"}
          </button>
        </form>
      </div>

      <div className="card">
        <h3 className="font-bold text-night mb-4">Agences du réseau ({terminals.filter((t) => t.is_active).length} actives)</h3>
        <div className="space-y-4">
          {byCity.map((c) => (
            <div key={c}>
              <p className="text-sm font-semibold text-gray-500 mb-2">{cityName(c)}</p>
              <div className="space-y-2">
                {terminals.filter((t) => t.city_id === c).map((t) => (
                  <div key={t.id} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${t.is_active ? "border-gray-200" : "border-gray-200 bg-gray-50 opacity-60"}`}>
                    <div>
                      <p className="font-medium text-night">{t.name}</p>
                      <p className="text-xs text-gray-400">{t.address || "Adresse non renseignée"}{t.is_active ? "" : " · désactivée"}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => rename(t)} className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-100">Renommer</button>
                      <button
                        onClick={() => toggle(t)}
                        className={`text-xs px-3 py-1 rounded border ${t.is_active ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"}`}
                      >
                        {t.is_active ? "Désactiver" : "Réactiver"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
