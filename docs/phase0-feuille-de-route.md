# Nzoko Transport — Phase 0 : état des lieux et feuille de route

_Rédigé le 2 octobre 2026. Branche `fix/phase0-securite`._

## 1. Situation de départ

Deux bases de code coexistent :

| | Version en ligne (ce dépôt, `src/`) | Version locale (`~/nzoko-transport`, non versionnée) |
|---|---|---|
| Déploiement | Vercel → https://nzoko-transport-tan.vercel.app | Jamais déployée, jamais connectée à Supabase |
| Schéma | `supabase/schema.sql` — ids texte, `corridors` + `corridor_stops`, `services`, `trips` (inutilisée), `agent_profiles` | `supabase-schema.sql` — UUID, `agencies`, `routes`, `scheduled_trips`, `bus_seats`, `tickets`, `scan_logs` |
| Recherche | Données codées en dur (`lib/trips.ts`) | Lit `scheduled_trips` en base |
| Sièges | Occupation simulée, aucune vérification | Sièges réels + blocage 15 min (`seat_holds`) |
| Billet | Référence `NZK-AAMMJJ-XXXX` = QR, scannable 3 fois | Jeton QR aléatoire, scan unique, PDF, journal des scans |

**Base Supabase de production** (`rjpg…`) : le nom d'hôte ne résout plus (DNS public inclus).
Le projet est probablement **en pause** (offre gratuite inactive) ou **supprimé**. Conséquence : le site en ligne ne peut
actuellement ni enregistrer de réservation, ni connecter un agent. À confirmer dans le tableau de bord Supabase.

## 2. Corrigé dans cette branche

| Faille | Correction |
|---|---|
| `/api/create-agent` ouvert à tous (création d'admin) | Admin connecté obligatoire. Premier admin via `/admin/setup` seulement si **aucun admin n'existe** et avec le code `ADMIN_SETUP_TOKEN` (variable Vercel, non définie = page désactivée) |
| `/api/validate-ticket` ouvert à tous | Agent actif obligatoire ; double scan simultané bloqué |
| `/api/send-ticket` : relais d'email ouvert + injection HTML | Agent obligatoire ; destinataire et contenu relus en base ; HTML échappé ; billet confirmé uniquement |
| Contrôles d'autorisation | `lib/api-auth.ts` (vérif. serveur du jeton + `agent_profiles.is_active` + rôle), `lib/auth-fetch.ts` côté admin |

Vérifié : build Next.js OK ; appels sans session → 401, faux jeton → 401, faux code setup → 403.

## 3. Décision du 2 octobre 2026 : une seule base de code

**Source de vérité unique : ce dépôt GitHub → Vercel → site en ligne.**
Pas de V2, pas de réécriture, pas de fusion avec `~/nzoko-transport`.
Le dossier local ne sert plus que de **référence** : on peut s'inspirer d'une fonctionnalité
qui y était bien faite (blocage de sièges, PDF, journal des scans…) et en reprendre du code
après vérification, mais l'architecture reste celle de ce dépôt.

## 4. Feuille de route (dans l'ordre, une étape après l'autre)

### Étape 1 — Restaurer et auditer Supabase (bloquante)
1. Réactiver le projet Supabase (ou récupérer sa sauvegarde) et faire un export complet archivé.
2. Audit **en lecture seule** : tables, colonnes, relations, règles RLS, volumes, données de test ou réelles.
3. Comparaison avec `supabase/schema.sql` et avec ce que le code utilise réellement.
4. Préparer des migrations **uniquement additives** dans `supabase/migrations/` (aucune suppression).

### Étape 2 — Sécuriser complètement
- Tester cette branche avec la vraie base, puis la fusionner dans `main`.
- Corriger les règles RLS (lecture de sa propre réservation, `UPDATE` agents, boucle sur `agent_profiles`, écriture flotte/lignes/paramètres).
- Faire passer la création de réservation et de paiement par des routes serveur.

### Étape 3 — Réservation réellement fonctionnelle
Recherche et horaires lus en base (corridors + arrêts intermédiaires conservés), réservations reliées
à un départ (`trips`), sièges réels et blocage temporaire, impossibilité de double réservation,
prix calculé et vérifié côté serveur, jeton QR unique et aléatoire (un par passager), scan unique,
billet PDF, QR généré par le site (plus par un service externe).

### Étape 4 — Administration et comptabilité
Réservations, paiements, passagers, agences/terminus, bus, lignes, départs, agents, statistiques,
comptabilité, annulations, retards.

### Étape 5 — Module colis
Architecture validée (colis indépendant du billet, `parcels` / `parcel_payments` séparés,
`NZK-C-…`, QR + code de retrait, historique des statuts, agence → bus → agence). Aucune table avant cette étape.

## 5. Identité visuelle

Branche `feat/identite-visuelle` : logo officiel fourni par Nzoko (non redessiné), filigrane éléphant,
palette Nuit `#0E2930` / Or `#E2AB35` / Anthracite `#3E3E39` / Crème `#F7F4EC`.
Fusion possible sans conflit avec cette branche. À remplacer par le fichier source vectoriel du logo dès qu'il est disponible.
