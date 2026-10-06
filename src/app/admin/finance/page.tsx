"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth-fetch";
import { formatXAF } from "@/lib/utils";
import { useNetwork } from "@/lib/network";
import { formatDateTime, todayBrazzaville, useAgent } from "@/lib/parcel-ui";
import { LogoIcon } from "@/components/Logo";
import { PhoneInput } from "@/components/PhoneInput";
import { displayPhone, isValidPhone } from "@/lib/phone";

interface AgencyReport {
  agency_id: string;
  agency_name: string;
  city: string;
  voyageurs: number;
  voyageurs_mtn: number;
  voyageurs_airtel: number;
  voyageurs_especes?: number;
  voyageurs_count: number;
  colis: number;
  colis_mtn: number;
  colis_airtel: number;
  colis_especes: number;
  colis_count: number;
  en_attente_count: number;
  en_attente_montant: number;
}

interface Account {
  id?: string;
  terminal_id: string;
  terminal_name?: string;
  city?: string;
  provider: "mtn" | "airtel";
  number: string;
  holder_name: string;
  is_active: boolean;
  is_demo?: boolean;
  updated_at?: string;
  updated_by?: string | null;
}

const PERIODS = [
  { key: "jour", label: "Aujourd'hui", days: 0 },
  { key: "7j", label: "7 jours", days: 6 },
  { key: "30j", label: "30 jours", days: 29 },
] as const;

const api = async (op: string, params: Record<string, unknown> = {}) => (await authFetch("/api/admin/finance", { op, ...params })).json();

export default function FinancePage() {
  const { agent, allTerminals, ready } = useAgent();
  const { cityLabel: cityName } = useNetwork();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("jour");
  const [report, setReport] = useState<{ scope: string; agencies: AgencyReport[]; non_attribues: { voyageurs: number; en_attente_count: number } | null } | null>(null);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [edit, setEdit] = useState<Account | null>(null);
  const [msg, setMsg] = useState("");

  const isCentral = agent && ["admin", "finance"].includes(agent.role);

  const loadReport = useCallback(async () => {
    const to = todayBrazzaville();
    const d = new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - PERIODS.find((p) => p.key === period)!.days);
    setReport(null);
    const r = await api("report", { from: d.toISOString().slice(0, 10), to });
    if (r.success) setReport(r.data);
    else setError(r.message || "Accès refusé.");
  }, [period]);

  const loadAccounts = useCallback(async () => {
    const r = await api("accounts");
    if (r.success) setAccounts(r.data ?? []);
  }, []);

  useEffect(() => {
    if (ready) {
      loadReport();
      loadAccounts();
    }
  }, [ready, loadReport, loadAccounts]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const r = await api("account_save", edit as any);
    setMsg(r.success ? "Compte enregistré (modification historisée)." : r.message || "Erreur.");
    if (r.success) setEdit(null);
    loadAccounts();
  }

  if (!ready || !agent) return <div className="max-w-6xl mx-auto px-4 py-12 text-center text-gray-400">Chargement…</div>;

  const totals = (report?.agencies ?? []).reduce(
    (t, a) => ({ v: t.v + a.voyageurs, c: t.c + a.colis, mtn: t.mtn + a.voyageurs_mtn + a.colis_mtn, airtel: t.airtel + a.voyageurs_airtel + a.colis_airtel, esp: t.esp + a.colis_especes, wait: t.wait + a.en_attente_count, waitAmt: t.waitAmt + a.en_attente_montant }),
    { v: 0, c: 0, mtn: 0, airtel: 0, esp: 0, wait: 0, waitAmt: 0 }
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-night rounded-xl flex items-center justify-center"><LogoIcon className="w-7 h-7" /></div>
          <div>
            <h1 className="section-title">Finance</h1>
            <p className="text-xs text-gray-500">{agent.full_name} · {isCentral ? "Nzoko central — tout le réseau" : agent.terminals ? `Agence ${agent.terminals.name}` : ""}</p>
          </div>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/admin/paiements" className="text-night underline">Paiements à vérifier</Link>
          <Link href="/admin" className="text-gray-500 hover:text-night">← Tableau de bord</Link>
        </div>
      </div>

      {error ? (
        <div className="card text-center text-red-600">{error}</div>
      ) : (
        <>
          <div className="flex gap-2 mb-4">
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)} className={`px-3 py-1.5 rounded-lg text-sm ${period === p.key ? "bg-night text-white" : "bg-white border border-gray-200"}`}>
                {p.label}
              </button>
            ))}
          </div>

          {!report ? (
            <div className="card text-center text-gray-400 animate-pulse">Chargement…</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="card"><p className="text-xs text-gray-500">🎫 Voyageurs</p><p className="text-xl font-black text-night">{formatXAF(totals.v)}</p></div>
                <div className="card"><p className="text-xs text-gray-500">📦 Colis</p><p className="text-xl font-black text-night">{formatXAF(totals.c)}</p></div>
                <div className="card"><p className="text-xs text-gray-500">MTN · Airtel · Espèces</p><p className="text-sm font-bold text-night">{formatXAF(totals.mtn)} · {formatXAF(totals.airtel)} · {formatXAF(totals.esp)}</p></div>
                <div className="card border-2 border-accent-500 bg-accent-50">
                  <p className="text-xs text-accent-900">{report.scope === "reseau" ? "Total réseau Nzoko" : "Total agence"}</p>
                  <p className="text-xl font-black text-accent-800">{formatXAF(totals.v + totals.c)}</p>
                  <p className="text-xs text-accent-900">{totals.wait} paiement(s) en attente · {formatXAF(totals.waitAmt)}</p>
                </div>
              </div>

              <div className="card overflow-x-auto mb-8">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="py-2">Agence</th>
                      <th className="text-right">Voyageurs</th>
                      <th className="text-right">dont MTN / Airtel / Guichet</th>
                      <th className="text-right">Colis</th>
                      <th className="text-right">dont MTN / Airtel / Espèces</th>
                      <th className="text-right">En attente</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.agencies.map((a) => (
                      <tr key={a.agency_id} className="border-b last:border-0">
                        <td className="py-2"><strong>{a.agency_name}</strong> <span className="text-xs text-gray-500">{a.city}</span></td>
                        <td className="text-right">{formatXAF(a.voyageurs)} <span className="text-xs text-gray-400">({a.voyageurs_count})</span></td>
                        <td className="text-right text-xs">{formatXAF(a.voyageurs_mtn)} / {formatXAF(a.voyageurs_airtel)} / {formatXAF(a.voyageurs_especes ?? 0)}</td>
                        <td className="text-right">{formatXAF(a.colis)} <span className="text-xs text-gray-400">({a.colis_count})</span></td>
                        <td className="text-right text-xs">{formatXAF(a.colis_mtn)} / {formatXAF(a.colis_airtel)} / {formatXAF(a.colis_especes)}</td>
                        <td className="text-right">{a.en_attente_count ? <span className="text-red-700 font-semibold">{a.en_attente_count} · {formatXAF(a.en_attente_montant)}</span> : "—"}</td>
                        <td className="text-right font-bold">{formatXAF(a.voyageurs + a.colis)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report.non_attribues && (report.non_attribues.voyageurs > 0 || report.non_attribues.en_attente_count > 0) && (
                  <p className="text-xs text-gray-500 mt-3">
                    Anciennes réservations sans agence : {formatXAF(report.non_attribues.voyageurs)} encaissés, {report.non_attribues.en_attente_count} en attente.
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Comptes de paiement des agences */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-night text-lg">Comptes Mobile Money des agences</h2>
        {isCentral && (
          <button onClick={() => setEdit({ terminal_id: allTerminals[0]?.id ?? "", provider: "mtn", number: "", holder_name: "", is_active: true, is_demo: false })} className="btn-primary text-sm px-4 py-2">
            + Ajouter un compte
          </button>
        )}
      </div>
      {!isCentral && <p className="text-sm text-gray-500 mb-3">Seul Nzoko central (admin ou Finance) peut modifier ces numéros.</p>}
      {msg && <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{msg}</div>}

      {edit && isCentral && (
        <form onSubmit={save} className="card grid md:grid-cols-6 gap-3 items-end mb-4 border-2 border-accent-500">
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Agence</label>
            <select className="input-field" value={edit.terminal_id} onChange={(e) => setEdit({ ...edit, terminal_id: e.target.value })}>
              {allTerminals.map((t) => (
                <option key={t.id} value={t.id}>{cityName(t.city_id)} — {t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Opérateur</label>
            <select className="input-field" value={edit.provider} onChange={(e) => setEdit({ ...edit, provider: e.target.value as "mtn" | "airtel" })}>
              <option value="mtn">MTN MoMo</option>
              <option value="airtel">Airtel Money</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Numéro</label>
            <PhoneInput value={edit.number} onChange={(v) => setEdit({ ...edit, number: v })} required placeholder={edit.provider === "airtel" ? "05 123 45 67" : "06 123 45 67"} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Titulaire</label>
            <input className="input-field" value={edit.holder_name} onChange={(e) => setEdit({ ...edit, holder_name: e.target.value })} required />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> Actif</label>
            <label className="text-xs flex items-center gap-1 text-red-700" title="Jamais montré au public ; réservations exclues des revenus">
              <input type="checkbox" checked={!!edit.is_demo} onChange={(e) => setEdit({ ...edit, is_demo: e.target.checked })} /> Démo
            </label>
            <button disabled={!isValidPhone(edit.number)} className="btn-accent text-sm px-3 py-2 disabled:opacity-50">Enregistrer</button>
            <button type="button" onClick={() => setEdit(null)} className="text-sm text-gray-500">Annuler</button>
          </div>
        </form>
      )}

      {accounts.length === 0 ? (
        <div className="card text-center text-gray-500">
          Aucun compte configuré : le paiement en ligne s&apos;affiche « non encore activé » ; la vente au guichet reste possible.
          <span className="block text-xs mt-1">Cochez « Démo » pour un compte de test : il n&apos;est montré qu&apos;à l&apos;administrateur connecté et ses réservations sont exclues des revenus.</span>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2">Agence</th><th>Opérateur</th><th>Numéro</th><th>Titulaire</th><th>État</th><th>Dernière modification</th><th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-2">{a.terminal_name} <span className="text-xs text-gray-500">{a.city}</span></td>
                  <td>{a.provider === "mtn" ? "MTN MoMo" : "Airtel Money"}</td>
                  <td className="font-mono">{displayPhone(a.number)}</td>
                  <td>{a.holder_name}</td>
                  <td>
                    {a.is_active ? <span className="text-green-700">Actif</span> : <span className="text-gray-400">Inactif</span>}
                    {a.is_demo && <span className="ml-2 text-xs font-bold text-red-600">DÉMO — non public</span>}
                  </td>
                  <td className="text-xs text-gray-500">{a.updated_at ? formatDateTime(a.updated_at) : ""}{a.updated_by ? ` · ${a.updated_by}` : ""}</td>
                  <td className="text-right">{isCentral && <button onClick={() => setEdit(a)} className="text-xs underline">Modifier</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
