-- Status und Antwort einer Meldung darf nur die Verwaltung setzen.
--
-- Die Zugriffsregel erlaubt dem Melder, seine eigene Zeile zu ändern — das
-- ist nötig, weil die Spracherkennung den Text nachträgt. Ohne weitere
-- Einschränkung könnte er damit aber auch `status` auf „umgesetzt" setzen
-- und sich selbst eine Antwort schreiben. Das ginge über den CRM-Trigger
-- sogar als erledigt gemeldet hinaus.
--
-- Zeilenbasierte Regeln können einzelne Spalten nicht schützen, deshalb ein
-- Trigger.

CREATE OR REPLACE FUNCTION public.aenderungswunsch_felder_schuetzen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verwaltung darf alles.
  IF public.has_role(auth.uid(), 'administrator'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Dienstwege ohne angemeldeten Benutzer (Spracherkennung, Wartung) laufen
  -- mit dem Service-Schlüssel; dort ist auth.uid() leer.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Den Bearbeitungsstand einer Meldung setzt die Verwaltung.';
  END IF;
  IF NEW.antwort IS DISTINCT FROM OLD.antwort THEN
    RAISE EXCEPTION 'Die Antwort auf eine Meldung schreibt die Verwaltung.';
  END IF;
  -- Der Melder darf die Meldung auch nicht jemand anderem zuschreiben.
  IF NEW.erstellt_von IS DISTINCT FROM OLD.erstellt_von THEN
    RAISE EXCEPTION 'Die Meldung kann nicht einem anderen Konto zugeordnet werden.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aenderungswunsch_felder ON public.aenderungswuensche;
CREATE TRIGGER trg_aenderungswunsch_felder
  BEFORE UPDATE ON public.aenderungswuensche
  FOR EACH ROW EXECUTE FUNCTION public.aenderungswunsch_felder_schuetzen();
