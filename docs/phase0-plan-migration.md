# Nzoko Transport — Phase 0 : état des lieux et plan de migration

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

## 3. Ce qu'on garde de la version en ligne

- **Identité visuelle** : bleu nuit `#0f2340` + jaune `#ffd700`, logo éléphant (`Logo.tsx`), accueil avec grand logo, cartes de résultats, mobile-first.
- **Plan de sièges** 2+3 (A-B | C-D-E), position du chauffeur, sièges premium (fenêtres A/E + 1re rangée) à +1 000 FCFA.
- **Réseau réel** : 15 villes, 6 terminus, 4 axes **avec arrêts intermédiaires**, distances, durées et prix par segment
  (ex. Brazzaville → Dolisie = 9 500 FCFA). La version locale ne gère que des trajets directs : ce modèle est à reprendre.
- **Recherche dans les deux sens** et choix du terminus de départ/arrivée.
- **Table `company`** (nom, slogan, numéros MTN/Airtel modifiables dans l'admin).
- **Espace agent par terminus** (`/admin/terminal/[id]`) : la logique « mon guichet, mes départs du jour ».
- **Format de référence `NZK-…`** pour la lisibilité au guichet.
- Les correctifs de sécurité de cette branche.

## 4. Ce qu'on reprend de la version locale

- Architecture : `@supabase/ssr`, middleware protégeant `/admin` et `/mon-compte`, routes API serveur.
- Modèle : `agencies`, `buses` + `bus_seats`, `scheduled_trips`, `bookings` (1 ligne = 1 siège), `payments`, `tickets`, `scan_logs`, `seat_holds`, `cancellations`.
- Parcours : blocage de siège 15 min, expiration du paiement 20 min, preuve de paiement.
- Billet PDF (jsPDF) + QR généré localement (`qrcode`) + email avec pièce jointe (Resend).
- Scanner (`QRScanner.tsx`) à usage unique avec journal.
- Admin : agences, bus, départs, réservations, paiements, liste passagers, annulations, retards, comptabilité.
- Pages légales (CGU, conditions de transport, confidentialité, politique d'annulation).

## 5. Ce qu'il faut corriger en reprenant la version locale

1. **Schéma incomplet** : ajouter `seat_holds`, `cancellations`, `bookings.expires_at / baggage_*`, `scheduled_trips.delay_*`,
   `agencies.mobile_money_*`, statut `expired`, et aligner les rôles (`super_admin`, `city_admin`, `driver` utilisés mais absents).
2. **Prix calculé côté serveur** (tarif segment + supplément siège + bagages), jamais reçu du navigateur.
3. **Plusieurs sièges par commande** : un `order`/groupe de réservations par paiement.
4. **Arrêts intermédiaires** : `route_stops` (ordre, décalage horaire, km, prix cumulé) sur le modèle `corridor_stops`.
5. **Règles RLS** : agents autorisés à confirmer les paiements de **leur agence** ; pas d'`UPDATE` public sur `bookings`
   (le passage en `pending_confirmation` doit se faire via une route serveur).
6. **Stockage privé** pour les preuves de paiement et les PDF (URL signées), au lieu d'un bucket public.
7. `/api/email/delay-notification` sans authentification ; filtre `.or()` construit depuis l'URL dans `/recherche`.
8. Créer **un dossier `supabase/migrations/`** versionné, plus de fichier SQL unique.
9. Retirer `ignoreBuildErrors` une fois les erreurs TypeScript corrigées (64 aujourd'hui, toutes antérieures).

## 6. Ce qu'on abandonne

- `lib/trips.ts` (horaires et prix en dur), `generateOccupied()` (sièges factices).
- Le passage de données par URL / `sessionStorage` entre les étapes.
- Le QR = référence et la tolérance de 3 scans.
- Le QR généré par `api.qrserver.com` (fuite des références vers un tiers).
- `services.departure_times TEXT[]` + table `trips` inutilisée → remplacés par des modèles de départ qui génèrent des `scheduled_trips`.
- Le code d'accès démo `nzoko2026` mentionné dans le README.
- Le vert de la version locale (remplacé par la charte bleu nuit/jaune).

## 7. Passage de l'une à l'autre sans casser les données

Principe : **aucune opération destructive**. L'ancienne base reste intacte en lecture seule ; la nouvelle est construite à côté.

1. **Récupérer l'ancienne base** : la réactiver si elle est en pause (ou télécharger la sauvegarde proposée par Supabase),
   puis en faire un export complet (`pg_dump`) archivé.
2. **Nouveau projet Supabase** (ex. `nzoko-v2`) alimenté uniquement par `supabase/migrations/`.
3. **Script d'import** (idempotent, relançable) de l'ancienne base vers la nouvelle :

   | Ancien | Nouveau |
   |---|---|
   | `cities.id` texte | `cities` (UUID) + `slug` = ancien id |
   | `terminals` | `agencies` (`legacy_id` conservé) |
   | `corridors` + `corridor_stops` | `routes` + `route_stops` |
   | `buses` | `buses` + `bus_seats` générés (2+3, premium A/E/rangée 1) |
   | `services` + horaires | modèles de départ → `scheduled_trips` |
   | `bookings` + `passengers` | `bookings` (1 par siège) avec `legacy_reference` |
   | `payments` | `payments` |
   | `agent_profiles` | `profiles` (rôle + agence) — comptes Auth conservés si même projet, sinon invitation |

4. **Compatibilité des anciens billets** : le scanner accepte encore une référence `NZK-AAMMJJ-XXXX`
   (recherche par `legacy_reference`), en scan unique.
5. **Bascule** : Preview Vercel branchée sur `nzoko-v2` → tests complets → validation → variables Vercel de production
   pointées vers `nzoko-v2` → merge sur `main`. Retour arrière = remettre les anciennes variables.

## 8. Ordre de travail proposé

1. ✅ Sécurité (cette branche) — à fusionner dès validation.
2. Statut de l'ancienne base (pause / supprimée / données réelles ?).
3. Nouveau dépôt de travail : version locale versionnée dans ce dépôt (branche `v2`), charte visuelle de la version en ligne appliquée.
4. Migrations complètes + RLS + `route_stops` + prix serveur + commandes multi-sièges.
5. Parcours client complet de bout en bout sur Preview.
6. Admin complet (agences → lignes → bus → départs → réservations → paiements → passagers → agents → comptabilité).
7. Import des données + bascule.
8. Module colis (architecture validée, aucune table créée d'ici là).
