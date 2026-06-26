-- ============================================================
-- Nzoko Transport — Schéma de base de données Supabase
-- ============================================================

-- Table de configuration de l'entreprise
CREATE TABLE IF NOT EXISTS company (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Nzoko Transport',
  slogan TEXT DEFAULT 'Voyagez en toute sécurité',
  logo_url TEXT,
  color_primary TEXT DEFAULT '#0f2340',    -- Bleu de nuit
  color_accent TEXT DEFAULT '#ffd700',     -- Jaune
  phone_mtn TEXT,
  phone_airtel TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Villes desservies
CREATE TABLE IF NOT EXISTS cities (
  id TEXT PRIMARY KEY,                     -- ex: 'brazzaville'
  name TEXT NOT NULL,                      -- ex: 'Brazzaville'
  region TEXT NOT NULL,                    -- ex: 'Brazzaville'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Terminus / Gares routières dans une ville
CREATE TABLE IF NOT EXISTS terminals (
  id TEXT PRIMARY KEY,                     -- ex: 'chateau-deau'
  city_id TEXT REFERENCES cities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                      -- ex: 'Château d''eau'
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Corridors / Axes routiers
CREATE TABLE IF NOT EXISTS corridors (
  id TEXT PRIMARY KEY,                     -- ex: 'rn1'
  label TEXT NOT NULL,                     -- ex: 'RN1 — Brazzaville ↔ Pointe-Noire'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Arrêts sur un corridor (table de liaison ordonnée)
CREATE TABLE IF NOT EXISTS corridor_stops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  corridor_id TEXT REFERENCES corridors(id) ON DELETE CASCADE,
  city_id TEXT REFERENCES cities(id) ON DELETE CASCADE,
  stop_order INT NOT NULL,                 -- Position dans le corridor
  offset_minutes INT NOT NULL DEFAULT 0,   -- Minutes depuis le départ
  distance_km INT NOT NULL DEFAULT 0,      -- Distance depuis le départ
  price_from_start INT NOT NULL DEFAULT 0, -- Prix en XAF depuis le départ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(corridor_id, city_id)
);

-- Bus (flotte)
CREATE TABLE IF NOT EXISTS buses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,                      -- ex: 'Bus 01 - Grand car'
  bus_type TEXT NOT NULL DEFAULT 'coach',  -- 'coach' | 'minibus'
  seats_per_row INT NOT NULL DEFAULT 4,
  rows INT NOT NULL DEFAULT 12,
  back_row_seats INT NOT NULL DEFAULT 5,
  amenities TEXT[] DEFAULT '{}',           -- ex: {'clim','wifi','usb'}
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Services / Lignes programmées
CREATE TABLE IF NOT EXISTS services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  corridor_id TEXT REFERENCES corridors(id) ON DELETE CASCADE,
  bus_id UUID REFERENCES buses(id) ON DELETE SET NULL,
  departure_times TEXT[] NOT NULL,         -- ex: {'06:00','09:30','14:00'}
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Voyages planifiés (instance d'un service à une date donnée)
CREATE TABLE IF NOT EXISTS trips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID REFERENCES services(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  departure_time TEXT NOT NULL,            -- ex: '06:00'
  status TEXT DEFAULT 'scheduled',         -- 'scheduled' | 'boarding' | 'departed' | 'arrived' | 'cancelled'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(service_id, date, departure_time)
);

-- Réservations
CREATE TABLE IF NOT EXISTS bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,          -- ex: 'NZK-240625-A3F2'
  trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  corridor_id TEXT REFERENCES corridors(id),
  from_city TEXT REFERENCES cities(id),
  to_city TEXT REFERENCES cities(id),
  from_terminal TEXT REFERENCES terminals(id), -- Terminus de départ choisi
  to_terminal TEXT REFERENCES terminals(id),   -- Terminus d'arrivée choisi
  date DATE NOT NULL,
  departure_time TEXT NOT NULL,
  total_price INT NOT NULL,                -- En XAF
  passenger_count INT NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'pending',           -- 'pending' | 'confirmed' | 'cancelled' | 'completed'
  customer_phone TEXT,
  customer_email TEXT,
  user_id UUID REFERENCES auth.users(id),  -- Client qui a réservé
  scan_count INT DEFAULT 0,                -- Nombre de fois scanné (max 3)
  last_scanned_at TIMESTAMPTZ,             -- Dernier scan
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Passagers (liés à une réservation)
CREATE TABLE IF NOT EXISTS passengers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  seat_number INT,
  is_primary BOOLEAN DEFAULT false,        -- Passager principal (qui a réservé)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Paiements Mobile Money
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'mtn',      -- 'mtn' | 'airtel'
  amount INT NOT NULL,
  transaction_code TEXT,                   -- Code SMS du client
  phone_sender TEXT,                       -- Numéro qui a envoyé
  status TEXT DEFAULT 'pending',           -- 'pending' | 'confirmed' | 'rejected'
  confirmed_by UUID,                       -- Agent qui a confirmé
  confirmed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agents (utilisateurs avec accès admin)
-- Utilise Supabase Auth, cette table étend le profil
CREATE TABLE IF NOT EXISTS agent_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'agent',               -- 'admin' | 'agent'
  phone TEXT,
  terminal_id TEXT REFERENCES terminals(id), -- Terminus assigné (NULL = tous pour admin)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE company ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE corridors ENABLE ROW LEVEL SECURITY;
ALTER TABLE corridor_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE buses ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_profiles ENABLE ROW LEVEL SECURITY;

-- Policies publiques (lecture) pour les données de base
CREATE POLICY "Public read company" ON company FOR SELECT USING (true);
CREATE POLICY "Public read cities" ON cities FOR SELECT USING (is_active = true);
CREATE POLICY "Public read corridors" ON corridors FOR SELECT USING (is_active = true);
CREATE POLICY "Public read corridor_stops" ON corridor_stops FOR SELECT USING (true);
CREATE POLICY "Public read buses" ON buses FOR SELECT USING (is_active = true);
CREATE POLICY "Public read services" ON services FOR SELECT USING (is_active = true);

-- Les réservations : le client peut créer, les agents peuvent tout voir
CREATE POLICY "Anyone can create booking" ON bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Agents read all bookings" ON bookings FOR SELECT USING (
  EXISTS (SELECT 1 FROM agent_profiles WHERE id = auth.uid())
);
CREATE POLICY "Customer reads own booking" ON bookings FOR SELECT USING (
  reference = current_setting('app.current_booking_ref', true)
);

-- Paiements : le client peut créer, les agents gèrent
CREATE POLICY "Anyone can create payment" ON payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Agents manage payments" ON payments FOR ALL USING (
  EXISTS (SELECT 1 FROM agent_profiles WHERE id = auth.uid())
);

-- Agents : seuls les admins gèrent
CREATE POLICY "Agents read own profile" ON agent_profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Admin manages agents" ON agent_profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM agent_profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Passengers : public insert, agents read
CREATE POLICY "Anyone can add passenger" ON passengers FOR INSERT WITH CHECK (true);
CREATE POLICY "Agents read passengers" ON passengers FOR SELECT USING (
  EXISTS (SELECT 1 FROM agent_profiles WHERE id = auth.uid())
);
