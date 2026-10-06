"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/auth-fetch";
import { signOut } from "@/lib/auth";
import { BusFleetTab } from "@/components/BusFleetTab";
import { LinesTab } from "@/components/LinesTab";
import type { User } from "@supabase/supabase-js";
import { LogoIcon } from "@/components/Logo";
import { RevenueSummary } from "@/components/RevenueSummary";
import { PhoneInput } from "@/components/PhoneInput";
import { isValidPhone, normalizePhone, displayPhone } from "@/lib/phone";
import { formatXAF } from "@/lib/utils";
import { AgenciesTab } from "@/components/AgenciesTab";
import { RecentBookings } from "@/components/RecentBookings";

const ROLE_LABEL: Record<string, string> = { admin: "Administrateur", finance: "Finance", manager: "Responsable d'agence", agent: "Agent" };

interface AgentProfile {
  id: string;
  full_name: string;
  role: "admin" | "finance" | "manager" | "agent";
  phone: string | null;
  is_active: boolean;
  created_at: string;
  terminal_id?: string | null;
}

interface Dashboard {
  bookings_today: number;
  pending_payments: number;
  parcels_today: number;
  revenue_today: number | null;
  active_staff: number | null;
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"reservations" | "bus" | "lignes" | "agences" | "agents" | "stats" | "settings">("reservations");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [terminals, setTerminals] = useState<{ id: string; name: string; city_id: string; is_active: boolean }[]>([]);

  // Login states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Agent management states
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [newAgentEmail, setNewAgentEmail] = useState("");
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentPhone, setNewAgentPhone] = useState("");
  const [newAgentRole, setNewAgentRole] = useState<"admin" | "finance" | "manager" | "agent">("agent");
  const [newAgentTerminal, setNewAgentTerminal] = useState("");
  const [newAgentPassword, setNewAgentPassword] = useState("");
  const [addingAgent, setAddingAgent] = useState(false);
  const [agentMessage, setAgentMessage] = useState("");

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      await loadProfile(session.user.id);
    }
    setLoading(false);

    // Écouter les changements
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user);
        await loadProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
      }
    });
  }

  async function loadProfile(userId: string) {
    if (!supabase) return;
    const { data } = await supabase
      .from("agent_profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (data && data.is_active) {
      setProfile(data as AgentProfile);
      loadDashboard();
      loadTerminals();
      if (data.role === "admin") {
        loadAgents();
      }
    } else {
      setProfile(null);
    }
  }

  async function loadDashboard() {
    const res = await authFetch("/api/admin/finance", { op: "dashboard" });
    const json = await res.json().catch(() => null);
    if (json?.success) setDashboard(json.data);
  }

  async function loadTerminals() {
    if (!supabase) return;
    const { data } = await supabase.from("terminals").select("id, name, city_id, is_active").order("city_id").order("name");
    if (data) setTerminals(data);
  }

  async function loadAgents() {
    if (!supabase) return;
    const { data } = await supabase
      .from("agent_profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      setAgents(data as AgentProfile[]);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setLoginError("Supabase non configuré.");
      return;
    }

    setLoginLoading(true);
    setLoginError("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoginError("Email ou mot de passe incorrect.");
      setLoginLoading(false);
      return;
    }

    // Vérifier que c'est bien un agent/admin
    if (data.user) {
      const { data: agentData } = await supabase
        .from("agent_profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (!agentData || !agentData.is_active) {
        setLoginError("Ce compte n'a pas accès à l'espace du personnel. Contactez l'administrateur.");
        await supabase.auth.signOut();
        setLoginLoading(false);
        return;
      }

      setUser(data.user);
      setProfile(agentData as AgentProfile);
      loadDashboard();
      loadTerminals();
      if (agentData.role === "admin") {
        loadAgents();
      }
    }

    setLoginLoading(false);
  }

  async function handleAddAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (newAgentPhone && !isValidPhone(newAgentPhone)) {
      setAgentMessage("❌ Numéro de téléphone invalide (+242 05 ou 06).");
      return;
    }

    setAddingAgent(true);
    setAgentMessage("");

    try {
      // Créer le compte via l'API
      const response = await authFetch("/api/create-agent", {
        email: newAgentEmail,
        password: newAgentPassword,
        fullName: newAgentName,
        phone: newAgentPhone,
        role: newAgentRole,
        terminalId: newAgentTerminal || null,
      });

      const result = await response.json();

      if (result.success) {
        setAgentMessage(`✅ Agent "${newAgentName}" créé avec succès !`);
        setNewAgentEmail("");
        setNewAgentName("");
        setNewAgentPhone("");
        setNewAgentPassword("");
        setShowAddAgent(false);
        loadAgents();
      } else {
        setAgentMessage(`❌ Erreur : ${result.message}`);
      }
    } catch (err) {
      setAgentMessage("❌ Erreur de connexion.");
    }

    setAddingAgent(false);
  }

  async function toggleAgentStatus(agentId: string, currentActive: boolean) {
    if (!supabase) return;
    await supabase
      .from("agent_profiles")
      .update({ is_active: !currentActive })
      .eq("id", agentId);
    loadAgents();
  }

  async function changeAgentRole(agentId: string, newRole: "admin" | "agent") {
    if (!supabase) return;
    await supabase
      .from("agent_profiles")
      .update({ role: newRole })
      .eq("id", agentId);
    loadAgents();
  }

  // Loading state
  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="animate-pulse text-gray-400">Chargement...</div>
      </div>
    );
  }

  // Login form (si pas connecté ou pas d'accès agent)
  if (!user || !profile) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="card">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-night rounded-full flex items-center justify-center mx-auto mb-4">
              <LogoIcon className="w-10 h-10" />
            </div>
            <h1 className="text-xl font-bold text-night mb-2">Connexion du personnel Nzoko</h1>
            <p className="text-sm text-gray-600">
              Accès réservé au personnel des agences, sur identifiants fournis par la direction.
            </p>
          </div>

          {loginError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="agent@nzoko.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loginLoading}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loginLoading ? "Connexion..." : "Se connecter"}
            </button>
          </form>

          <p className="text-xs text-gray-400 mt-6 text-center">
            Vous êtes voyageur ? <Link href="/mes-reservations" className="underline">Retrouvez vos réservations</Link>.
          </p>
        </div>
      </div>
    );
  }

  // Dashboard principal
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header admin */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-night rounded-xl flex items-center justify-center shrink-0">
            <LogoIcon className="w-8 h-8" />
          </div>
          <div>
          <h1 className="section-title">Tableau de bord Nzoko Transport</h1>
          <p className="text-gray-600 text-sm">
            Connecté en tant que <strong>{profile.full_name}</strong>
            <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
              profile.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
            }`}>
              {ROLE_LABEL[profile.role] ?? profile.role}
            </span>
          </p>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="text-sm text-gray-500 hover:text-red-600 transition-colors"
        >
          Déconnexion
        </button>
      </div>

      {/* Chiffres réels du périmètre (réseau, ou agence de la personne connectée) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card text-center">
          <p className="text-3xl font-black text-night">{dashboard ? dashboard.bookings_today : "…"}</p>
          <p className="text-xs text-gray-500">Réservations du jour</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl sm:text-3xl font-black text-accent-700">
            {dashboard ? (dashboard.revenue_today === null ? "—" : formatXAF(dashboard.revenue_today)) : "…"}
          </p>
          <p className="text-xs text-gray-500">{dashboard?.revenue_today === null ? "Revenus (réservé aux responsables)" : "Encaissé aujourd'hui"}</p>
        </div>
        <Link href="/admin/paiements" className="card text-center hover:shadow-lg transition-shadow">
          <p className="text-3xl font-black text-yellow-600">{dashboard ? dashboard.pending_payments : "…"}</p>
          <p className="text-xs text-gray-500">Paiements à vérifier</p>
        </Link>
        <div className="card text-center">
          <p className="text-3xl font-black text-green-600">
            {dashboard ? (dashboard.active_staff ?? dashboard.parcels_today) : "…"}
          </p>
          <p className="text-xs text-gray-500">{dashboard?.active_staff != null ? "Comptes du personnel actifs" : "Colis déposés aujourd'hui"}</p>
        </div>
      </div>

      {/* Bouton Scanner QR */}
      <div className="mb-8">
        <Link
          href="/admin/scanner"
          className="block card bg-gradient-to-r from-night to-night-light text-white hover:opacity-90 transition-opacity"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-accent-500 rounded-xl flex items-center justify-center">
                <span className="text-3xl">📷</span>
              </div>
              <div>
                <h3 className="font-bold text-lg">Scanner un billet</h3>
                <p className="text-sm text-gray-300">Valider le QR code d&apos;un passager avant l&apos;embarquement</p>
              </div>
            </div>
            <span className="text-2xl">→</span>
          </div>
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <Link href="/admin/guichet" className="card flex items-center gap-3 hover:shadow-lg transition-shadow border-l-4 border-l-green-600">
          <span className="text-3xl">💵</span>
          <span>
            <span className="block font-bold text-night">Vente au guichet</span>
            <span className="text-xs text-gray-500">Billet payé en espèces : départ, siège, passager, billet</span>
          </span>
        </Link>
        <Link href="/admin/colis/departs" className="card flex items-center gap-3 hover:shadow-lg transition-shadow border-l-4 border-l-night">
          <span className="text-3xl">🚌</span>
          <span>
            <span className="block font-bold text-night">Départs du jour</span>
            <span className="text-xs text-gray-500">Bus, retards, annulations, passagers et colis</span>
          </span>
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mb-6 -mt-3">
        <Link href="/admin/colis" className="card flex items-center gap-3 hover:shadow-lg transition-shadow border-l-4 border-l-accent-500">
          <span className="text-3xl">📦</span>
          <span>
            <span className="block font-bold text-night">Colis</span>
            <span className="text-xs text-gray-500">Dépôt, affectation, chargement, réception, retrait</span>
          </span>
        </Link>
        <Link href="/admin/paiements" className="card flex items-center gap-3 hover:shadow-lg transition-shadow border-l-4 border-l-green-600">
          <span className="text-3xl">💳</span>
          <span>
            <span className="block font-bold text-night">Paiements à vérifier</span>
            <span className="text-xs text-gray-500">Confirmer / refuser les paiements MTN et Airtel de votre agence</span>
          </span>
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mb-6 -mt-3">
        {["admin", "finance", "manager"].includes(profile.role) && (
          <Link href="/admin/finance" className="card flex items-center gap-3 hover:shadow-lg transition-shadow border-l-4 border-l-accent-700">
            <span className="text-3xl">📊</span>
            <span>
              <span className="block font-bold text-night">Finance</span>
              <span className="text-xs text-gray-500">Revenus par agence, MTN / Airtel, comptes de paiement</span>
            </span>
          </Link>
        )}
      </div>
      <div className="flex gap-1 border-b mb-6 overflow-x-auto">
        {[
          { key: "reservations", label: "🎫 Réservations" },
          { key: "bus", label: "🚌 Flotte" },
          { key: "lignes", label: "🛣️ Lignes" },
          ...(profile.role === "admin" ? [{ key: "agences", label: "🏢 Agences" }, { key: "agents", label: "👥 Personnel" }] : []),
          ...(["admin", "finance"].includes(profile.role) ? [{ key: "stats", label: "📊 Statistiques" }] : []),
          ...(profile.role === "admin" ? [{ key: "settings", label: "⚙️ Paramètres" }] : []),
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
      {activeTab === "reservations" && <RecentBookings />}

      {activeTab === "agences" && profile.role === "admin" && <AgenciesTab onChange={loadTerminals} />}

      {activeTab === "bus" && (
        <BusFleetTab isAdmin={profile.role === "admin"} />
      )}

      {activeTab === "lignes" && (
        <LinesTab isAdmin={profile.role === "admin"} />
      )}

      {/* Onglet Agents — admin uniquement */}
      {activeTab === "agents" && profile.role === "admin" && (
        <div className="space-y-6">
          {/* Message */}
          {agentMessage && (
            <div className={`p-3 rounded-lg text-sm ${agentMessage.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {agentMessage}
            </div>
          )}

          {/* Bouton ajouter */}
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-night text-lg">Gestion des agents</h2>
            <button
              onClick={() => setShowAddAgent(!showAddAgent)}
              className="btn-accent text-sm px-4 py-2"
            >
              {showAddAgent ? "Annuler" : "+ Nouvel agent"}
            </button>
          </div>

          {/* Formulaire d'ajout */}
          {showAddAgent && (
            <div className="card border-2 border-accent-400">
              <h3 className="font-bold text-night mb-4">Créer un compte agent</h3>
              <form onSubmit={handleAddAgent} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet *</label>
                  <input
                    type="text"
                    value={newAgentName}
                    onChange={(e) => setNewAgentName(e.target.value)}
                    className="input-field"
                    placeholder="Jean Makaya"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={newAgentEmail}
                    onChange={(e) => setNewAgentEmail(e.target.value)}
                    className="input-field"
                    placeholder="agent@nzoko.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
                  <PhoneInput value={newAgentPhone} onChange={(v) => setNewAgentPhone(v)} placeholder="06 123 45 67" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe *</label>
                  <input
                    type="password"
                    value={newAgentPassword}
                    onChange={(e) => setNewAgentPassword(e.target.value)}
                    className="input-field"
                    placeholder="Minimum 8 caractères"
                    required
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                  <select
                    value={newAgentRole}
                    onChange={(e) => setNewAgentRole(e.target.value as typeof newAgentRole)}
                    className="input-field"
                  >
                    <option value="agent">Agent d&apos;agence (guichet, scanner, paiements de son agence)</option>
                    <option value="manager">Responsable d&apos;agence (+ rapport financier de son agence)</option>
                    <option value="finance">Finance Nzoko central (comptes de paiement, tout le réseau)</option>
                    <option value="admin">Administrateur central (accès complet)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Agence</label>
                  <select
                    value={newAgentTerminal}
                    onChange={(e) => setNewAgentTerminal(e.target.value)}
                    className="input-field"
                  >
                    <option value="">Aucune (administrateur / Finance central)</option>
                    {terminals.filter((t) => t.is_active).map((t) => (
                      <option key={t.id} value={t.id}>{t.name} — {t.city_id}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={addingAgent}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    {addingAgent ? "Création..." : "Créer l'agent"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Liste des agents */}
          <div className="card">
            <h3 className="font-bold text-night mb-4">Agents enregistrés ({agents.length})</h3>

            {agents.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <p>Aucun agent enregistré. Créez le premier agent ci-dessus.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {agents.map((agent) => (
                  <div key={agent.id} className={`flex items-center justify-between p-4 rounded-lg border ${agent.is_active ? "bg-white border-gray-200" : "bg-gray-50 border-gray-200 opacity-60"}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${agent.role === "admin" ? "bg-purple-500" : "bg-blue-500"}`}>
                        {agent.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-night">{agent.full_name}</p>
                        <p className="text-xs text-gray-500">
                          {agent.phone ? displayPhone(agent.phone) : "Pas de téléphone"} •
                          {" "}{agent.terminal_id ? `Agence ${terminals.find((t) => t.id === agent.terminal_id)?.name ?? agent.terminal_id} • ` : ""}
                          <span className={`ml-1 ${agent.role === "admin" ? "text-purple-600" : "text-blue-600"}`}>
                            {ROLE_LABEL[agent.role] ?? agent.role}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Actions (pas sur soi-même) */}
                    {agent.id !== profile.id && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => changeAgentRole(agent.id, agent.role === "admin" ? "agent" : "admin")}
                          className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 transition-colors"
                          title="Changer le rôle"
                        >
                          {agent.role === "admin" ? "→ Agent" : "→ Admin"}
                        </button>
                        <button
                          onClick={() => toggleAgentStatus(agent.id, agent.is_active)}
                          className={`text-xs px-3 py-1 rounded transition-colors ${
                            agent.is_active
                              ? "border border-red-200 text-red-600 hover:bg-red-50"
                              : "border border-green-200 text-green-600 hover:bg-green-50"
                          }`}
                        >
                          {agent.is_active ? "Désactiver" : "Réactiver"}
                        </button>
                      </div>
                    )}

                    {agent.id === profile.id && (
                      <span className="text-xs text-gray-400">(vous)</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "stats" && ["admin", "finance"].includes(profile.role) && <RevenueSummary />}

      {activeTab === "settings" && profile.role === "admin" && (
        <div className="card text-center py-8">
          <div className="text-4xl mb-2">⚙️</div>
          <h2 className="font-bold text-night mb-2">Paramètres</h2>
          <p className="text-gray-500 mb-4">
            Configurez les numéros Mobile Money, le nom de l&apos;entreprise, et les coordonnées.
          </p>
          <Link href="/admin/settings" className="btn-primary inline-block">
            Ouvrir les paramètres →
          </Link>
        </div>
      )}
    </div>
  );
}
