import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowLeft, Check, ChevronDown, Download, FileText, Pencil,
  Plus, Printer, Scissors, Search, Trash2, Truck, X,
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

/* ---------- Grupos e cores ---------- */

type Bucket = "pending" | "invoiced" | "printed" | "cut" | "done";

const isPrinted = (l: CargoLoad) => ["automatic", "manual"].includes(l.print_status);
const isDone = (l: CargoLoad) => l.operational_status === "finished";
const isCut = (l: CargoLoad) =>
  !!l.billing_issue && l.billing_issue !== "none" && !isDone(l);

/** Faturado: nota emitida, mas o CT-e ainda não foi solicitado nem recebido. */
const isInvoiced = (l: CargoLoad) => l.billing_status === "issued" && !isPrinted(l);

function bucketOf(l: CargoLoad): Bucket {
  if (isDone(l)) return "done";
  if (isCut(l)) return "cut";
  if (isInvoiced(l)) return "invoiced";
  if (isPrinted(l)) return "printed";
  return "pending";
}

type Tone = { label: string; tone: string; card: string };

const BUCKETS: Record<Bucket, Tone> = {
  pending: {
    label: "Pendente",
    tone: "warning",
    card: "border-border bg-secondary",
  },
  invoiced: {
    label: "Faturado",
    tone: "accent",
    card: "border-primary/50 bg-primary-soft",
  },
  printed: {
    label: "Impressa ag. CT-e",
    tone: "accent",
    card: "border-warning/60 bg-warning/25",
  },
  cut: {
    label: "Corte",
    tone: "danger",
    card: "border-destructive/60 bg-destructive/20",
  },
  done: {
    label: "Finalizada",
    tone: "success",
    card: "border-success/60 bg-success/20",
  },
};

const ORDER: Bucket[] = ["pending", "invoiced", "printed", "cut", "done"];

const cardClass = (b: Bucket | null) =>
  b ? BUCKETS[b].card : "border-border bg-card";

/** Placa no formato do cliente: GHE1B55 ED */
function plateLabel(l: CargoLoad) {
  const raw = (l.plate ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return raw ? `${raw}  ED` : "SEM PLACA";
}

/** 4 últimos dígitos do DT */
function dtTail(l: CargoLoad) {
  const dt = (l.driver_dt ?? "").trim();
  return dt.length >= 4 ? dt.slice(-4) : dt;
}

/** Rótulo completo: GHE1B55 ED - 9939 | Ghelere */
function shortLabel(l: CargoLoad) {
  const tail = dtTail(l);
  const carrier = (l.carrier ?? "").trim() || "sem transportadora";
  return tail ? `${plateLabel(l)} - ${tail} | ${carrier}` : `${plateLabel(l)} | ${carrier}`;
}


/** Há quanto tempo a carga está parada, em texto curto. */
function elapsed(since: string): string {
  const ms = Date.now() - new Date(since).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `Há ${s} segundo${s === 1 ? "" : "s"}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `Há ${m} minuto${m === 1 ? "" : "s"}`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `Há ${h}h ${rest}min` : `Há ${h} hora${h === 1 ? "" : "s"}`;
}

/** Já passou do tempo de espera? */
const LATE_MINUTES = 30;
function isLate(since: string): boolean {
  return Date.now() - new Date(since).getTime() >= LATE_MINUTES * 60_000;
}

/** A carga em Faturado, com a hora em que foi faturada (do histórico). */
type InvoicedLoad = { load: CargoLoad; since: string };

const loadPallets = (l: CargoLoad) =>
  l.cargo_products.reduce((sum, p) => {
    const raw = (p.extra_fields as Record<string, unknown>)?.["Pallets do produto"];
    return sum + (numberValue(String(raw ?? "")) ?? 0);
  }, 0);

const productPallets = (p: CargoLoad["cargo_products"][number]) =>
  (p.extra_fields as Record<string, unknown>)?.["Pallets do produto"] ?? "—";

const byDt = (a: CargoLoad, b: CargoLoad) =>
  String(a.driver_dt ?? "").localeCompare(String(b.driver_dt ?? ""), "pt-BR", { numeric: true });

/** Faixa do contador no card. Atualiza sozinha a cada 30 segundos. */
function WaitBadge({ since }: { since: string }) {
  const [, tick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const late = isLate(since);

  return (
    <span
      className={`shrink-0 self-start rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        late
          ? "bg-destructive text-destructive-foreground"
          : "bg-background/70 text-muted-foreground"
      }`}
      title={`Faturado em ${new Date(since).toLocaleString("pt-BR")}`}
    >
      {elapsed(since)}
    </span>
  );
}

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
  const [vehicleOpen, setVehicleOpen] = useState(false);
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

   /** Hora do faturamento de cada carga — lê do histórico. */
  const { data: invoicedAt = {} } = useQuery({
    queryKey: ["cargo_history_invoiced", household],
    enabled: !!household,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cargo_history")
        .select("load_id,changed_at,field,value")
        .eq("household_id", household!)
        .order("changed_at", { ascending: false });
      if (error) throw error;

      const map: Record<string, string> = {};
      for (const h of data ?? []) {
        // só os registros de faturamento, e só o mais recente de cada carga
        if (h.field !== "billing_status" || h.value !== "issued") continue;
        if (!map[h.load_id]) map[h.load_id] = h.changed_at;
      }
      return map;
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

  /** Grava pela função do app, atualizando a tela na hora. */
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

    /** Excluir: apaga histórico, produtos e a carga. */
  async function deleteLoad(load: CargoLoad) {
    if (!window.confirm(`Excluir a carga ${shortLabel(load)}? Isso não dá para desfazer.`)) return;
    if (!navigator.onLine) { toast.error("Você está sem conexão."); return; }

    const key = ["cargo_loads", household];
    setBusy(true);
    setSelected(null);
    qc.setQueryData<CargoLoad[]>(key, (old) => (old ?? []).filter((l) => l.id !== load.id));
    try {
      // 1) histórico, 2) produtos, 3) a carga — nesta ordem, por causa das chaves estrangeiras
      const { error: hErr } = await supabase.from("cargo_history").delete().eq("load_id", load.id);
      if (hErr) throw hErr;

      const { error: pErr } = await supabase.from("cargo_products").delete().eq("load_id", load.id);
      if (pErr) throw pErr;

      const { data, error } = await supabase
        .from("cargo_loads")
        .delete()
        .eq("id", load.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("O banco não permitiu excluir. Confira as permissões do passo 1.");
      }

      toast.success("Carga excluída");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      await qc.invalidateQueries({ queryKey: key });
      setBusy(false);
    }
  }


  /** Finalizar: sai das pendências e fecha o card. */
  async function finishLoad(load: CargoLoad) {
    await saveStages(
      load,
      { ...billingCompletionPatch(), operational_status: "finished" },
      "Carga finalizada",
    );
    setSelected(null);
  }

  /** Corte: saldo físico sem saldo no sistema — aguardando liberação. */
  async function cutLoad(load: CargoLoad) {
    await saveStages(
      load,
      { billing_issue: "waiting_values", billing_status: "pending" },
      "Corte — aguardando liberação de saldo",
    );
  }

  async function invoiceLoad(load: CargoLoad) {
    await saveStages(load, billingCompletionPatch(), "Faturado");
  }

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${what} copiado`);
    } catch {
      toast.error("Não foi possível copiar");
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
    const out: Record<Bucket, CargoLoad[]> = { pending: [], invoiced: [], printed: [], cut: [], done: [] };
    for (const l of dayLoads) if (match(l)) out[bucketOf(l)].push(l);
    for (const k of Object.keys(out) as Bucket[]) out[k].sort(byDt);
    return out;
  }, [dayLoads, search]);

  const current = loads.find((l) => l.id === selected) ?? null;
  const visible = [
    ...groups.pending,
    ...groups.invoiced,
    ...groups.printed,
    ...groups.cut,
    ...(showDone ? groups.done : []),
  ];
  const openCount =
    groups.pending.length + groups.invoiced.length + groups.printed.length + groups.cut.length;

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

          {ORDER.map((key) => {
            if (key === "done" && !showDone) return null;
            const items = groups[key];
            if (!items.length) return null;
            return (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold text-muted-foreground">{BUCKETS[key].label}</h3>
                  <Pill tone={BUCKETS[key].tone as never}>{items.length}</Pill>
                </div>
                {items.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSelected(l.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-all ${cardClass(key)} ${
                      selected === l.id ? "ring-2 ring-primary" : "" }`}>
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{shortLabel(l)}</span>
                        <span className="block truncate text-[11px] opacity-70">
                          {l.destination_name ?? "sem destino"} · {loadPallets(l)} plt ·{" "}
                          {l.cargo_products.reduce((sum, p) => sum + Number(p.boxes), 0).toLocaleString("pt-BR")} cx
                        </span>
                      </span>
                      {key === "invoiced" && invoicedAt[l.id] && (<WaitBadge since={invoicedAt[l.id]} /> )}
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
            <div className={`space-y-3 rounded-2xl border p-3 ${cardClass(bucketOf(current))}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-base">{shortLabel(current)}</h3>
                  <p className="truncate text-xs opacity-70">
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
                  <Printer className="h-4 w-4" /> Impressa ag. CT-e
                </Button>
                <Button size="sm" variant="soft" disabled={busy} onClick={() => invoiceLoad(current)}>
                  <FileText className="h-4 w-4" /> Faturado
                </Button>
                <Button size="sm" variant="dangerGhost" disabled={busy} onClick={() => cutLoad(current)}>
                  <Scissors className="h-4 w-4" /> Corte
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => finishLoad(current)}>
                  <Check className="h-4 w-4" /> Finalizada
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => deleteLoad(current)}>
                  <Trash2 className="h-4 w-4" /> Excluir
                </Button>
              </div>

              {/* Produtos */}
              <div>
                <h4 className="text-[13px] font-semibold">Produtos</h4>
                <table className="mt-1 w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase opacity-70">
                      <th className="pb-1">Código</th>
                      <th className="pb-1">Descrição</th>
                      <th className="pb-1 text-right">Pallets</th>
                      <th className="pb-1 text-right text-[9px]">Caixas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.cargo_products.map((p) => (
                      <tr key={p.id} className="border-t border-foreground/10">
                        <td className="py-1 pr-2 opacity-70">{p.product_code}</td>
                        <td className="py-1 pr-2">{p.description}</td>
                        <td className="py-1 text-right font-semibold whitespace-nowrap">
                          {String(productPallets(p))}
                        </td>
                        <td className="py-1 text-right text-[11px] opacity-70 whitespace-nowrap">
                          {Number(p.boxes).toLocaleString("pt-BR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-[11px] opacity-70">
                  Total {loadPallets(current)} pallets ·{" "}
                  {current.cargo_products.reduce((sum, p) => sum + Number(p.boxes), 0).toLocaleString("pt-BR")} caixas
                </p>
              </div>

              {/* Placa copiável · DT · pallets · transportadora copiável */}
              <div className="grid grid-cols-4 gap-2 rounded-xl bg-background/50 p-2 text-[12px]">
                <button
                  className="text-left" disabled={busy}
                  title="Clique para copiar a placa"
                  onClick={() => void copy(plateLabel(current), "Placa")}
                >
                  <p className="text-[10px] uppercase opacity-70">Placa</p>
                  <p className="font-semibold underline decoration-dotted">{plateLabel(current)}</p>
                </button>
                  <button className="text-left" disabled={busy} title="Clique para copiar o DT" onClick={() => void copy((current.driver_dt ?? "").trim(), "DT")}>
                  <p className="text-[10px] uppercase opacity-70">DT</p>
                  <p className="font-semibold underline decoration-dotted">{current.driver_dt ?? "—"}</p>
                </button>

                <div>
                  <p className="text-[10px] uppercase opacity-70">Pallets</p>
                  <p className="font-semibold">{loadPallets(current)}</p>
                </div>
                <button
                  className="min-w-0 text-left" disabled={busy}
                  title="Clique para copiar a transportadora"
                  onClick={() => void copy((current.carrier ?? "").trim(), "Transportadora")}
                >
                  <p className="text-[10px] uppercase opacity-70">Transportadora</p>
                  <p className="truncate font-semibold underline decoration-dotted">{current.carrier ?? "—"}</p>
                </button>
              </div>

                            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                {cargoFields
                  .filter(([key]) => !["plate", "driver_dt", "carrier", "destination_name", "pallets"].includes(key))
                  .map(([key, label]) => (
                    <div key={key} className="flex gap-1">
                      <dt className="opacity-70">{label}:</dt>
                      <dd className="truncate">
                        {key === "scheduled_date"
                          ? dateLabel(String(current.scheduled_date ?? ""))
                          : String(current[key as keyof CargoLoad] ?? "—") || "—"}
                      </dd>
                    </div>
                  ))}
              </dl>

              <label className="flex items-center gap-2 text-[13px] font-semibold">
                <input
                  type="checkbox"
                  checked={!!current.departure_confirmed}
                  disabled={busy}
                  onChange={(e) =>
                    saveStages(
                      current,
                      { departure_confirmed: e.target.checked },
                      e.target.checked ? "Com saída" : "Sem saída",
                    )
                  }
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                Com saída
              </label>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => setVehicleOpen(true)}>
                  <ChevronDown className="h-4 w-4" /> Histórico da placa
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Histórico da placa */}
      <Modal
        open={vehicleOpen}
        onClose={() => setVehicleOpen(false)}
        title={current ? `Histórico · ${plateLabel(current)}` : "Histórico da placa"}
      >
        <VehicleHistory plate={(current?.plate ?? "")} loads={loads} />
      </Modal>

      {/* Dias com carga importada */}
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

/* ---------- Histórico da placa ---------- */

/* ---------- Histórico da placa ---------- */

function VehicleHistory({ plate, loads }: { plate: string; loads: CargoLoad[] }) {
  const key = plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  const list = useMemo(
    () =>
      loads
        .filter((l) => (l.plate ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() === key)
        .sort((a, b) => String(b.registered_at).localeCompare(String(a.registered_at))),
    [loads, key],
  );

  if (!key) return <EmptyState>Escolha uma carga para ver o histórico da placa.</EmptyState>;
  if (!list.length) return <EmptyState>Nenhuma carga registrada para essa placa.</EmptyState>;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {list.map((l) => (
          <article key={l.id} className={`rounded-xl border px-3 py-2 ${cardClass(bucketOf(l))}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-semibold">
                {l.destination_name ?? "sem destino"}
              </span>
              <span className="whitespace-nowrap text-[11px] opacity-70">
                {dateLabel(cargoDay(new Date(l.registered_at)))}
              </span>
            </div>
            <p className="truncate text-[11px] opacity-70">
              {l.cargo_products.map((p) => p.product_code).join(" · ")}
            </p>
          </article>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          const csv = cargoCsv(list, true);
          const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
          const a = document.createElement("a");
          a.href = url;
          a.download = `historico-${key}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        <Download className="h-4 w-4" /> Baixar CSV da placa
      </Button>
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
          <span className="text-[12px] text-muted-foreground">{items.length} carga(s)</span>
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
        <Button
          disabled={busy || (!ready.length && !review.length)}
          onClick={() => void onImport([...ready, ...review])}
        >
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
