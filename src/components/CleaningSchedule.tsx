import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Check, Clock3, History, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, EmptyState, Field, Modal, Pill, Spinner } from "@/components/kit";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type RecurrenceType = "weekly" | "interval";

type CleaningScheduleRow = {
  id: string;
  name: string;
  notes: string | null;
  recurrence_type: RecurrenceType;
  weekdays: number[];
  interval_days: number | null;
  next_due_at: string;
  created_by_name: string;
};

type CleaningHistoryRow = {
  id: string;
  schedule_name_snapshot: string;
  scheduled_for: string;
  completed_at: string;
  completed_by_name: string;
};

type CleaningDraft = {
  id?: string;
  name: string;
  notes: string;
  date: string;
  time: string;
  recurrenceType: RecurrenceType;
  weekdays: number[];
  intervalDays: string;
};

const WEEKDAYS = [
  { value: 0, short: "D", label: "domingo" },
  { value: 1, short: "S", label: "segunda" },
  { value: 2, short: "T", label: "terça" },
  { value: 3, short: "Q", label: "quarta" },
  { value: 4, short: "Q", label: "quinta" },
  { value: 5, short: "S", label: "sexta" },
  { value: 6, short: "S", label: "sábado" },
] as const;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function localDateParts(date = new Date()) {
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function blankDraft(): CleaningDraft {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const parts = localDateParts(tomorrow);
  return {
    name: "",
    notes: "",
    date: parts.date,
    time: "09:00",
    recurrenceType: "weekly",
    weekdays: [tomorrow.getDay()],
    intervalDays: "7",
  };
}

function toLocalDraft(schedule: CleaningScheduleRow): CleaningDraft {
  const due = new Date(schedule.next_due_at);
  const parts = localDateParts(due);
  return {
    id: schedule.id,
    name: schedule.name,
    notes: schedule.notes ?? "",
    date: parts.date,
    time: parts.time,
    recurrenceType: schedule.recurrence_type,
    weekdays: schedule.weekdays,
    intervalDays: String(schedule.interval_days ?? 7),
  };
}

function formatDue(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function dueTone(iso: string) {
  const due = new Date(iso);
  const today = startOfDay(new Date());
  const dueDay = startOfDay(due);
  if (dueDay.getTime() < today.getTime()) return { label: "Atrasada", tone: "danger" as const };
  if (dueDay.getTime() === today.getTime()) return { label: "Hoje", tone: "primary" as const };
  return null;
}

function recurrenceLabel(schedule: CleaningScheduleRow) {
  if (schedule.recurrence_type === "interval") {
    return `A cada ${schedule.interval_days} ${schedule.interval_days === 1 ? "dia" : "dias"}`;
  }
  return schedule.weekdays
    .map((day) => WEEKDAYS.find((option) => option.value === day)?.label)
    .filter(Boolean)
    .join(", ");
}

function nextDue(schedule: CleaningScheduleRow) {
  const now = new Date();
  const previous = new Date(schedule.next_due_at);
  if (schedule.recurrence_type === "interval") {
    const next = new Date(now);
    next.setHours(previous.getHours(), previous.getMinutes(), 0, 0);
    next.setDate(next.getDate() + Math.max(1, schedule.interval_days ?? 1));
    return next;
  }

  const selected = new Set(schedule.weekdays);
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(previous.getHours(), previous.getMinutes(), 0, 0);
    if (selected.has(candidate.getDay())) return candidate;
  }
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 7);
  fallback.setHours(previous.getHours(), previous.getMinutes(), 0, 0);
  return fallback;
}

export function CleaningSchedule({ userName, onBack }: { userName: string; onBack: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CleaningDraft | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["cleaning_schedules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cleaning_schedules").select("*").order("next_due_at");
      if (error) throw error;
      return (data ?? []) as CleaningScheduleRow[];
    },
  });

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ["cleaning_history"],
    enabled: showHistory,
    queryFn: async () => {
      const { data, error } = await supabase.from("cleaning_history").select("*").order("completed_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as CleaningHistoryRow[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("cleaning-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "cleaning_schedules" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["cleaning_schedules"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cleaning_history" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["cleaning_history"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  async function remove(schedule: CleaningScheduleRow) {
    if (!confirm(`Excluir a limpeza “${schedule.name}” e seu histórico?`)) return;
    const { error } = await supabase.from("cleaning_schedules").delete().eq("id", schedule.id);
    if (error) return toast.error(error.message);
    await queryClient.invalidateQueries({ queryKey: ["cleaning_schedules"] });
    toast.success("Limpeza excluída");
  }

  async function complete(schedule: CleaningScheduleRow) {
    setCompletingId(schedule.id);
    const { error } = await supabase.rpc("complete_cleaning", {
      _schedule_id: schedule.id,
      _completed_by_name: userName,
      _next_due_at: nextDue(schedule).toISOString(),
    });
    setCompletingId(null);
    if (error) return toast.error(error.message);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["cleaning_schedules"] }),
      queryClient.invalidateQueries({ queryKey: ["cleaning_history"] }),
    ]);
    toast.success("Limpeza concluída e próxima data agendada");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon" variant="outline" onClick={onBack} aria-label="Voltar para compromissos" title="Voltar para compromissos">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg">Cronograma de limpeza</h2>
          <p className="text-xs text-muted-foreground">Rotina compartilhada da casa</p>
        </div>
        <Button size="sm" variant={showHistory ? "primary" : "outline"} onClick={() => setShowHistory((current) => !current)}>
          <History className="h-4 w-4" /> Histórico
        </Button>
        <Button size="sm" onClick={() => setDraft(blankDraft())}>
          <Plus className="h-4 w-4" /> Nova limpeza
        </Button>
      </div>

      {showHistory ? (
        <CleaningHistory history={history} loading={historyLoading} />
      ) : (
        <>
          {isLoading && <EmptyState>Carregando cronograma...</EmptyState>}
          {!isLoading && !schedules.length && (
            <EmptyState>
              <Sparkles className="mx-auto mb-2 h-6 w-6" />
              Nenhuma limpeza cadastrada.
            </EmptyState>
          )}
          <div className="space-y-2">
            {schedules.map((schedule) => {
              const status = dueTone(schedule.next_due_at);
              return (
                <article key={schedule.id} className="surface p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong>{schedule.name}</strong>
                        {status && <Pill tone={status.tone}>{status.label}</Pill>}
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="h-3 w-3" /> {formatDue(schedule.next_due_at)}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock3 className="h-3 w-3" /> {recurrenceLabel(schedule)}
                      </p>
                      {schedule.notes && <p className="mt-2 text-sm">{schedule.notes}</p>}
                    </div>
                    <div className="flex shrink-0">
                      <Button size="icon" variant="ghost" aria-label="Editar limpeza" title="Editar" onClick={() => setDraft(toLocalDraft(schedule))}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Excluir limpeza" title="Excluir" onClick={() => void remove(schedule)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <Button className="mt-3 w-full" variant="soft" disabled={completingId === schedule.id} onClick={() => void complete(schedule)}>
                    {completingId === schedule.id ? <Spinner /> : <Check className="h-4 w-4" />} Marcar como feita
                  </Button>
                </article>
              );
            })}
          </div>
        </>
      )}

      <CleaningModal
        draft={draft}
        userId={user?.id ?? null}
        userName={userName}
        onClose={() => setDraft(null)}
        onSaved={async () => {
          await queryClient.invalidateQueries({ queryKey: ["cleaning_schedules"] });
        }}
      />
    </div>
  );
}

function CleaningHistory({ history, loading }: { history: CleaningHistoryRow[]; loading: boolean }) {
  if (loading) return <EmptyState>Carregando histórico...</EmptyState>;
  if (!history.length) return <EmptyState>Nenhuma limpeza concluída.</EmptyState>;
  return (
    <div className="space-y-2">
      {history.map((entry) => (
        <article key={entry.id} className="surface flex items-center gap-3 p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Check className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-sm">{entry.schedule_name_snapshot}</strong>
            <p className="text-xs text-muted-foreground">
              Feita por {entry.completed_by_name} em {new Date(entry.completed_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            </p>
            <p className="text-xs text-muted-foreground">Programada para {formatDue(entry.scheduled_for)}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function CleaningModal({
  draft,
  userId,
  userName,
  onClose,
  onSaved,
}: {
  draft: CleaningDraft | null;
  userId: string | null;
  userName: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<CleaningDraft>(blankDraft());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (draft) setForm(draft);
  }, [draft]);

  const interval = Number(form.intervalDays);
  const due = useMemo(() => new Date(`${form.date}T${form.time}:00`), [form.date, form.time]);

  function toggleWeekday(day: number) {
    setForm((current) => ({
      ...current,
      weekdays: current.weekdays.includes(day)
        ? current.weekdays.filter((value) => value !== day)
        : [...current.weekdays, day].sort(),
    }));
  }

  async function save() {
    if (!form.name.trim()) return toast.error("Informe o cômodo ou a tarefa");
    if (Number.isNaN(due.getTime())) return toast.error("Informe a primeira data e o horário");
    if (form.recurrenceType === "weekly" && !form.weekdays.length) return toast.error("Escolha pelo menos um dia da semana");
    if (form.recurrenceType === "interval" && (!Number.isInteger(interval) || interval < 1 || interval > 365)) {
      return toast.error("Informe um intervalo entre 1 e 365 dias");
    }
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      notes: form.notes.trim() || null,
      recurrence_type: form.recurrenceType,
      weekdays: form.recurrenceType === "weekly" ? form.weekdays : [],
      interval_days: form.recurrenceType === "interval" ? interval : null,
      next_due_at: due.toISOString(),
      created_by: userId,
      created_by_name: userName,
    };
    const query = form.id
      ? supabase.from("cleaning_schedules").update(payload).eq("id", form.id)
      : supabase.from("cleaning_schedules").insert(payload);
    const { error } = await query;
    setBusy(false);
    if (error) return toast.error(error.message);
    await onSaved();
    onClose();
    toast.success(form.id ? "Limpeza atualizada" : "Limpeza adicionada ao cronograma");
  }

  return (
    <Modal
      open={!!draft}
      onClose={onClose}
      title={form.id ? "Editar limpeza" : "Nova limpeza"}
      footer={
        <>
          <Button onClick={() => void save()} disabled={busy}>{busy ? <Spinner /> : null} Salvar</Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </>
      }
    >
      <Field label="Cômodo ou tarefa">
        <input className="field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Lavar o banheiro" />
      </Field>
      <Field label="Observação (opcional)">
        <textarea className="field min-h-20" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Ex.: Limpar box e trocar os tapetes" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Primeira data">
          <input type="date" className="field" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
        </Field>
        <Field label="Horário">
          <input type="time" className="field" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} />
        </Field>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Repetição</p>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" size="sm" variant={form.recurrenceType === "weekly" ? "primary" : "outline"} onClick={() => setForm({ ...form, recurrenceType: "weekly" })}>Dias da semana</Button>
          <Button type="button" size="sm" variant={form.recurrenceType === "interval" ? "primary" : "outline"} onClick={() => setForm({ ...form, recurrenceType: "interval" })}>A cada X dias</Button>
        </div>
      </div>
      {form.recurrenceType === "weekly" ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Dias escolhidos</p>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((day) => (
              <Button
                key={day.value}
                type="button"
                size="icon"
                variant={form.weekdays.includes(day.value) ? "primary" : "outline"}
                aria-label={day.label}
                title={day.label}
                onClick={() => toggleWeekday(day.value)}
              >
                {day.short}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <Field label="Intervalo em dias">
          <input type="number" min="1" max="365" step="1" className="field" value={form.intervalDays} onChange={(event) => setForm({ ...form, intervalDays: event.target.value })} />
        </Field>
      )}
    </Modal>
  );
}