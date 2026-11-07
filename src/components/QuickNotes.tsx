import { Fragment, useEffect, useRef, useState } from "react";
import { Check, History, Plus, StickyNote, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState, Spinner } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";

type Note = {
  id: string;
  body: string;
  done: boolean;
  note_date: string;
  created_by_name: string | null;
};

const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const dateLabel = (v: string) =>
  new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

const dataLonga = (v: string) =>
  new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
  });

export function QuickNotes({ userName }: { userName: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [diaAberto, setDiaAberto] = useState<string | null>(null);

  // posição do botão, guardada no aparelho
  const [pos, setPos] = useState(() => {
    try {
      const raw = localStorage.getItem("quicknotes-pos");
      if (raw) return JSON.parse(raw) as { x: number; y: number };
    } catch { /* ignora */ }
    return { x: window.innerWidth - 72, y: window.innerHeight - 140 };
  });

  const drag = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["notes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .order("note_date", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(400);
      if (error) throw error;
      return (data ?? []) as Note[];
    },
    enabled: open,
  });

  // mantém o dedo no botão
  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y, moved: false };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) drag.current.moved = true;

    const size = 52;
    const x = Math.min(Math.max(8, drag.current.originX + dx), window.innerWidth - size - 8);
    const y = Math.min(Math.max(80, drag.current.originY + dy), window.innerHeight - size - 8);
    setPos({ x, y });
  }

  function onPointerUp() {
    if (drag.current && !drag.current.moved) setOpen((v) => !v);
    drag.current = null;
    setDragging(false);
    try { localStorage.setItem("quicknotes-pos", JSON.stringify(pos)); } catch { /* ignora */ }
  }

  async function add() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    const { error } = await supabase.from("notes").insert({
      body,
      note_date: today(),
      created_by_name: userName,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setText("");
    void qc.invalidateQueries({ queryKey: ["notes"] });
  }

  async function toggle(note: Note) {
    const { error } = await supabase.from("notes").update({ done: !note.done }).eq("id", note.id);
    if (error) return toast.error(error.message);
    void qc.invalidateQueries({ queryKey: ["notes"] });
  }

  async function remove(note: Note) {
    if (!confirm("Apagar esta anotação?")) return;
    const { error } = await supabase.from("notes").delete().eq("id", note.id);
    if (error) return toast.error(error.message);
    void qc.invalidateQueries({ queryKey: ["notes"] });
  }

  const todayKey = today();
  const pendentes = notes.filter((n) => !n.done && n.note_date <= todayKey);
  const feitasHoje = notes.filter((n) => n.done && n.note_date === todayKey);
  const historico = notes.filter((n) => n.note_date < todayKey);

  const historicoDias = Object.entries(
    historico.reduce<Record<string, Note[]>>((mapa, n) => {
      mapa[n.note_date] = [...(mapa[n.note_date] ?? []), n];
      return mapa;
    }, {}),
  ).sort((a, b) => b[0].localeCompare(a[0]));

  const fecharPainel = () => {
    setOpen(false);
    setShowHistory(false);
    setDiaAberto(null);
  };

  return (
    <>
      {/* botão flutuante */}
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ left: pos.x, top: pos.y, touchAction: "none" }}
        className={`fixed z-50 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform ${
          dragging ? "scale-110" : ""
        }`}
        aria-label="Anotações do dia"
      >
        <StickyNote className="h-6 w-6" />
        {pendentes.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {pendentes.length}
          </span>
        )}
      </button>

      {/* painel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <StickyNote className="h-4 w-4 text-primary" /> Anotações
              </h3>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={showHistory ? "primary" : "ghost"}
                  className="h-7 px-2 text-[12px]"
                  onClick={() => setShowHistory((v) => !v)}
                >
                  <History className="h-3.5 w-3.5" /> Histórico
                </Button>
                <Button size="icon" variant="ghost" onClick={fecharPainel} aria-label="Fechar">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {!showHistory && (
              <>
                <div className="mt-2 flex gap-2">
                  <input
                    className="field flex-1"
                    placeholder="Escreva o que não pode esquecer..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void add()}
                  />
                  <Button disabled={busy || !text.trim()} onClick={() => void add()}>
                    {busy ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>

                <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
                  {isLoading && <EmptyState>Carregando...</EmptyState>}
                  {!isLoading && !pendentes.length && !feitasHoje.length && (
                    <EmptyState>Nada anotado ainda.</EmptyState>
                  )}

                  {pendentes.map((n) => (
                    <div key={n.id} className="flex items-start gap-2 rounded-xl bg-secondary p-2">
                      <button type="button" onClick={() => void toggle(n)} className="mt-0.5" aria-label="Concluir">
                        <span className="block h-4 w-4 rounded border border-border" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{n.body}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {dateLabel(n.note_date)}
                          {n.note_date < todayKey ? " · de outro dia" : ""}
                          {n.created_by_name ? ` · ${n.created_by_name}` : ""}
                        </p>
                      </div>
                      <button type="button" onClick={() => void remove(n)} aria-label="Apagar">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  ))}

                  {feitasHoje.map((n) => (
                    <div key={n.id} className="flex items-start gap-2 rounded-xl bg-secondary/60 p-2">
                      <button type="button" onClick={() => void toggle(n)} className="mt-0.5" aria-label="Reabrir">
                        <Check className="h-4 w-4 text-primary" />
                      </button>
                      <p className="min-w-0 flex-1 text-sm line-through opacity-60">{n.body}</p>
                      <button type="button" onClick={() => void remove(n)} aria-label="Apagar">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {showHistory && (
              <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto">
                {isLoading && <EmptyState>Carregando...</EmptyState>}

                {!isLoading && !historicoDias.length && (
                  <EmptyState>Nenhuma anotação em dias anteriores.</EmptyState>
                )}

                {historicoDias.map(([dia, itens]) => (
                  <Fragment key={dia}>
                    <button
                      type="button"
                      onClick={() => setDiaAberto((atual) => (atual === dia ? null : dia))}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                        diaAberto === dia ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <span className="text-sm font-semibold">{dataLonga(dia)}</span>
                      <span className="text-[12px] text-muted-foreground">
                        {itens.length} anotaç{itens.length === 1 ? "ão" : "ões"}
                      </span>
                    </button>

                    {diaAberto === dia && (
                      <div className="space-y-1 rounded-xl bg-secondary/50 p-2">
                        {itens.map((n) => (
                          <div key={n.id} className="flex items-start gap-2">
                            <button type="button" onClick={() => void toggle(n)} className="mt-0.5" aria-label="Alternar">
                              {n.done ? (
                                <Check className="h-4 w-4 text-primary" />
                              ) : (
                                <span className="block h-4 w-4 rounded border border-border" />
                              )}
                            </button>
                            <p className={`min-w-0 flex-1 text-sm ${n.done ? "line-through opacity-60" : ""}`}>
                              {n.body}
                            </p>
                            <button type="button" onClick={() => void remove(n)} aria-label="Apagar">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Fragment>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
