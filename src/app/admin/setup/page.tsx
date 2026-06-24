"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Page de configuration initiale — à utiliser UNE SEULE FOIS
// pour créer le premier compte administrateur
export default function AdminSetupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/create-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          fullName,
          phone,
          role: "admin",
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError("Erreur de connexion.");
    }

    setLoading(false);
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="card text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✅</span>
          </div>
          <h1 className="text-xl font-bold text-night mb-2">Administrateur créé !</h1>
          <p className="text-sm text-gray-600 mb-6">
            Le compte admin <strong>{email}</strong> a été créé avec succès.
            Vous pouvez maintenant vous connecter à l&apos;espace agent.
          </p>
          <Link href="/admin" className="btn-primary inline-block">
            Se connecter →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="card">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-accent-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚙️</span>
          </div>
          <h1 className="text-xl font-bold text-night mb-2">Configuration initiale</h1>
          <p className="text-sm text-gray-600">
            Créez le premier compte administrateur pour Nzoko Transport.
            Ce compte aura un accès complet au système.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSetup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom complet *
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input-field"
              placeholder="Ex: Directeur Nzoko"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="admin@nzoko.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Téléphone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input-field"
              placeholder="06 XXX XX XX"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mot de passe *
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="Minimum 6 caractères"
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirmer le mot de passe *
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-field"
              placeholder="Retapez le mot de passe"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-accent w-full disabled:opacity-50"
          >
            {loading ? "Création..." : "🚀 Créer le compte administrateur"}
          </button>
        </form>

        <div className="mt-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-800">
            ⚠️ <strong>Important :</strong> Cette page ne doit être utilisée qu&apos;une seule fois,
            lors de la première configuration. Après, utilisez le dashboard pour ajouter d&apos;autres agents.
          </p>
        </div>
      </div>
    </div>
  );
}
