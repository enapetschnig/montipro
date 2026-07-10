-- RLS-Lücken rund um Zeitausgleich (Verify-Befunde 10.07.2026)
--
-- 1) time_accounts hatte nur eine Admin-INSERT-Policy. Der ZA-Selbstservice
--    legt das Zeitkonto jetzt automatisch an, wenn noch keines existiert —
--    ohne Self-INSERT-Policy schlug das für normale Mitarbeiter mit
--    RLS-Fehler 42501 fehl ("ZA-Stunden konnten nicht abgebucht werden").
--
-- 2) leave_requests hatte nur eine Self-INSERT-Policy. "Abwesenheit
--    nachtragen" (Admin legt für ANDERE Mitarbeiter an) scheiterte still —
--    time_entry + Konto-Abzug entstanden, der Plantafel-Block fehlte
--    (live passiert bei Stidl, ZA 13.07.).
--
-- 3) Mitarbeiter dürfen ihren eigenen genehmigten ZA-Plantafel-Block
--    löschen (Teil des ZA-Stornos in "Meine Stunden") — die bestehende
--    Policy erlaubte nur status='beantragt', der Delete war ein stiller
--    No-Op und der Block blieb stehen.

-- 1) Mitarbeiter: eigenes Zeitkonto anlegen
DROP POLICY IF EXISTS "Users can insert own time account" ON public.time_accounts;
CREATE POLICY "Users can insert own time account"
  ON public.time_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_active_user(auth.uid()));

-- 2) Admins: Abwesenheits-Blöcke für beliebige Mitarbeiter anlegen
DROP POLICY IF EXISTS "Admins can insert all leave requests" ON public.leave_requests;
CREATE POLICY "Admins can insert all leave requests"
  ON public.leave_requests FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'administrator'::app_role) AND is_active_user(auth.uid()));

-- 3) Mitarbeiter: eigenen ZA-Block löschen (auch genehmigt — ZA-Storno)
DROP POLICY IF EXISTS "Users can delete own za leave requests" ON public.leave_requests;
CREATE POLICY "Users can delete own za leave requests"
  ON public.leave_requests FOR DELETE
  USING (auth.uid() = user_id AND is_active_user(auth.uid()) AND type = 'za');
