"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatXAF } from "@/lib/utils";
import { cityName } from "@/lib/cities";
import { colisApi, openParcelPdf, useAgent, todayBrazzaville } from "@/lib/parcel-ui";
import { ParcelList, type ParcelRow } from "@/components/colis/ParcelList";
import { ParcelNav } from "@/components/colis/ParcelNav";

const TABS = [
  { key: "nouveau", label: "➕ Nouveau colis" },
  { key: "jour", label: "Colis du jour" },
  { key: "a_affecter", label: "À affecter" },
  { key: "a_charger", label: "À charger" },
  { key: "en_transit", label: "En transit" },
  { key: "arrives", label: "Arrivés" },
  { key: "a_retirer", label: "À retirer" },
  { key: "retires", label: "Retirés" },
  { key: "incidents", label: "Incidents" },
  { key: "recherche", label: "🔍 Recherche" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface Category {
  id: string;
  label: string;
  requires_weight: boolean;
  max_weight_kg: number | null;
  is_active: boolean;
}

const EMPTY = {
  sender_name: "",
  sender_phone: "",
  recipient_name: "",
  recipient_phone: "",
  from_terminal: "",
  to_terminal: "",
  category_id: "petit",
  description: "",
  quantity: "1",
  weight_kg: "",
  declared_value: "",
  notes: "",
  payer: "expediteur",
  method: "especes",
  transaction_code: "",
};

export default function ColisPage() {
  const { agent, allTerminals, ready } = useAgent();
  const [tab, setTab] = useState<TabKey>("nouveau");
  const [rows, setRows] = useState<ParcelRow[] | null>(null);
  const [query, setQuery] = useState("");

  const loadList = useCallback(async (filter: TabKey, q = "") => {
    setRows(null);
    const res = await colisApi<ParcelRow[]>("list", { filter, query: q, date: todayBrazzaville() });
    setRows(res.success ? res.data ?? [] : []);
  }, []);

  useEffect(() => {
    if (ready && tab !== "nouveau" && tab !== "recherche") loadList(tab);
    if (tab === "recherche") setRows([]);
  }, [tab, ready, loadList]);

  if (!ready || !agent) return <div className="max-w-5xl mx-auto px-4 py-12 text-center text-gray-400">Chargement…</div>;

  const agencyLabel = agent.terminals ? `Agence ${agent.terminals.name}` : agent.role === "admin" ? "Administrateur — toutes agences" : "Toutes agences";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <ParcelNav title="Colis" agentLabel={`${agent.full_name} · ${agencyLabel}`} isAdmin={agent.role === "admin"} />

      <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${tab === t.key ? "bg-accent-500 text-night" : "bg-white border border-gray-200 text-gray-700 hover:border-accent-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "nouveau" ? (
        <NewParcelForm agentTerminal={agent.terminal_id} terminals={allTerminals} onCreated={() => {}} />
      ) : tab === "recherche" ? (
        <div className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadList("recherche", query);
            }}
            className="card flex gap-2"
          >
            <input value={query} onChange={(e) => setQuery(e.target.value)} className="input-field flex-1" placeholder="Référence NZK-C-…, téléphone ou nom" />
            <button className="btn-primary">Rechercher</button>
          </form>
          <ParcelList rows={rows} empty="Aucun colis trouvé." />
        </div>
      ) : (
        <ParcelList rows={rows} empty="Aucun colis dans cette catégorie." />
      )}
    </div>
  );
}

function NewParcelForm({ agentTerminal, terminals }: { agentTerminal: string | null; terminals: { id: string; name: string; city_id: string }[]; onCreated: () => void }) {
  const [form, setForm] = useState({ ...EMPTY, from_terminal: agentTerminal ?? "" });
  const [categories, setCategories] = useState<Category[]>([]);
  const [quote, setQuote] = useState<{ price?: number; message?: string } | null>(null);
  const [more, setMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ id: string; reference: string; pickup_code: string; price: number } | null>(null);

  useEffect(() => {
    colisApi<Category[]>("categories").then((r) => r.success && setCategories((r.data ?? []).filter((c) => c.is_active)));
  }, []);

  const fromCity = terminals.find((t) => t.id === form.from_terminal)?.city_id;
  const toCity = terminals.find((t) => t.id === form.to_terminal)?.city_id;
  const category = categories.find((c) => c.id === form.category_id);
  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Tarif officiel calculé par le serveur (affichage) ; recalculé à l'enregistrement
  useEffect(() => {
    if (!fromCity || !toCity || !form.category_id) {
      setQuote(null);
      return;
    }
    const t = setTimeout(async () => {
      const r = await colisApi("quote", { category_id: form.category_id, from_city: fromCity, to_city: toCity, weight_kg: form.weight_kg, quantity: form.quantity });
      setQuote(r.success ? { price: r.data.price } : { message: r.message });
    }, 250);
    return () => clearTimeout(t);
  }, [fromCity, toCity, form.category_id, form.weight_kg, form.quantity]);

  const destinations = useMemo(() => terminals.filter((t) => t.city_id !== fromCity), [terminals, fromCity]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const r = await colisApi("create", { parcel: form });
    setSubmitting(false);
    if (!r.success) {
      setError(r.message || "Erreur lors de l'enregistrement.");
      return;
    }
    setCreated(r.data);
  }

  if (created) {
    return (
      <div className="card border-2 border-accent-500 text-center">
        <p className="text-sm text-gray-600">Colis enregistré</p>
        <p className="font-mono text-2xl font-bold text-night mt-1">{created.reference}</p>
        <p className="text-accent-700 font-bold mt-1">{formatXAF(created.price)}</p>
        <div className="mt-5 bg-night text-white rounded-xl p-4 max-w-sm mx-auto">
          <p className="text-xs text-gray-300">CODE SECRET DE RETRAIT — à remettre à l&apos;expéditeur</p>
          <p className="font-mono text-4xl font-bold text-accent-500 tracking-widest mt-1">{created.pickup_code.replace(/(\d{3})(\d{3})/, "$1 $2")}</p>
          <p className="text-[11px] text-gray-400 mt-1">Il figure sur le reçu. Il ne pourra plus être réaffiché ensuite.</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center mt-5">
          <button onClick={() => openParcelPdf("receipt", created.id, created.pickup_code)} className="btn-accent">🧾 Imprimer le reçu</button>
          <button onClick={() => openParcelPdf("label", created.id)} className="btn-primary">🏷️ Imprimer l&apos;étiquette</button>
          <Link href={`/admin/colis/${created.id}`} className="btn-outline">Voir le colis</Link>
          <button
            onClick={() => {
              setCreated(null);
              setForm({ ...EMPTY, from_terminal: form.from_terminal });
            }}
            className="btn-outline"
          >
            ➕ Nouveau colis
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <h3 className="font-bold text-night">Expéditeur</h3>
          <input className="input-field" placeholder="Nom complet" value={form.sender_name} onChange={(e) => set("sender_name", e.target.value)} required maxLength={120} />
          <input className="input-field" placeholder="Téléphone" type="tel" value={form.sender_phone} onChange={(e) => set("sender_phone", e.target.value)} required maxLength={30} />
        </div>
        <div className="card space-y-3">
          <h3 className="font-bold text-night">Destinataire</h3>
          <input className="input-field" placeholder="Nom complet" value={form.recipient_name} onChange={(e) => set("recipient_name", e.target.value)} required maxLength={120} />
          <input className="input-field" placeholder="Téléphone" type="tel" value={form.recipient_phone} onChange={(e) => set("recipient_phone", e.target.value)} required maxLength={30} />
        </div>
      </div>

      <div className="card grid md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Agence de départ</label>
          <select className="input-field" value={form.from_terminal} onChange={(e) => set("from_terminal", e.target.value)} required disabled={!!agentTerminal}>
            <option value="">Choisir…</option>
            {terminals.map((t) => (
              <option key={t.id} value={t.id}>{cityName(t.city_id)} — {t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Agence d&apos;arrivée (retrait)</label>
          <select className="input-field" value={form.to_terminal} onChange={(e) => set("to_terminal", e.target.value)} required>
            <option value="">Choisir…</option>
            {destinations.map((t) => (
              <option key={t.id} value={t.id}>{cityName(t.city_id)} — {t.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
            <select className="input-field" value={form.category_id} onChange={(e) => set("category_id", e.target.value)} required>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantité</label>
            <input className="input-field" type="number" min={1} max={100} value={form.quantity} onChange={(e) => set("quantity", e.target.value)} required />
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description courte</label>
            <input className="input-field" placeholder="Ex : carton de vêtements" value={form.description} onChange={(e) => set("description", e.target.value)} required maxLength={200} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Poids (kg){category?.requires_weight ? " *" : ""}</label>
            <input className="input-field" type="number" min={0} step="0.1" value={form.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} required={!!category?.requires_weight} />
          </div>
        </div>
        <button type="button" onClick={() => setMore((m) => !m)} className="text-sm text-night underline">
          {more ? "Masquer" : "Valeur déclarée, observations…"}
        </button>
        {more && (
          <div className="grid md:grid-cols-2 gap-3">
            <input className="input-field" type="number" min={0} placeholder="Valeur déclarée (FCFA)" value={form.declared_value} onChange={(e) => set("declared_value", e.target.value)} />
            <input className="input-field" placeholder="Observations (fragile, etc.)" value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-night">Paiement du transport</h3>
          <p className="text-2xl font-black text-accent-700">
            {quote?.price != null ? formatXAF(quote.price) : <span className="text-sm text-gray-400 font-normal">{quote?.message ?? "Tarif calculé automatiquement"}</span>}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["expediteur", "L'expéditeur paie maintenant"],
            ["destinataire", "Le destinataire paie au retrait"],
          ].map(([v, l]) => (
            <button key={v} type="button" onClick={() => set("payer", v)} className={`p-3 rounded-lg border-2 text-sm font-medium ${form.payer === v ? "border-accent-500 bg-accent-50" : "border-gray-200"}`}>
              {l}
            </button>
          ))}
        </div>
        {form.payer === "expediteur" && (
          <div className="grid md:grid-cols-2 gap-3">
            <select className="input-field" value={form.method} onChange={(e) => set("method", e.target.value)}>
              <option value="especes">Espèces</option>
              <option value="mtn">MTN MoMo</option>
              <option value="airtel">Airtel Money</option>
            </select>
            {form.method !== "especes" && (
              <input className="input-field font-mono" placeholder="Code de transaction" value={form.transaction_code} onChange={(e) => set("transaction_code", e.target.value)} required maxLength={60} />
            )}
          </div>
        )}
      </div>

      <div className="text-center">
        <button type="submit" disabled={submitting || quote?.price == null} className="btn-accent text-lg px-10 disabled:opacity-50">
          {submitting ? "Enregistrement…" : "✅ Enregistrer le colis"}
        </button>
      </div>
    </form>
  );
}
