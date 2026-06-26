"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { signOut } from "@/lib/auth";
import { BusFleetTab } from "@/components/BusFleetTab";
import { LinesTab } from "@/components/LinesTab";
import type { User } from "@supabase/supabase-js";

interface AgentProfile {
  id: string;
  full_name: string;
  role: "admin" | "agent";
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"reservations" | "bus" | "lignes" | "agents" | "stats">("reservations");

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
  const [newAgentRole, setNewAgentRole] = useState<"admin" | "agent">("agent");
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

    if (data) {
      setProfile(data as AgentProfile);
      // Charger les agents si admin
      if (data.role === "admin") {
        loadAgents();
      }
    }
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

      if (!agentData) {
        setLoginError("Ce compte n'a pas accès à l'espace agent. Contactez l'administrateur.");
        await supabase.auth.signOut();
        setLoginLoading(false);
        return;
      }

      setUser(data.user);
      setProfile(agentData as AgentProfile);
      if (agentData.role === "admin") {
        loadAgents();
      }
    }

    setLoginLoading(false);
  }

  async function handleAddAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;

    setAddingAgent(true);
    setAgentMessage("");

    try {
      // Créer le compte via l'API
      const response = await fetch("/api/create-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newAgentEmail,
          password: newAgentPassword,
          fullName: newAgentName,
          phone: newAgentPhone,
          role: newAgentRole,
          terminalId: newAgentTerminal || null,
        }),
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
              <span className="text-2xl">🔒</span>
            </div>
            <h1 className="text-xl font-bold text-night mb-2">Espace Agent</h1>
            <p className="text-sm text-gray-600">
              Connectez-vous avec votre compte agent pour accéder au dashboard.
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
            Seuls les comptes avec un rôle agent ou admin peuvent accéder ici.<br />
            Contactez votre administrateur si vous n&apos;avez pas d&apos;accès.
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
        <div>
          <h1 className="section-title">Dashboard Nzoko Transport</h1>
          <p className="text-gray-600 text-sm">
            Connecté en tant que <strong>{profile.full_name}</strong>
            <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
              profile.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
            }`}>
              {profile.role === "admin" ? "Administrateur" : "Agent"}
            </span>
          </p>
        </div>
        <button
          onClick={() => signOut()}
          className="text-sm text-gray-500 hover:text-red-600 transition-colors"
        >
          Déconnexion
        </button>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card text-center">
          <p className="text-3xl font-black text-night">0</p>
          <p className="text-xs text-gray-500">Réservations du jour</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-black text-accent-700">0 FCFA</p>
          <p className="text-xs text-gray-500">Revenus du jour</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-black text-yellow-600">0</p>
          <p className="text-xs text-gray-500">Paiements en attente</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-black text-green-600">{agents.length || 1}</p>
          <p className="text-xs text-gray-500">Agents actifs</p>
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
      <div className="flex gap-1 border-b mb-6 overflow-x-auto">
        {[
          { key: "reservations", label: "🎫 Réservations" },
          { key: "bus", label: "🚌 Flotte" },
          { key: "lignes", label: "🛣️ Lignes" },
          ...(profile.role === "admin" ? [{ key: "agents", label: "👥 Agents" }] : []),
          { key: "stats", label: "📊 Statistiques" },
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
      {activeTab === "reservations" && (
        <div className="card">
          <h2 className="font-bold text-night mb-4">Réservations récentes</h2>
          <div className="text-center py-8 text-gray-400">
            <div className="text-4xl mb-2">🎫</div>
            <p>Les réservations apparaîtront ici.</p>
            <p className="text-xs mt-2">
              Vous pourrez confirmer ou refuser les paiements Mobile Money.
            </p>
          </div>
        </div>
      )}

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
                  <input
                    type="tel"
                    value={newAgentPhone}
                    onChange={(e) => setNewAgentPhone(e.target.value)}
                    className="input-field"
                    placeholder="06 XXX XX XX"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe *</label>
                  <input
                    type="password"
                    value={newAgentPassword}
                    onChange={(e) => setNewAgentPassword(e.target.value)}
                    className="input-field"
                    placeholder="Minimum 6 caractères"
                    required
                    minLength={6}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                  <select
                    value={newAgentRole}
                    onChange={(e) => setNewAgentRole(e.target.value as "admin" | "agent")}
                    className="input-field"
                  >
                    <option value="agent">Agent (scanner, voir réservations)</option>
                    <option value="admin">Administrateur (accès complet)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Terminus assigné</label>
                  <select
                    value={newAgentTerminal}
                    onChange={(e) => setNewAgentTerminal(e.target.value)}
                    className="input-field"
                  >
                    <option value="">Tous (admin uniquement)</option>
                    <option value="chateau-deau">Château d&apos;eau — Brazzaville</option>
                    <option value="mpila">Mpila — Brazzaville</option>
                    <option value="mafouta">Mafouta — Brazzaville</option>
                    <option value="centre-ville">Centre-ville — Pointe-Noire</option>
                    <option value="nkouikou">Nkouikou — Pointe-Noire</option>
                    <option value="ngoyo">Ngoyo — Pointe-Noire</option>
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
                          {agent.phone || "Pas de téléphone"} •
                          <span className={`ml-1 ${agent.role === "admin" ? "text-purple-600" : "text-blue-600"}`}>
                            {agent.role === "admin" ? "Administrateur" : "Agent"}
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

      {activeTab === "stats" && (
        <div className="card text-center py-8">
          <div className="text-4xl mb-2">📊</div>
          <h2 className="font-bold text-night mb-2">Statistiques</h2>
          <p className="text-gray-500">
            Les statistiques (revenus, taux d&apos;occupation, trajets populaires) seront disponibles prochainement.
          </p>
        </div>
      )}

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
