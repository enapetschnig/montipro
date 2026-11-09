-- Grundtests 09.11.2026: Ohne Anmeldung (nur mit dem öffentlichen Schlüssel, der in jeder App-Auslieferung steht)
-- gab die Datenbank zwei Tabellen heraus:
--   * profiles – alle Mitarbeiter mit Telefon, Adresse, Geburtsdatum, SV-Nummer, Stundenlohn
--     (Regel „Users can view all profiles“ galt für die Rolle public, also auch anon);
--   * whatsapp_messages – lesen, schreiben und löschen (Regel „service_role_whatsapp“ mit true für public).
-- Rückwärtsverträglich: Für angemeldete Benutzer bleibt alles wie bisher (Profile weiter für alle Angemeldeten
-- lesbar, WhatsApp-Verlauf weiter für Administratoren); die Edge Functions nutzen den Service-Schlüssel und
-- umgehen RLS ohnehin. Nur Unangemeldete sind ausgesperrt. Keine Datenänderung.
ALTER POLICY "Users can view all profiles" ON public.profiles TO authenticated;
ALTER POLICY "service_role_whatsapp" ON public.whatsapp_messages TO service_role;
