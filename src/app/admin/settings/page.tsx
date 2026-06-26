"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

interface CompanySettings {
  id?: string;
  name: string;
  slogan: string;
  phone_mtn: string;
  phone_airtel: string;
  email: string;
  address: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<CompanySettings>({
    name: "Nzoko Transport",
    slogan: "Voyagez en toute sécurité avec Nzoko",
    phone_mtn: "",
    phone_airtel: "",
    email: "",
    address: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("company")
      .select("*")
      .limit(1)
      .single();

    if (data) {
      setSettings({
        id: data.id,
        name: data.name || "Nzoko Transport",
        slogan: data.slogan || "",
        phone_mtn: data.phone_mtn || "",
        phone_airtel: data.phone_airtel || "",
        email: data.email || "",
        address: data.address || "",
      });
    }
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setMessage("❌ Supabase non configuré.");
      return;
    }

    setSaving(true);
    setMessage("");

    const updateData = {
      name: settings.name,
      slogan: settings.slogan,
      phone_mtn: settings.phone_mtn || null,
      phone_airtel: settings.phone_airtel || null,
      email: settings.email || null,
      address: settings.address || null,
    };

    let error;
    if (settings.id) {
      ({ error } = await supabase.from("company").update(updateData).eq("id", settings.id));
    } else {
      ({ error } = await supabase.from("company").insert(updateData));
    }

    if (error) {
      setMessage(`❌ Erreur : ${error.message}`);
    } else {
      setMessage("✅ Paramètres enregistrés !");
      setTimeout(() => setMessage(""), 3000);
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 text-center text-gray-400">
        Chargement...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/admin" className="text-night hover:text-accent-700 text-sm mb-4 inline-flex items-center gap-1">
        ← Retour au dashboard
      </Link>

      <h1 className="section-title mt-2 mb-6">⚙️ Paramètres de l&apos;entreprise</h1>

      {message && (
        <div className={`p-3 rounded-lg text-sm mb-6 ${message.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Identité */}
        <div className="card">
          <h2 className="font-bold text-night mb-4">🏢 Identité</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l&apos;entreprise</label>
              <input
                type="text"
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                className="input-field"
                placeholder="Nzoko Transport"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slogan</label>
              <input
                type="text"
                value={settings.slogan}
                onChange={(e) => setSettings({ ...settings, slogan: e.target.value })}
                className="input-field"
                placeholder="Voyagez en toute sécurité"
              />
            </div>
          </div>
        </div>

        {/* Mobile Money */}
        <div className="card">
          <h2 className="font-bold text-night mb-4">📱 Numéros Mobile Money</h2>
          <p className="text-sm text-gray-600 mb-4">
            Ces numéros seront affichés aux clients lors du paiement.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                MTN Mobile Money
              </label>
              <input
                type="tel"
                value={settings.phone_mtn}
                onChange={(e) => setSettings({ ...settings, phone_mtn: e.target.value })}
                className="input-field"
                placeholder="06 XXX XX XX"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Airtel Money
              </label>
              <input
                type="tel"
                value={settings.phone_airtel}
                onChange={(e) => setSettings({ ...settings, phone_airtel: e.target.value })}
                className="input-field"
                placeholder="05 XXX XX XX"
              />
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="card">
          <h2 className="font-bold text-night mb-4">📞 Contact</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={settings.email}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                className="input-field"
                placeholder="contact@nzoko.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
              <input
                type="text"
                value={settings.address}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                className="input-field"
                placeholder="Brazzaville, Congo"
              />
            </div>
          </div>
        </div>

        <div className="text-center">
          <button type="submit" disabled={saving} className="btn-primary px-10 disabled:opacity-50">
            {saving ? "Enregistrement..." : "💾 Enregistrer les paramètres"}
          </button>
        </div>
      </form>
    </div>
  );
}
