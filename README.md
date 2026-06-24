# Nzoko Transport — Plateforme de réservation de bus

Système de réservation de billets de bus pour **Nzoko Transport** (Congo-Brazzaville).
Application web Next.js avec backend Supabase, déployée sur Vercel.

## Stack technique

- **Frontend** : Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend** : Supabase (PostgreSQL + Auth + Realtime)
- **Déploiement** : Vercel
- **Paiement** : Mobile Money (MTN / Airtel) — confirmation manuelle par agent

## Fonctionnalités

- 🔎 Recherche de trajets (ville départ / arrivée / date / passagers)
- 🛣️ Axes réels : RN1 (Brazzaville ↔ Pointe-Noire), RN2 (Brazzaville ↔ Ouesso),
  axe des Plateaux, axe Niari
- 💺 Sélection du siège sur plan de bus interactif
- 📲 Paiement Mobile Money : le client envoie l'argent, saisit le code SMS
- 🛠️ Dashboard agent : confirmer/refuser les paiements, gérer la flotte et les lignes
- 🎫 Billet avec statut en temps réel
- 📱 Design responsive mobile-first (bleu de nuit + jaune)

## Installation locale

```bash
# Cloner le repo
git clone https://github.com/mayombe-market/nzoko-transport.git
cd nzoko-transport

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.local.example .env.local
# Éditer .env.local avec vos clés Supabase

# Lancer en développement
npm run dev
```

## Configuration Supabase

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Exécuter `supabase/schema.sql` dans l'éditeur SQL
3. Exécuter `supabase/seed.sql` pour les données initiales
4. Copier l'URL et la clé anon dans `.env.local`

## Déploiement Vercel

1. Connecter le repo GitHub sur [vercel.com](https://vercel.com)
2. Ajouter les variables d'environnement (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
3. Déployer — c'est tout !

## Espace agent

- URL : `/admin`
- Code d'accès démo : `nzoko2026`
- En production : sera remplacé par Supabase Auth

## Structure

```
src/
  app/
    layout.tsx          Layout principal (Header + Footer)
    page.tsx            Accueil + recherche
    recherche/          Résultats de recherche
    siege/              Sélection des sièges
    passagers/          Formulaire passagers
    paiement/           Instructions + confirmation paiement
    confirmation/       Billet + statut
    mes-reservations/   Retrouver ses billets
    admin/              Dashboard opérateur
  components/           Composants réutilisables
  lib/                  Utilitaires, client Supabase, logique trajets
  types/                Types TypeScript
supabase/
  schema.sql            Schéma de la base de données
  seed.sql              Données initiales
```

## Branding

- **Nom** : Nzoko Transport
- **Couleurs** : Bleu de nuit (#0f2340) + Jaune doré (#ffd700)
- **Symbole** : Éléphant 🐘

## Licence

Propriétaire — Mayombe Market.
