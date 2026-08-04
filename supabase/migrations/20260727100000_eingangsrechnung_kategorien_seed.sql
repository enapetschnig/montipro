-- Eingangsrechnungs-Kategorien in admin_config_options seeden
-- (User-Wunsch 27.07.2026: Kategorien selbst anlegen/umbenennen).
--
-- Die drei UIs (Liste, Detail-Dialog, Upload-Dialog) lesen bereits aus
-- admin_config_options('eingangsrechnung_kategorie') mit Code-Fallback.
-- Der Fallback greift aber nur, solange KEINE Optionen in der DB stehen —
-- sobald der Admin die erste eigene Kategorie anlegt, wären die übrigen
-- zwölf verschwunden. Deshalb hier die Bestandsliste einmalig seeden.

INSERT INTO admin_config_options (kategorie, wert, label, sort_order, is_active)
VALUES
  ('eingangsrechnung_kategorie', 'material',           'Material',            1,  true),
  ('eingangsrechnung_kategorie', 'verbrauchsmaterial', 'Verbrauchsmaterial',  2,  true),
  ('eingangsrechnung_kategorie', 'fremdleistung',      'Fremdleistung',       3,  true),
  ('eingangsrechnung_kategorie', 'werkzeug',           'Werkzeug',            4,  true),
  ('eingangsrechnung_kategorie', 'werkstatt',          'Werkstatt',           5,  true),
  ('eingangsrechnung_kategorie', 'miete',              'Miete/Leasing',       6,  true),
  ('eingangsrechnung_kategorie', 'treibstoff',         'Treibstoff',          7,  true),
  ('eingangsrechnung_kategorie', 'geschaeftsessen',    'Geschäftsessen',      8,  true),
  ('eingangsrechnung_kategorie', 'buero',              'Büro',                9,  true),
  ('eingangsrechnung_kategorie', 'fortbildung',        'Fortbildung',        10,  true),
  ('eingangsrechnung_kategorie', 'versicherung',       'Versicherung',       11,  true),
  ('eingangsrechnung_kategorie', 'reise',              'Reise',              12,  true),
  ('eingangsrechnung_kategorie', 'sonstiges',          'Sonstiges',          13,  true)
ON CONFLICT (kategorie, wert) DO NOTHING;
