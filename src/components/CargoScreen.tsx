import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowLeft, Check, ChevronDown, Download, FileText, Pencil,
  Plus, Printer, Search, Trash2, Truck, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button, EmptyState, Field, Modal, Pill, Spinner } from "@/components/kit";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  billingCompletionPatch, cargoCsv, cargoDay, cargoFields, cargoIssueOptions,
  numberValue, quickCargoImport, stageLabel, stages, validateDraft,
  type CargoDraft, type CargoHistory, type CargoLoad, type Stage,
} from "@/lib/cargo";

const dateLabel = (v: string) =>
  v ? new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const timeLabel = (v: string) => new Date(v).toLocaleString("pt-BR");

function errorMessage(error: unknown) {
  return error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Não foi possível salvar. Tente novamente.";
}

/* ---------- Classificação ---------- */

type Bucket = "pending" | "error" | "printed" | "done";

const isPrinted = (l: CargoLoad) => ["automatic", "manual"].includes(l.print_status);
const hasCte = (l: CargoLoad) => ["automatic", "manual"].includes(l.cte_status);
const hasIssue = (l: CargoLoad) => !!l.billing_issue && l.billing_issue !== "none";
const isDone = (l: CargoLoad) => ["finished", "cancelled"].includes(l.operational_status);

function bucketOf(l: CargoLoad): Bucket {
  if (isDone(l)) return "done";
  if (hasIssue(l)) return "error";
  if (isPrinted(l) && !hasCte(l)) return "printed";
  return "pending";
}

const BUCKETS: { key: Bucket; label: string; tone: string }[] = [
  { key: "pending", label: "Pendente de faturamento", tone: "warning" },
  { key: "error", label: "Nota com erro", tone: "danger" },
  { key: "printed", label: "Impressa sem CTe", tone: "accent" },
  { key: "done", label: "Finalizada", tone: "success" },
];

/** PLACA - 4 últimos do DT | transportadora */
function shortLabel(l: CargoLoad) {
  const plate = (l.plate ?? "").trim().toUpperCase() || "SEM PLACA";
  const dt = (l.driver_dt ?? "").trim();
  const tail = dt.length >= 4 ? dt.slice(-4) : dt;
  const carrier = (l.carrier ?? "").trim() || "sem transportadora";
  return dt ? `${plate} - ${tail} | ${carrier}` : `${plate} | ${carrier}`;
}

const loadPallets = (l: CargoLoad) =>
  l.cargo_products.reduce((s, p) => {
    const raw = (p.extra_fields as Record<string, unknown>)?.["Pallets do produto"];
    const n = numberValue(String(raw ?? ""));
    return s + (n ?? 0);
  }, 0);

const productPallets = (p: CargoLoad["cargo_products"][number]) =>
  (p.extra_fields as Record<string, unknown>)?.["Pallets do produto"] ?? "—";

const byDt = (a: CargoLoad, b: CargoLoad) =>
  String(a.driver_dt ?? "").localeCompare(String(b.driver_dt ?? ""), "pt-BR", { numeric: true });

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
  const [pasteOpen, setPasteOpen] = useState(false);
  const [daysOpen, setDaysOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [showDone, setShowDone] = useState(false);
  /** null = fila de hoje; "2026-10-10" = histórico daquele dia */
  const [viewDay, setViewDay] = useState<string | null>(null);

  const { data: loads = [] } = useSuspenseQuery({
    queryKey: ["cargo_loads", household],
    staleTime: 30_000,
    queryFn: async () => {
      if (!household) return [];
      const { data, error } = await supabase
        .from("cargo_loads")
        .select("*,cargo_products(*)")
        .eq("household_id", household)
        .order("registered_at", { ascending: false });
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
    await qc.refetchQueries({ queryKey: ["cargo_loads", household] });
  }

  async function run(action: () => Promise<void>) {
    if (!navigator.onLine) { toast.error("Você está sem conexão."); return; }
    setBusy(true);
    try { await action(); await refresh(); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  }

  /**
   * Grava direto na tabela, sem o _expected_updated_at.
   * O RPC antigo devolvia sucesso mesmo quando o timestamp não batia,
   * e o status voltava sozinho na tela seguinte.
   */
    async function saveStages(load: CargoLoad, patch: Record<string, unknown>, note: string) {
    if (!navigator.onLine) { toast.error("Você está sem conexão."); return; }
    const key = ["cargo_loads", household];

    // 1) Mostra a mudança na hora, sem esperar o banco
    qc.setQueryData<CargoLoad[]>(key, (old) =>
      (old ?? []).map((l) => (l.id === load.id ? ({ ...l, ...patch } as CargoLoad) : l)),
    );

    setBusy(true);
    try {
      // 2) Pega o carimbo de atualização mais recente direto do banco
      const { data: fresh, error: readError } = await supabase
        .from("cargo_loads")
        .select("updated_at")
        .eq("id", load.id)
        .single();
      if (readError) throw readError;

      // 3) Grava pela função do próprio app
      const { error } = await supabase.rpc("update_cargo_load", {
        _id: load.id,
        _patch: patch as never,
        _note: note,
        _expected_updated_at: fresh.updated_at,
      } as never);
      if (error) throw error;

      toast.success("Carga atualizada");
    } catch (e) {
      // Se falhar, desfaz a mudança na tela e mostra o motivo real
      toast.error(errorMessage(e));
    } finally {
      await qc.invalidateQueries({ queryKey: key });
      setBusy(false);
    }
  }

    async function deleteLoad(load: CargoLoad) {
    if (bucketOf(load) !== "pending") return;
    if (!window.confirm(`Excluir a carga ${shortLabel(load)}? Isso não dá para desfazer.`)) return;
    if (!navigator.onLine) { toast.error("Você está sem conexão."); return; }

    const key = ["cargo_loads", household];
    setBusy(true);
    setSelected(null);
    // some da tela na hora
    qc.setQueryData<CargoLoad[]>(key, (old) => (old ?? []).filter((l) => l.id !== load.id));
    try {
      const { data, error } = await supabase
        .from("cargo_loads")
        .delete()
        .eq("id", load.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("O banco não permitiu excluir essa carga.");
      }
      toast.success("Carga excluída");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      // se falhou, a carga volta para a lista com o valor real do banco
      await qc.invalidateQueries({ queryKey: key });
      setBusy(false);
    }
  }


  /* Fila do dia / dia escolhido no histórico */
  const today = cargoDay();
  const activeDay = viewDay ?? today;

  const dayLoads = useMemo(
    () => loads.filter((l) => cargoDay(new Date(l.registered_at)) === activeDay),
    [loads, activeDay],
  );

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const match = (l: CargoLoad) =>
      !term ||
      [l.load_number, l.destination_name, l.carrier, l.plate, l.driver_dt]
        .some((v) => String(v ?? "").toLowerCase().includes(term));
    const out: Record<Bucket, CargoLoad[]> = { pending: [], error: [], printed: [], done: [] };
    for (const l of dayLoads) if (match(l)) out[bucketOf(l)].push(l);
    for (const k of Object.keys(out) as Bucket[]) out[k].sort(byDt);
    return out;
  }, [dayLoads, search]);

  const current = loads.find((l) => l.id === selected) ?? null;
  const visible = [
    ...groups.pending, ...groups.error, ...groups.printed,
    ...(showDone ? groups.done : []),
  ];
  const openCount = groups.pending.length + groups.error.length + groups.printed.length;
  const isHistory = viewDay !== null;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          <h2 className="text-xl">Controle de Cargas</h2>
          {openCount > 0 && <Pill tone={"warning" as never}>{openCount} em aberto</Pill>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setDaysOpen(true)}>
            <FileText className="h-4 w-4" /> Histórico
          </Button>
          <Button size="sm" variant="soft" onClick={() => setPasteOpen(true)}>
            <Plus className="h-4 w-4" /> Importar
          </Button>
        </div>
      </div>

      {/* Aviso do dia no histórico */}
      {isHistory && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-primary-soft px-3 py-2">
          <span className="text-[13px] font-semibold text-primary">
            Mostrando {dateLabel(activeDay)}
          </span>
          <Button size="sm" variant="ghost" onClick={() => { setViewDay(null); setSelected(null); }}>
            <ArrowLeft className="h-4 w-4" /> Voltar para hoje
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ESQUERDA — lista */}
        <section className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar placa, DT, destino ou transportadora"
              className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>

          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <input
              type="checkbox" checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            Mostrar finalizadas na lista
          </label>

          {dayLoads.length === 0 && (
            <EmptyState>
              {isHistory ? "Nenhuma carga registrada nesse dia." : "Nenhuma carga importada hoje."}
            </EmptyState>
          )}
          {dayLoads.length > 0 && visible.length === 0 && (
            <EmptyState>
              {showDone ? "Nada para mostrar." : "Tudo finalizado. Marque a opção acima para ver."}
            </EmptyState>
          )}

          {BUCKETS.map(({ key, label, tone }) => {
            if (key === "done" && !showDone) return null;
            const items = groups[key];
            if (!items.length) return null;
            return (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold text-muted-foreground">{label}</h3>
                  <Pill tone={tone as never}>{items.length}</Pill>
                </div>
                {items.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSelected(l.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-all ${
                      selected === l.id
                        ? "border-primary bg-primary-soft"
                        : "border-border bg-card hover:border-primary/40"
                    } ${key === "done" ? "opacity-70" : ""}`}
                  >
                    <span className="block truncate text-sm font-semibold">{shortLabel(l)}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {l.destination_name ?? "sem destino"} · {loadPallets(l)} plt ·{" "}
                      {l.cargo_products.reduce((s, p) => s + Number(p.boxes), 0).toLocaleString("pt-BR")} cx
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </section>

        {/* DIREITA — espelho */}
        <section>
          {!current ? (
            <EmptyState>Toque em uma carga para abrir o espelho.</EmptyState>
          ) : (
            <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-base">{shortLabel(current)}</h3>
                  <p className="truncate text-xs text-muted-foreground">
                    {current.destination_name ?? "sem destino"} · {dateLabel(current.scheduled_date)}
                  </p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setSelected(null)} aria-label="Fechar espelho">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy}
                  onClick={() => saveStages(current, { print_status: "manual" }, "Marcada como impressa")}>
                  <Printer className="h-4 w-4" /> Impressa
                </Button>
                <Button size="sm" variant="outline" disabled={busy}
                  onClick={() => saveStages(current, { billing_issue: "error" }, "Nota com erro")}>
                  <AlertTriangle className="h-4 w-4" /> Erro
                </Button>
                <Button size="sm" variant="outline" disabled={busy}
                  nClick={() => saveStages(current, { ...billingCompletionPatch(), operational_status: "finished" }, "Carga finalizada", )}
                  <Check className="h-4 w-4" /> Finalizar
                </Button>

                {bucketOf(current) === "pending" && (<Button size="sm" variant="dangerGhost" disabled={busy} onClick={() => deleteLoad(current)}>
                  <Trash2 className="h-4 w-4" /> Excluir
                </Button> )}
              </div>

              {/* Produtos: código, descrição, pallets por produto */}
              <div>
                <h4 className="text-[13px] font-semibold">Produtos</h4>
                <table className="mt-1 w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase text-muted-foreground">
                      <th className="pb-1">Código</th>
                      <th className="pb-1">Descrição</th>
                      <th className="pb-1 text-right">Pallets</th>
                      <th className="pb-1 text-right text-[9px]">Caixas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.cargo_products.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="py-1 pr-2 text-muted-foreground">{p.product_code}</td>
                        <td className="py-1 pr-2">{p.description}</td>
                        <td className="py-1 text-right font-semibold whitespace-nowrap">
                          {String(productPallets(p))}
                        </td>
                        <td className="py-1 text-right text-[11px] text-muted-foreground whitespace-nowrap">
                          {Number(p.boxes).toLocaleString("pt-BR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Total {loadPallets(current)} pallets ·{" "}
                  {current.cargo_products.reduce((s, p) => s + Number(p.boxes), 0).toLocaleString("pt-BR")} caixas
                </p>
              </div>

              {/* Placa, DT, pallets totais, transportadora */}
              <div className="grid grid-cols-4 gap-2 rounded-xl bg-secondary/50 p-2 text-[12px]">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Placa</p>
                  <p className="font-semibold">{current.plate ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">DT</p>
                  <p className="font-semibold">{current.driver_dt ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Pallets</p>
                  <p className="font-semibold">{loadPallets(current)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase text-muted-foreground">Transportadora</p>
                  <p className="truncate font-semibold">{current.carrier ?? "—"}</p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                {cargoFields
                  .filter(([key]) => !["plate", "driver_dt", "carrier", "destination_name", "pallets"].includes(key))
                  .map(([key, label]) => (
                    <div key={key} className="flex gap-1">
                      <dt className="text-muted-foreground">{label}:</dt>
                      <dd className="truncate">
                        {key === "scheduled_date"
                          ? dateLabel(String(current.scheduled_date ?? ""))
                          : String(current[key as keyof CargoLoad] ?? "—") || "—"}
                      </dd>
                    </div>
                  ))}
              </dl>

              <Field label="Impedimento no faturamento">
                <select
                  value={current.billing_issue ?? "none"}
                  disabled={busy}
                  onChange={(e) => saveStages(current, { billing_issue: e.target.value }, "Impedimento alterado")}
                  className="h-10 w-full rounded-xl border border-border bg-card px-3 text-[13px] outline-none focus:border-primary"
                >
                  {cargoIssueOptions.map(([value, text]) => (
                    <option key={value} value={value}>{text}</option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-2">
                {(["billing_status", "cte_status", "print_status", "operational_status"] as Stage[]).map((key) => (
                  <Field key={key} label={stages[key].label}>
                    <select
                      value={String(current[key] ?? "")}
                      disabled={busy}
                      onChange={(e) => saveStages(current, { [key]: e.target.value }, "Etapa alterada")}
                      className="h-10 w-full rounded-xl border border-border bg-card px-2 text-[13px] outline-none focus:border-primary"
                    >
                      {stages[key].options.map(([value, text]) => (
                        <option key={value} value={value}>{text}</option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => setDaysOpen(true)}>
                  <ChevronDown className="h-4 w-4" /> Histórico
                </Button>
                <Button size="sm" variant="ghost" disabled={busy}>
                  <Pencil className="h-4 w-4" /> Observações
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Dias com carga registrada */}
      <Modal open={daysOpen} onClose={() => setDaysOpen(false)} title="Histórico — escolha o dia">
        <DayPicker
          loads={loads}
          onPick={(day) => {
            setViewDay(day);
            setSelected(null);
            setDaysOpen(false);
            setShowDone(true);
          }}
        />
      </Modal>

      {/* Importar */}
      <Modal open={pasteOpen} onClose={() => setPasteOpen(false)} title="Importar cargas">
        <ImportCargo
          busy={busy}
          existing={loads}
          onImport={async (chosen) => {
            await run(async () => {
              const payload = chosen.map((d) => ({
                ...d,
                products: d.products.map((p) => ({ ...p, boxes: numberValue(p.boxes) })),
                confirm_update: !!loads.find(
                  (l) => (l.plate ?? "") === d.plate && (l.driver_dt ?? "") === (d.driver_dt ?? ""),
                ),
                expected_updated_at: null,
              }));
              const { error } = await supabase.rpc("import_cargo_loads", { _loads: payload as never });
              if (error) throw error;
              toast.success(`${payload.length} carga(s) importada(s)`);
              setPasteOpen(false);
            });
          }}
        />
      </Modal>
    </div>
  );
}

/* ---------- Escolha do dia ---------- */

function DayPicker({ loads, onPick }: { loads: CargoLoad[]; onPick: (day: string) => void }) {
  const days = useMemo(() => {
    const map = new Map<string, CargoLoad[]>();
    for (const l of loads) {
      const key = cargoDay(new Date(l.registered_at));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [loads]);

  const today = cargoDay();
  if (!days.length) return <EmptyState>Nenhuma carga registrada ainda.</EmptyState>;

  return (
    <div className="space-y-2">
      {days.map(([day, items]) => (
        <button
          key={day} onClick={() => onPick(day)}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left hover:border-primary/40"
        >
          <span className="text-sm font-semibold">
            {dateLabel(day)}{day === today ? " · hoje" : ""}
          </span>
          <span className="text-[12px] text-muted-foreground">
            {items.length} carga(s)
          </span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Importação ---------- */

function ImportCargo({
  busy, existing, onImport,
}: {
  busy: boolean;
  existing: CargoLoad[];
  onImport: (chosen: CargoDraft[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const result = useMemo(
    () => (text.trim() ? quickCargoImport(text, existing) : null),
    [text, existing],
  );

  const ready = result?.ready ?? [];
  const review = result?.review ?? [];
  const unparsed = result?.unparsed ?? [];
  const unchanged = result?.unchanged ?? 0;

  return (
    <div className="space-y-3">
      <Field label="Cole aqui os dados da planilha ou e-mail">
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={7}
          className="w-full rounded-xl border border-border bg-card p-3 text-sm outline-none focus:border-primary"
        />
      </Field>

      {result && (
        <div className="space-y-2 text-[13px]">
          <p>
            <strong>{ready.length}</strong> pronta(s) ·{" "}
            <strong>{review.length}</strong> para conferir ·{" "}
            <strong>{unchanged}</strong> sem mudança
          </p>

          {ready.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-2">
              <p className="font-semibold">Prontas para importar</p>
              {ready.map((d, i) => (
                <p key={`r${i}`} className="truncate text-[12px] text-muted-foreground">
                  {d.plate || "sem placa"} - {(d.driver_dt ?? "").slice(-4)} | {d.carrier || "sem transp."} ·{" "}
                  {d.load_number} · {d.destination_name || "sem destino"}
                </p>
              ))}
            </div>
          )}

          {review.length > 0 && (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-2">
              <p className="font-semibold">Para conferir</p>
              {review.map((d, i) => (
                <div key={`v${i}`} className="mt-1">
                  <p className="truncate text-[12px]">
                    {d.plate || "sem placa"} - {(d.driver_dt ?? "").slice(-4)} | {d.load_number}
                  </p>
                  {d.warnings.map((w, j) => (
                    <p key={j} className="pl-3 text-[11px] text-muted-foreground">⚠ {w}</p>
                  ))}
                  {validateDraft(d).map((e, j) => (
                    <p key={j} className="pl-3 text-[11px] text-destructive">✕ {e}</p>
                  ))}
                </div>
              ))}
            </div>
          )}

          {unparsed.length > 0 && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-2">
              <p className="font-semibold">{unparsed.length} linha(s) não reconhecida(s)</p>
              {unparsed.slice(0, 5).map((l, i) => (
                <p key={i} className="truncate text-[11px] text-muted-foreground">{l}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button disabled={busy || (!ready.length && !review.length)}
          onClick={() => void onImport([...ready, ...review])}>
          {busy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          Importar {ready.length + review.length || ""}
        </Button>
        <Button variant="ghost" onClick={() => setText("")}>
          <Trash2 className="h-4 w-4" /> Limpar
        </Button>
      </div>
    </div>
  );
}
