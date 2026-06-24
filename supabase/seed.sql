-- ============================================================
-- Nzoko Transport — Données initiales (seed)
-- Migrées depuis l'ancien data.js
-- ============================================================

-- Configuration entreprise
INSERT INTO company (name, slogan, color_primary, color_accent) VALUES
  ('Nzoko Transport', 'Voyagez en toute sécurité avec Nzoko', '#0f2340', '#ffd700');

-- Villes desservies
INSERT INTO cities (id, name, region) VALUES
  ('brazzaville', 'Brazzaville', 'Brazzaville'),
  ('kinkala', 'Kinkala', 'Pool'),
  ('mindouli', 'Mindouli', 'Pool'),
  ('madingou', 'Madingou', 'Bouenza'),
  ('nkayi', 'Nkayi', 'Bouenza'),
  ('loudima', 'Loudima', 'Bouenza'),
  ('dolisie', 'Dolisie', 'Niari'),
  ('pointenoire', 'Pointe-Noire', 'Pointe-Noire'),
  ('gamboma', 'Gamboma', 'Plateaux'),
  ('oyo', 'Oyo', 'Cuvette'),
  ('owando', 'Owando', 'Cuvette'),
  ('makoua', 'Makoua', 'Cuvette'),
  ('ouesso', 'Ouesso', 'Sangha'),
  ('djambala', 'Djambala', 'Plateaux'),
  ('sibiti', 'Sibiti', 'Lékoumou');

-- Terminus (gares routières)
INSERT INTO terminals (id, city_id, name) VALUES
  ('chateau-deau', 'brazzaville', 'Château d''eau'),
  ('mpila', 'brazzaville', 'Mpila'),
  ('mafouta', 'brazzaville', 'Mafouta'),
  ('centre-ville', 'pointenoire', 'Centre-ville'),
  ('nkouikou', 'pointenoire', 'Nkouikou'),
  ('ngoyo', 'pointenoire', 'Ngoyo');

-- Corridors
INSERT INTO corridors (id, label) VALUES
  ('rn1', 'RN1 — Brazzaville ↔ Pointe-Noire'),
  ('rn2', 'RN2 — Brazzaville ↔ Ouesso'),
  ('plateaux', 'Axe des Plateaux — Brazzaville ↔ Djambala'),
  ('niari', 'Axe Niari — Pointe-Noire ↔ Sibiti');

-- Arrêts RN1
INSERT INTO corridor_stops (corridor_id, city_id, stop_order, offset_minutes, distance_km, price_from_start) VALUES
  ('rn1', 'brazzaville', 1, 0, 0, 0),
  ('rn1', 'kinkala', 2, 75, 75, 2000),
  ('rn1', 'mindouli', 3, 145, 140, 3500),
  ('rn1', 'madingou', 4, 225, 240, 6000),
  ('rn1', 'nkayi', 5, 270, 285, 7000),
  ('rn1', 'loudima', 6, 310, 330, 8000),
  ('rn1', 'dolisie', 7, 370, 390, 9500),
  ('rn1', 'pointenoire', 8, 480, 540, 13000);

-- Arrêts RN2
INSERT INTO corridor_stops (corridor_id, city_id, stop_order, offset_minutes, distance_km, price_from_start) VALUES
  ('rn2', 'brazzaville', 1, 0, 0, 0),
  ('rn2', 'gamboma', 2, 210, 300, 6000),
  ('rn2', 'oyo', 3, 300, 400, 8000),
  ('rn2', 'owando', 4, 480, 600, 12000),
  ('rn2', 'makoua', 5, 560, 680, 14000),
  ('rn2', 'ouesso', 6, 720, 840, 20000);

-- Arrêts Plateaux
INSERT INTO corridor_stops (corridor_id, city_id, stop_order, offset_minutes, distance_km, price_from_start) VALUES
  ('plateaux', 'brazzaville', 1, 0, 0, 0),
  ('plateaux', 'gamboma', 2, 210, 300, 6000),
  ('plateaux', 'djambala', 3, 330, 410, 8500);

-- Arrêts Niari
INSERT INTO corridor_stops (corridor_id, city_id, stop_order, offset_minutes, distance_km, price_from_start) VALUES
  ('niari', 'pointenoire', 1, 0, 0, 0),
  ('niari', 'dolisie', 2, 150, 150, 4000),
  ('niari', 'sibiti', 3, 270, 270, 7000);

-- Bus (flotte Nzoko Transport)
INSERT INTO buses (id, name, bus_type, seats_per_row, rows, back_row_seats, amenities) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Grand Car 01', 'coach', 4, 12, 5, '{clim,wifi,usb,toilettes}'),
  ('00000000-0000-0000-0000-000000000002', 'Grand Car 02', 'coach', 4, 12, 5, '{clim,usb,toilettes,collation}'),
  ('00000000-0000-0000-0000-000000000003', 'Minibus 01', 'minibus', 3, 5, 4, '{clim}'),
  ('00000000-0000-0000-0000-000000000004', 'Minibus 02', 'minibus', 3, 5, 4, '{clim,usb}');

-- Services (lignes régulières)
INSERT INTO services (corridor_id, bus_id, departure_times) VALUES
  ('rn1', '00000000-0000-0000-0000-000000000001', '{06:00,09:30,14:00,21:00}'),
  ('rn1', '00000000-0000-0000-0000-000000000002', '{07:00,12:00,20:00}'),
  ('rn1', '00000000-0000-0000-0000-000000000003', '{05:30,08:00,11:00,16:00}'),
  ('rn2', '00000000-0000-0000-0000-000000000001', '{06:00,19:30}'),
  ('rn2', '00000000-0000-0000-0000-000000000003', '{07:30}'),
  ('plateaux', '00000000-0000-0000-0000-000000000004', '{07:00,13:30}'),
  ('niari', '00000000-0000-0000-0000-000000000004', '{08:00,15:00}');
