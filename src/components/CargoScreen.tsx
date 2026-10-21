import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Check, ChevronDown, Download, FileText, Filter, Pencil,
  Plus, Printer, Search, Trash2, Truck, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button, EmptyState, Field, Modal, Pill, Spinner } from "@/components/kit";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  billingCompletionPatch, cargoDay, cargoIdentity, cargoIssueOptions, cargoCsv,
  cargoDifferences, cargoFields, numberValue, quickCargoImport, stageLabel,
  stages, validateDraft,
  type CargoDraft, type CargoHistory, type CargoLoad, type Stage,
} from "@/lib/cargo";

const dateLabel = (v: string) => new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR");
const timeLabel = (v: string) => new Date(v).toLocaleString("pt-BR");
function errorMessage(error: unknown) {
  return error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Não foi possível salvar. Tente novamente.";
}

/* ---------- Regras de classificação da fila ---------- */

type Bucket = "pending" | "printed" | "error" | "done";

const isPrinted = (l: CargoLoad) =>
  ["automatic", "manual"].includes(l.print_status);
const hasCte = (l: CargoLoad) =>
  ["automatic", "manual"].includes(l.cte_status);
const hasIssue = (l: CargoLoad) =>
  !!l.billing_issue && l.billing_issue !== "none" && l.billing_issue !== "Sem impedimento";
const isCancelled = (l: CargoLoad) => l.billing_status === "cancelled";
const isDone = (l: CargoLoad) =>
  l.operational_status === "finished" || l.operational_status === "cancelled";

function bucketOf(l: CargoLoad): Bucket {
  if (isDone(l)) return "done";
  if (hasIssue(l) || isCancelled(l)) return "error";
  if (isPrinted(l) && !hasCte(l)) return "printed";
  return "pending";
}

const BUCKETS: { key: Bucket; label: string; tone: string }[] = [
  { key: "pending", label: "Pendente de faturamento", tone: "warning" },
  { key: "printed", label: "Impressa sem CTe", tone: "accent" },
  { key: "error", label: "Nota com erro", tone: "danger" },
  { key: "done", label: "Finalizada", tone: "success" },
];

/* ---------- Tela ---------- */

export function CargoScreen() {
  return (
    <Suspense fallback={<EmptyState><Spinner /> Carregando cargas...</EmptyState>}>
      <CargoContent />
    </Suspense>
  );
}

function CargoContent() {
  const { profile } = useAuth();
  const household = profile?.household_id;
  const qc = useQueryClient();

  const [selected, setSelected] = useState<string | null>(null);
  const [dayOpen, setDayOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  const { data: loads = [] } = useSuspenseQuery({
    queryKey: ["cargo_loads", household],
    staleTime: 30_000,
    queryFn: async () => {
      if (!household) return [];
      const { data, error } = await supabase
        .from("cargo_loads")
        .select("*,cargo_products(*)")
        .eq("household_id", household)
        .order("imported_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CargoLoad[];
    },
  });

  useEffect(() => {
    if (!household) return;
    const channel = supabase.channel(`cargo-${household}`);
    for (const table of ["cargo_loads", "cargo_products", "cargo_history"])
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        void qc.invalidateQueries({ queryKey: ["cargo_loads", household] });
        void qc.invalidateQueries({ queryKey: ["cargo_history", household] });
      });
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [household, qc]);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["cargo_loads", household] }),
      qc.invalidateQueries({ queryKey: ["cargo_history", household] }),
    ]);
  }

  async function run(action: () => Promise<void>) {
    if (!navigator.onLine) { toast.error("Você está sem conexão."); return; }
    setBusy(true);
    try { await action(); await refresh(); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  }

  async function saveStages(load: CargoLoad, patch: Record<string, unknown>, note: string) {
    await run(async () => {
      const { error } = await supabase.rpc("update_cargo_load", {
        _id: load.id,
        _patch: patch as never,
        _note: note,
        _expected_updated_at: load.updated_at,
      } as never);
      if (error) throw error;
      toast.success("Etapas atualizadas");
    });
  }

  const today = cargoDay();
  const todayLoads = loads.filter((l) => l.scheduled_date === today);
  const activeLoads = todayLoads.length ? todayLoads : loads;

  const byBucket = useMemo(() => {
    const term = search.trim().toLowerCase();
    const match = (l: CargoLoad) =>
      !term ||
      [l.load_number, l.destination_name, l.carrier, l.plate, l.driver_dt]
        .some((v) => String(v ?? "").toLowerCase().includes(term));
    const groups: Record<Bucket, CargoLoad[]> = { pending: [], printed: [], error: [], done: [] };
    for (const l of activeLoads) if (match(l)) groups[bucketOf(l)].push(l);
    for (const k of Object.keys(groups) as Bucket[])
      groups[k].sort((a, b) =>
        (a.load_number ?? "").localeCompare(b.load_number ?? "", "pt-BR", { numeric: true }));
    return groups;
  }, [activeLoads, search]);

  const current = loads.find((l) => l.id === selected) ?? null;
  const workCount = byBucket.pending.length + byBucket.printed.length + byBucket.error.length;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          <h2 className="text-xl">Controle de Cargas</h2>
          {workCount > 0 && <Pill tone="warning">{workCount} em aberto</Pill>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setDayOpen(true)}>
            <FileText className="h-4 w-4" /> Cargas do dia
          </Button>
          <Button size="sm" variant="soft" onClick={() => setPasteOpen(true)}>
            <Plus className="h-4 w-4" /> Importar
          </Button>
        </div>
      </div>

      {/* Tela dividida */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ESQUERDA — a fila */}
        <section className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar carga, destino, placa ou DT"
              className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>

          {activeLoads.length === 0 && (
            <EmptyState>Nenhuma carga importada ainda.</EmptyState>
          )}

          {BUCKETS.map(({ key, label, tone }) => {
            const items = byBucket[key];
            if (!items.length) return null;
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">{label}</h3>
                  <Pill tone={tone as never}>{items.length}</Pill>
                </div>
                {items.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSelected(l.id)}
                    className={`w-full rounded-2xl border p-3 text-left transition-all ${
                      selected === l.id
                        ? "border-primary bg-primary-soft"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">Carga {l.load_number}</span>
                      <span className="text-xs text-muted-foreground">
                        {l.driver_dt ?? "—"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {l.destination_name ?? "Destino não informado"} · {l.carrier ?? "sem transportadora"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {l.plate ?? "sem placa"} · {l.pallets ?? "—"} pallets · {l.cargo_products.length} produtos
                    </p>
                  </button>
                ))}
              </div>
            );
          })}
        </section>

        {/* DIREITA — o espelho */}
        <section>
          {!current ? (
            <EmptyState>Toque em uma carga para abrir o espelho.</EmptyState>
          ) : (
            <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg">Espelho · Carga {current.load_number}</h3>
                  <p className="text-xs text-muted-foreground">
                    DT {current.driver_dt ?? "—"} · {current.carrier ?? "sem transportadora"} ·{" "}
                    {current.destination_name ?? "sem destino"}
                  </p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setSelected(null)} aria-label="Fechar espelho">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Ações no topo */}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => saveStages(current, { print_status: "manual" }, "Marcada como impressa")}
                >
                  <Printer className="h-4 w-4" /> Marcar impressa
                </Button>
                <Button
                  size="sm" variant="outline" disabled={busy}
                  onClick={() => saveStages(current, {}, "Consulta — CTe ainda não recebido")}
                >
                  <AlertTriangle className="h-4 w-4" /> Nota com erro
                </Button>
                <Button
                  size="sm" variant="outline" disabled={busy}
                  onClick={() => saveStages(current, billingCompletionPatch(current), "Faturamento concluído")}
                >
                  <Check className="h-4 w-4" /> Finalizar
                </Button>
              </div>

              {/* Dados gerais */}
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Dados gerais</h4>
                  <Button size="icon" variant="ghost" aria-label="Editar dados gerais"
                    onClick={() => setSelected(current.id)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {cargoFields.map(([key, label]) => (
                    <div key={key}>
                      <dt className="text-[11px] uppercase text-muted-foreground">{label}</dt>
                      <dd>{String(current[key as keyof CargoLoad] ?? "—") || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Produtos */}
              <div>
                <h4 className="text-sm font-semibold">Produtos da carga</h4>
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase text-muted-foreground">
                      <th className="pb-1">Código</th>
                      <th className="pb-1">Descrição</th>
                      <th className="pb-1 text-right">Caixas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.cargo_products.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="py-1.5">{p.product_code}</td>
                        <td className="py-1.5">{p.description}</td>
                        <td className="py-1.5 text-right">{Number(p.boxes).toLocaleString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-xs text-muted-foreground">
                  Total: {current.cargo_products.reduce((s, p) => s + Number(p.boxes), 0).toLocaleString("pt-BR")} caixas
                  · {current.pallets ?? "—"} pallets
                </p>
              </div>

              {/* Acompanhamento */}
              <div className="grid grid-cols-2 gap-2">
                {(["billing_status", "cte_status", "print_status", "operational_status"] as Stage[]).map((key) => (
                  <Field key={key} label={stages[key].label}>
                    <select
                      value={String(current[key] ?? "")}
                      disabled={busy}
                      onChange={(e) => saveStages(current, { [key]: e.target.value }, "Etapa alterada")}
                      className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary"
                    >
                      {stages[key].options.map(([value, text]) => (
                        <option key={value} value={value}>{text}</option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>

              <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
                <ChevronDown className="h-4 w-4" /> Histórico de movimentações
              </Button>
            </div>
          )}
        </section>
      </div>

      {/* Cargas do dia / histórico */}
      <Modal open={dayOpen} onClose={() => setDayOpen(false)} title="Cargas do dia">
        <DayList loads={loads} onPick={(id) => { setSelected(id); setDayOpen(false); }} />
      </Modal>

      {/* Importar */}
      <Modal open={pasteOpen} onClose={() => setPasteOpen(false)} title="Importar cargas">
        <PasteCargo busy={busy} onSubmit={async (value) => {
          await run(async () => {
            const loads = quickCargoImport(value);
            if (!loads.length) throw new Error("Nenhuma carga reconhecida no texto colado.");
            const payload = loads.map((d) => ({
              ...d,
              products: d.products.map((p) => ({ ...p, boxes: numberValue(p.boxes) })),
              confirm_update: false,
              expected_updated_at: null,
            }));
            const { error } = await supabase.rpc("import_cargo_loads", { _loads: payload });
            if (error) throw error;
            toast.success("Cargas importadas");
            setPasteOpen(false);
          });
        }} />
      </Modal>

      {/* Histórico */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Histórico de movimentações">
        {current && <HistoryList load={current} />}
      </Modal>
    </div>
  );
}

/* ---------- Cargas do dia ---------- */

function DayList({ loads, onPick }: { loads: CargoLoad[]; onPick: (id: string) => void }) {
  const [day, setDay] = useState(cargoDay());
  const days = useMemo(
    () => Array.from(new Set(loads.map((l) => l.scheduled_date))).sort().reverse().slice(0, 31),
    [loads],
  );
  const items = loads.filter((l) => l.scheduled_date === day);

  return (
    <div className="space-y-3">
      <Field label="Dia">
        <select
          value={day} onChange={(e) => setDay(e.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:border-primary"
        >
          {days.map((d) => (
            <option key={d} value={d}>
              {dateLabel(d)}{d === cargoDay() ? " · hoje" : ""}
            </option>
          ))}
        </select>
      </Field>

      {items.length === 0 && <EmptyState>Nenhuma carga nesse dia.</EmptyState>}
      {items.map((l) => (
        <button
          key={l.id} onClick={() => onPick(l.id)}
          className="w-full rounded-xl border border-border bg-card p-3 text-left hover:border-primary/40"
        >
          <span className="font-semibold">Carga {l.load_number}</span>
          <p className="text-xs text-muted-foreground">
            {l.destination_name ?? "sem destino"} · {l.carrier ?? "sem transportadora"} ·{" "}
            {l.cargo_products.reduce((s, p) => s + Number(p.boxes), 0).toLocaleString("pt-BR")} caixas
          </p>
        </button>
      ))}

      <Button
        variant="outline" size="sm"
        onClick={() => {
          const csv = cargoCsv(items, true);
          const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
          const a = document.createElement("a");
          a.href = url; a.download = `cargas-${day}.csv`; a.click();
          URL.revokeObjectURL(url);
        }}
      >
        <Download className="h-4 w-4" /> Baixar CSV do dia
      </Button>
    </div>
  );
}

/* ---------- Histórico ---------- */

function HistoryList({ load }: { load: CargoLoad }) {
  const { data: history = [], isError } = useQuery({
    queryKey: ["cargo_history", load.household_id, load.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cargo_history").select("*")
        .eq("household_id", load.household_id).eq("load_id", load.id)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CargoHistory[];
    },
  });

  if (isError) return <EmptyState>Não foi possível carregar o histórico.</EmptyState>;
  if (!history.length) return <EmptyState>Sem movimentações registradas.</EmptyState>;

  return (
    <div className="space-y-2">
      {history.map((h) => (
        <div key={h.id} className="rounded-xl border-l-2 border-primary bg-secondary/40 p-2 text-sm">
          <p className="font-semibold">
            {h.field in stages ? stageLabel(h.field as Stage, String(h.value ?? "")) : h.field}
          </p>
          <p className="text-xs text-muted-foreground">
            {timeLabel(h.changed_at)}{h.note ? ` · ${h.note}` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ---------- Importação ---------- */

function PasteCargo({ busy, onSubmit }: { busy: boolean; onSubmit: (v: string) => Promise<void> }) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-3">
      <Field label="Cole aqui os dados da planilha ou e-mail">
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={8}
          className="w-full rounded-xl border border-border bg-card p-3 text-sm outline-none focus:border-primary"
        />
      </Field>
      <div className="flex gap-2">
        <Button disabled={busy || !text.trim()} onClick={() => void onSubmit(text)}>
          {busy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Importar
        </Button>
        <Button variant="ghost" onClick={() => setText("")}>
          <Trash2 className="h-4 w-4" /> Limpar
        </Button>
      </div>
    </div>
  );
}
