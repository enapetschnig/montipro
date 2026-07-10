// Entfernt beim Löschen eines Zeitausgleich-time_entries den zugehörigen
// Tag aus den za-leave_requests (Plantafel-Blöcke) — tageweise korrekt:
//
//   - eintägiger Block  → Block löschen
//   - Tag am Blockrand  → Block schrumpfen (start/end verschieben)
//   - Tag mittendrin    → Block in zwei Teile splitten
//
// Früher wurde der GESAMTE Block gelöscht, sobald ein einzelner Tag eines
// mehrtägigen ZA entfernt wurde — die übrigen Tage verschwanden dann von
// der Plantafel, obwohl ihre time_entries + Konto-Abzüge weiterbestanden.
//
// RLS-Hinweis: Mitarbeiter (Self-Service) dürfen eigene za-Blöcke löschen
// und neue anlegen, aber nicht updaten — Schrumpfen/Splitten greift daher
// nur im Admin-Pfad. Self-Service-ZAs sind aber immer eintägig (der
// Lösch-Fall), mehrtägige Blöcke entstehen nur über den Admin-Nachtrag.

import { supabase } from "@/integrations/supabase/client";
import { format, addDays } from "date-fns";
import { getNormalWorkingHours } from "@/lib/workingHours";

/** Anzahl der Werktage (Mo–Do, Tagessoll > 0) im Bereich [start, end]. */
function countWorkdays(start: string, end: string): number {
  if (!start || !end || start > end) return 0;
  let n = 0;
  const endD = new Date(end + "T12:00:00");
  for (let d = new Date(start + "T12:00:00"); d <= endD; d.setDate(d.getDate() + 1)) {
    if (getNormalWorkingHours(d) > 0) n++;
  }
  return n;
}

const shiftDay = (datum: string, delta: number) =>
  format(addDays(new Date(datum + "T12:00:00"), delta), "yyyy-MM-dd");

export async function removeZaLeaveDay(userId: string, datum: string): Promise<void> {
  const lr = () => (supabase.from("leave_requests" as never) as any);
  const { data: blocks } = await lr()
    .select("id, start_date, end_date, days, status, reviewed_by, reviewed_at, notizen")
    .eq("user_id", userId)
    .eq("type", "za")
    .lte("start_date", datum)
    .gte("end_date", datum);

  for (const b of ((blocks as any[]) || [])) {
    if (b.start_date === datum && b.end_date === datum) {
      // Eintägiger Block → weg damit.
      await lr().delete().eq("id", b.id);
    } else if (b.start_date === datum) {
      const newStart = shiftDay(datum, 1);
      await lr().update({ start_date: newStart, days: countWorkdays(newStart, b.end_date) }).eq("id", b.id);
    } else if (b.end_date === datum) {
      const newEnd = shiftDay(datum, -1);
      await lr().update({ end_date: newEnd, days: countWorkdays(b.start_date, newEnd) }).eq("id", b.id);
    } else {
      // Tag mitten im Block → linken Teil kürzen, rechten Teil neu anlegen.
      const leftEnd = shiftDay(datum, -1);
      const rightStart = shiftDay(datum, 1);
      await lr().update({ end_date: leftEnd, days: countWorkdays(b.start_date, leftEnd) }).eq("id", b.id);
      await lr().insert({
        user_id: userId,
        type: "za",
        start_date: rightStart,
        end_date: b.end_date,
        days: countWorkdays(rightStart, b.end_date),
        status: b.status,
        reviewed_by: b.reviewed_by,
        reviewed_at: b.reviewed_at,
        notizen: b.notizen,
      });
    }
  }
}
