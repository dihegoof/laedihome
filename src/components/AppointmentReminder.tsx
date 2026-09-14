import { useMemo } from "react";
import { BellRing, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/kit";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAppointments, useInvalidate } from "@/lib/data";

export function AppointmentReminder() {
  const { user } = useAuth();
  const { data: appointments = [] } = useAppointments(Boolean(user));
  const invalidate = useInvalidate();
  const appointment = useMemo(() => {
    if (!user) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const afterTomorrow = new Date(today);
    afterTomorrow.setDate(afterTomorrow.getDate() + 2);
    return appointments
      .filter((item) =>
        item.created_by === user.id
        && !item.reminder_done
        && new Date(item.scheduled_at) >= today
        && new Date(item.scheduled_at) < afterTomorrow)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0] ?? null;
  }, [appointments, user]);

  if (!appointment) return null;

  const date = new Date(appointment.scheduled_at);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  async function remember() {
    if (!appointment) return;
    const { error } = await supabase
      .from("appointments")
      .update({ reminder_done: true })
      .eq("id", appointment.id);
    if (error) return toast.error("Não consegui retirar o aviso");
    await invalidate("appointments");
    toast.success("Lembrete confirmado");
  }

  return (
    <aside className="border-b border-destructive/30 bg-destructive/12 px-4 py-2.5 text-destructive">
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <BellRing className="h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{appointment.title || "Compromisso em áudio"}</p>
          <p className="text-xs font-semibold opacity-80">
            {isToday ? "Hoje" : "Amanhã"}, às {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <Button size="sm" variant="dangerGhost" onClick={() => void remember()}>
          <Check className="h-4 w-4" /> Lembrei
        </Button>
      </div>
    </aside>
  );
}