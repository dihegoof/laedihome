import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Mic, Pause, Play, Plus, Search, Square, Trash2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button, EmptyState, Field, Modal, Pill, Spinner } from "@/components/kit";
import { useAuth } from "@/hooks/useAuth";
import { logHistory, useAppointments, useInvalidate } from "@/lib/data";
import { getSignedUrl, uploadFile } from "@/lib/storage";
import type { Appointment } from "@/lib/types";

const MIME_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

function fmtDuration(s: number | null | undefined) {
  const total = Math.max(0, Math.round(s ?? 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  const base = date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const label = base.charAt(0).toUpperCase() + base.slice(1);
  if (diff === 0) return { label, tag: "Hoje" as const };
  if (diff === 1) return { label, tag: "Amanhã" as const };
  if (diff < 0) return { label, tag: "Passou" as const };
  return { label, tag: null };
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function localInputs(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function AppointmentsScreen({ userName }: { userName: string }) {
  const { data: all = [], isLoading } = useAppointments();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [search, setSearch] = useState("");

  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const term = search.trim().toLowerCase();

  const groups = useMemo(() => {
    const list = all
      .filter((a) => showPast || new Date(a.scheduled_at).getTime() >= startOfToday)
      .filter((a) => {
        if (!term) return true;
        const inTitle = (a.title || "").toLowerCase().includes(term);
        const inDate = dayLabel(dayKey(a.scheduled_at)).label.toLowerCase().includes(term);
        const inTime = fmtTime(a.scheduled_at).toLowerCase().includes(term);
        return inTitle || inDate || inTime;
      })
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    const map = new Map<string, Appointment[]>();
    for (const a of list) {
      const k = dayKey(a.scheduled_at);
      map.set(k, [...(map.get(k) ?? []), a]);
    }
    return [...map.entries()];
  }, [all, showPast, startOfToday, term]);

  const pastCount = all.filter((a) => new Date(a.scheduled_at).getTime() < startOfToday).length;

  async function remove(a: Appointment) {
    if (!confirm(`Apagar o compromisso de ${fmtTime(a.scheduled_at)}?`)) return;
    const { error } = await supabase.from("appointments").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    if (a.audio_url) void supabase.storage.from("appointments").remove([a.audio_url]);
    void invalidate("appointments");
    void logHistory(userName, "apagou compromisso", a.title ?? fmtTime(a.scheduled_at));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Mic className="h-4 w-4" /> Novo compromisso
        </Button>
        {pastCount > 0 && (
          <button
            onClick={() => setShowPast((v) => !v)}
            className="text-xs font-semibold text-muted-foreground underline-offset-2 hover:underline"
          >
            {showPast ? "Esconder passados" : `Ver passados (${pastCount})`}
          </button>
        )}
      </div>

      {isLoading && <EmptyState>Carregando agenda...</EmptyState>}

      {!isLoading && !groups.length && (
        <EmptyState>
          <CalendarClock className="mx-auto mb-2 h-6 w-6" />
          Nenhum compromisso por vir. Grave um por áudio!
        </EmptyState>
      )}

      {groups.map(([key, items]) => {
        const { label, tag } = dayLabel(key);
        return (
          <section key={key} className="space-y-2">
            <header className="flex items-center gap-2 px-1">
              <h3 className="text-sm font-semibold">{label}</h3>
              {tag === "Hoje" && <Pill tone="primary">Hoje</Pill>}
              {tag === "Amanhã" && <Pill tone="accent">Amanhã</Pill>}
              {tag === "Passou" && <Pill>Passou</Pill>}
            </header>
            <div className="space-y-2">
              {items.map((a) => (
                <AppointmentCard key={a.id} a={a} onDelete={() => void remove(a)} />
              ))}
            </div>
          </section>
        );
      })}

      <NewAppointmentModal open={open} onClose={() => setOpen(false)} userName={userName} />
    </div>
  );
}

function AppointmentCard({ a, onDelete }: { a: Appointment; onDelete: () => void }) {
  return (
    <article className="surface flex items-center gap-3 p-3">
      <div className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-primary-soft text-primary">
        <span className="text-sm font-bold leading-none">{fmtTime(a.scheduled_at)}</span>
        {a.duration_seconds != null && (
          <span className="mt-1 text-[10px] font-medium opacity-80">{fmtDuration(a.duration_seconds)}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{a.title || "Compromisso em áudio"}</p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <User className="h-3 w-3" /> {a.created_by_name || "alguém"}
        </p>
      </div>
      {a.audio_url ? <AudioButton path={a.audio_url} /> : <Pill>sem áudio</Pill>}
      <button onClick={onDelete} aria-label="Apagar compromisso" className="p-1">
        <Trash2 className="h-4 w-4 text-destructive" />
      </button>
    </article>
  );
}

function AudioButton({ path }: { path: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  async function toggle() {
    if (state === "playing") {
      audioRef.current?.pause();
      setState("idle");
      return;
    }
    setState("loading");
    try {
      if (!audioRef.current) {
        const url = await getSignedUrl("appointments", path);
        if (!url) throw new Error("Não consegui carregar o áudio");
        const el = new Audio(url);
        el.onended = () => setState("idle");
        el.onerror = () => {
          setState("idle");
          toast.error("Falha ao tocar o áudio");
        };
        audioRef.current = el;
      }
      await audioRef.current.play();
      setState("playing");
    } catch (e) {
      setState("idle");
      toast.error(e instanceof Error ? e.message : "Falha ao tocar o áudio");
    }
  }

  return (
    <button
      onClick={() => void toggle()}
      aria-label={state === "playing" ? "Pausar áudio" : "Ouvir áudio"}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
        state === "playing" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
      }`}
    >
      {state === "loading" ? <Spinner /> : state === "playing" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
    </button>
  );
}

function NewAppointmentModal({
  open,
  onClose,
  userName,
}: {
  open: boolean;
  onClose: () => void;
  userName: string;
}) {
  const { user } = useAuth();
  const invalidate = useInvalidate();
  const [date, setDate] = useState(localInputs().date);
  const [time, setTime] = useState(localInputs().time);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (open) {
      const now = localInputs();
      setDate(now.date);
      setTime(now.time);
      setTitle("");
      resetAudio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function resetAudio() {
    setBlob(null);
    setSeconds(0);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  async function startRecording() {
    if (typeof MediaRecorder === "undefined") return toast.error("Seu navegador não grava áudio.");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return toast.error("Preciso da permissão do microfone para gravar.");
    }
    resetAudio();
    const mime = pickMime();
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = rec.mimeType || mime || "audio/webm";
      const out = new Blob(chunksRef.current, { type });
      const dur = Math.round((Date.now() - startedAtRef.current) / 1000);
      if (out.size < 1500 || dur < 1) {
        toast.error("Gravação muito curta, tente de novo.");
        return;
      }
      setBlob(out);
      setSeconds(dur);
      setPreviewUrl(URL.createObjectURL(out));
    };
    recorderRef.current = rec;
    startedAtRef.current = Date.now();
    rec.start();
    setRecording(true);
    setSeconds(0);
    timerRef.current = window.setInterval(() => {
      setSeconds(Math.round((Date.now() - startedAtRef.current) / 1000));
    }, 500);
  }

  function stopRecording() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function save() {
    if (!date || !time) return toast.error("Informe data e horário");
    if (!blob) return toast.error("Grave o áudio do compromisso");
    const when = new Date(`${date}T${time}:00`);
    if (Number.isNaN(when.getTime())) return toast.error("Data ou horário inválido");
    setBusy(true);
    try {
      const baseType = blob.type.split(";")[0];
      const ext = MIME_EXT[baseType] ?? "webm";
      const path = await uploadFile("appointments", blob, ext);
      const { error } = await supabase.from("appointments").insert({
        title: title.trim() || null,
        scheduled_at: when.toISOString(),
        audio_url: path,
        duration_seconds: seconds,
        created_by: user?.id ?? null,
        created_by_name: userName,
      });
      if (error) throw error;
      void invalidate("appointments");
      void logHistory(
        userName,
        "criou compromisso",
        title.trim() || when.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      );
      toast.success("Compromisso salvo");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (recording) stopRecording();
        onClose();
      }}
      title="Novo compromisso"
      footer={
        <Button className="flex-1" onClick={() => void save()} disabled={busy || recording || !blob}>
          {busy ? <Spinner /> : "Salvar compromisso"}
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Dia">
          <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Horário">
          <input type="time" className="field" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <Field label="Título (opcional)">
        <input
          className="field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex.: Pediatra da Maria"
        />
      </Field>

      <div className="rounded-2xl border border-dashed border-border bg-secondary/60 p-4 text-center">
        {!recording && !blob && (
          <button
            onClick={() => void startRecording()}
            className="mx-auto flex flex-col items-center gap-2 text-sm font-semibold text-primary"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft">
              <Mic className="h-7 w-7" />
            </span>
            Toque para gravar
          </button>
        )}
        {recording && (
          <button
            onClick={stopRecording}
            className="mx-auto flex flex-col items-center gap-2 text-sm font-semibold text-destructive"
          >
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
              <span className="absolute inset-0 animate-ping rounded-full bg-destructive/40" />
              <Square className="relative h-6 w-6" />
            </span>
            Gravando {fmtDuration(seconds)} — toque para parar
          </button>
        )}
        {!recording && blob && previewUrl && (
          <div className="space-y-3">
            <audio controls src={previewUrl} className="w-full" />
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <span>{fmtDuration(seconds)} gravado</span>
              <button onClick={() => void startRecording()} className="font-semibold text-primary">
                <Plus className="mr-0.5 inline h-3 w-3" />
                Regravar
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        O áudio fica salvo para você e sua esposa ouvirem depois, sem precisar ler.
      </p>
    </Modal>
  );
}
