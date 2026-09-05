import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  FileUp,
  HandCoins,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button, EmptyState, Field, Modal, Pill, Spinner } from "@/components/kit";
import { StoredImage } from "@/components/StoredImage";
import { logHistory, useCards, useDebts, useFinances, useInvalidate } from "@/lib/data";
import { type Card, type Debt, type Finance, type FinanceType } from "@/lib/types";
import { useFinanceCategories } from "@/lib/settings";
import { brl, parseCurrency } from "@/lib/format";
import { compressImage, uploadFile } from "@/lib/storage";

type Tab = "movimentos" | "cartoes" | "dividas";

export function FinanceScreen({ userName }: { userName: string }) {
  const [tab, setTab] = useState<Tab>("movimentos");
  const { data: finances = [] } = useFinances();
  const { data: cards = [] } = useCards();
  const { data: debts = [] } = useDebts();

  const totals = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7);
    const ofMonth = finances.filter((f) => (f.date ?? f.created_at).slice(0, 7) === month);
    const income = ofMonth.filter((f) => f.type === "income").reduce((s, f) => s + Number(f.value), 0);
    const expense = ofMonth
      .filter((f) => f.type !== "income")
      .reduce((s, f) => s + Number(f.value), 0);
    return { income, expense, balance: income - expense };
  }, [finances]);

  return (
    <div className="space-y-4">
      <div className="surface bg-[linear-gradient(140deg,var(--color-primary),color-mix(in_oklab,var(--color-primary)_70%,var(--color-accent)))] p-5 text-primary-foreground">
        <p className="text-xs font-semibold tracking-wide uppercase opacity-80">Saldo do mês</p>
        <p className="mt-1 text-3xl font-bold">{brl(totals.balance)}</p>
        <div className="mt-4 flex gap-5 text-sm">
          <span className="flex items-center gap-1.5">
            <ArrowUpRight className="h-4 w-4" /> {brl(totals.income)}
          </span>
          <span className="flex items-center gap-1.5">
            <ArrowDownRight className="h-4 w-4" /> {brl(totals.expense)}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        {(
          [
            ["movimentos", "Movimentos", Wallet],
            ["cartoes", "Cartões", CreditCard],
            ["dividas", "Dívidas", HandCoins],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              tab === key ? "bg-primary text-primary-foreground shadow-soft" : "bg-secondary text-secondary-foreground"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "movimentos" && <Movements finances={finances} cards={cards} userName={userName} />}
      {tab === "cartoes" && <Cards cards={cards} finances={finances} userName={userName} />}
      {tab === "dividas" && <Debts debts={debts} userName={userName} />}
    </div>
  );
}

function Movements({
  finances,
  cards,
  userName,
}: {
  finances: Finance[];
  cards: Card[];
  userName: string;
}) {
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"todos" | FinanceType>("todos");

  const list = finances.filter((f) => filter === "todos" || f.type === filter);

  async function remove(f: Finance) {
    if (!confirm(`Excluir "${f.description}"?`)) return;
    await supabase.from("finances").delete().eq("id", f.id);
    void invalidate("finances");
    void logHistory(userName, "excluiu lançamento", f.description);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["todos", "Todos"],
            ["income", "Entradas"],
            ["expense", "Saídas"],
            ["card", "Cartão"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              filter === key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {label}
          </button>
        ))}
        <Button size="sm" className="ml-auto" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Lançar
        </Button>
      </div>

      {!list.length && <EmptyState>Nenhum lançamento ainda.</EmptyState>}

      {list.map((f) => (
        <article key={f.id} className="surface flex items-center gap-3 p-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              f.type === "income" ? "bg-success/15 text-success" : "bg-destructive/12 text-destructive"
            }`}
          >
            {f.type === "income" ? (
              <ArrowUpRight className="h-5 w-5" />
            ) : f.type === "card" ? (
              <CreditCard className="h-5 w-5" />
            ) : (
              <ArrowDownRight className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{f.description}</p>
            <p className="text-xs text-muted-foreground">
              {(f.date ?? f.created_at).slice(0, 10).split("-").reverse().join("/")}
              {f.category ? ` · ${f.category}` : ""}
              {f.total_installments
                ? ` · ${f.current_installment ?? 1}/${f.total_installments}x`
                : ""}
              {f.card_id ? ` · ${cards.find((c) => c.id === f.card_id)?.name ?? "Cartão"}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p className={`font-bold ${f.type === "income" ? "text-success" : "text-destructive"}`}>
              {f.type === "income" ? "+" : "-"}
              {brl(Number(f.value))}
            </p>
            <button className="text-xs text-muted-foreground" onClick={() => void remove(f)}>
              excluir
            </button>
          </div>
        </article>
      ))}

      <FinanceModal open={open} onClose={() => setOpen(false)} cards={cards} userName={userName} />
    </div>
  );
}

function FinanceModal({
  open,
  onClose,
  cards,
  userName,
}: {
  open: boolean;
  onClose: () => void;
  cards: Card[];
  userName: string;
}) {
  const invalidate = useInvalidate();
  const [type, setType] = useState<FinanceType>("expense");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const categories = useFinanceCategories();
  const [category, setCategory] = useState<string>("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [cardId, setCardId] = useState<string>("");
  const [installments, setInstallments] = useState("1");
  const [busy, setBusy] = useState(false);

  async function save() {
    const total = parseCurrency(value);
    if (!description.trim()) return toast.error("Informe a descrição");
    if (total <= 0) return toast.error("Informe um valor válido");
    if (type === "card" && !cardId) return toast.error("Escolha o cartão");
    setBusy(true);

    const count = type === "card" ? Math.max(1, Number(installments) || 1) : 1;
    const perInstallment = Number((total / count).toFixed(2));
    const rows = Array.from({ length: count }, (_, i) => {
      const d = new Date(date);
      d.setMonth(d.getMonth() + i);
      return {
        description: count > 1 ? `${description.trim()} (${i + 1}/${count})` : description.trim(),
        value: count > 1 ? perInstallment : total,
        type,
        category: type === "income" ? category : category,
        date: d.toISOString().slice(0, 10),
        card_id: type === "card" ? cardId : null,
        total_value: count > 1 ? total : null,
        installment_value: count > 1 ? perInstallment : null,
        total_installments: count > 1 ? count : null,
        current_installment: count > 1 ? i + 1 : null,
      };
    });

    const { error } = await supabase.from("finances").insert(rows);
    setBusy(false);
    if (error) return toast.error(error.message);
    void invalidate("finances");
    void logHistory(userName, "lançou movimento", description.trim());
    toast.success("Lançamento salvo");
    setDescription("");
    setValue("");
    setInstallments("1");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo lançamento"
      footer={
        <Button className="flex-1" onClick={() => void save()} disabled={busy}>
          {busy ? <Spinner /> : "Salvar"}
        </Button>
      }
    >
      <div className="flex gap-2">
        {(
          [
            ["income", "Entrada"],
            ["expense", "Saída"],
            ["card", "Cartão"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setType(key)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold ${
              type === key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Field label="Descrição">
        <input className="field" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor total">
          <input
            className="field"
            inputMode="decimal"
            placeholder="R$ 0,00"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <Field label="Data">
          <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Categoria">
        <select
          className="field"
          value={category || categories[0] || ""}
          onChange={(e) => setCategory(e.target.value)}
        >

          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>

      {type === "card" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cartão">
            <select className="field" value={cardId} onChange={(e) => setCardId(e.target.value)}>
              <option value="">Selecione</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Parcelas">
            <input
              className="field"
              inputMode="numeric"
              value={installments}
              onChange={(e) => setInstallments(e.target.value)}
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}

function Cards({
  cards,
  finances,
  userName,
}: {
  cards: Card[];
  finances: Finance[];
  userName: string;
}) {
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const [closeDay, setCloseDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return toast.error("Informe o nome do cartão");
    setBusy(true);
    const { error } = await supabase.from("cards").insert({
      name: name.trim(),
      card_limit: parseCurrency(limit),
      close_day: Number(closeDay) || null,
      due_day: Number(dueDay) || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    void invalidate("cards");
    void logHistory(userName, "adicionou cartão", name.trim());
    setName("");
    setLimit("");
    setCloseDay("");
    setDueDay("");
    setOpen(false);
  }

  async function remove(card: Card) {
    if (!confirm(`Excluir cartão "${card.name}"?`)) return;
    await supabase.from("cards").delete().eq("id", card.id);
    void invalidate("cards");
  }

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Novo cartão
      </Button>

      {!cards.length && <EmptyState>Nenhum cartão cadastrado.</EmptyState>}

      {cards.map((c) => {
        const used = finances
          .filter((f) => f.card_id === c.id)
          .reduce((s, f) => s + Number(f.value), 0);
        const pct = c.card_limit > 0 ? Math.min(100, (used / Number(c.card_limit)) * 100) : 0;
        return (
          <article key={c.id} className="surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  Fecha dia {c.close_day ?? "-"} · vence dia {c.due_day ?? "-"}
                </p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => void remove(c)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full rounded-full ${pct > 85 ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {brl(used)} usado de {brl(Number(c.card_limit))} · disponível{" "}
              <strong className="text-foreground">{brl(Number(c.card_limit) - used)}</strong>
            </p>
          </article>
        );
      })}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo cartão"
        footer={
          <Button className="flex-1" onClick={() => void save()} disabled={busy}>
            {busy ? <Spinner /> : "Salvar"}
          </Button>
        }
      >
        <Field label="Nome">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Limite">
          <input
            className="field"
            inputMode="decimal"
            placeholder="R$ 0,00"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dia de fechamento">
            <input
              className="field"
              inputMode="numeric"
              value={closeDay}
              onChange={(e) => setCloseDay(e.target.value)}
            />
          </Field>
          <Field label="Dia de vencimento">
            <input
              className="field"
              inputMode="numeric"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function Debts({ debts, userName }: { debts: Debt[]; userName: string }) {
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    description: "",
    creditor: "",
    total_value: "",
    total_installments: "1",
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [payingDebt, setPayingDebt] = useState<Debt | null>(null);

  async function save() {
    if (!form.description.trim()) return toast.error("Informe a descrição");
    const total = parseCurrency(form.total_value);
    const count = Math.max(1, Number(form.total_installments) || 1);
    setBusy(true);
    const { error } = await supabase.from("debts").insert({
      description: form.description.trim(),
      creditor: form.creditor.trim() || null,
      total_value: total,
      total_installments: count,
      installment_value: Number((total / count).toFixed(2)),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    void invalidate("debts");
    void logHistory(userName, "cadastrou dívida", form.description.trim());
    setForm({ description: "", creditor: "", total_value: "", total_installments: "1" });
    setOpen(false);
  }

  async function payInstallment(debt: Debt, proofPath: string | null) {
    const next = Math.min(debt.total_installments, debt.paid_installments + 1);
    const history = [
      ...(debt.payment_history ?? []),
      { url: proofPath ?? "", installment: next, date: new Date().toISOString() },
    ];
    const { error } = await supabase
      .from("debts")
      .update({ paid_installments: next, payment_history: history })
      .eq("id", debt.id);
    if (error) return toast.error(error.message);
    void invalidate("debts");
    void logHistory(userName, `pagou parcela ${next}/${debt.total_installments}`, debt.description);
    toast.success("Parcela registrada!");
  }

  async function remove(debt: Debt) {
    if (!confirm(`Excluir dívida "${debt.description}"?`)) return;
    await supabase.from("debts").delete().eq("id", debt.id);
    void invalidate("debts");
  }

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Nova dívida
      </Button>

      {!debts.length && <EmptyState>Sem dívidas cadastradas 🎉</EmptyState>}

      {debts.map((d) => {
        const pct = (d.paid_installments / d.total_installments) * 100;
        const remaining = Number(d.total_value) - d.paid_installments * Number(d.installment_value);
        const done = d.paid_installments >= d.total_installments;
        return (
          <article key={d.id} className="surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{d.description}</p>
                <p className="text-xs text-muted-foreground">
                  {d.creditor ? `${d.creditor} · ` : ""}
                  {d.paid_installments}/{d.total_installments} parcelas de {brl(Number(d.installment_value))}
                </p>
              </div>
              {done ? <Pill tone="success">quitada</Pill> : <Pill tone="danger">{brl(remaining)}</Pill>}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="soft" disabled={done} onClick={() => void payInstallment(d, null)}>
                Pagar parcela
              </Button>
              <Button size="sm" variant="outline" disabled={done} onClick={() => { setPayingDebt(d); fileRef.current?.click(); }}>
                <FileUp className="h-4 w-4" /> Pagar com comprovante
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void remove(d)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            {!!d.payment_history?.length && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {d.payment_history
                  .filter((p) => p.url)
                  .map((p, i) => (
                    <StoredImage
                      key={i}
                      bucket="debt-proofs"
                      path={p.url}
                      alt={`Comprovante ${p.installment}`}
                      className="h-14 w-14 shrink-0 rounded-lg"
                    />
                  ))}
              </div>
            )}
          </article>
        );
      })}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file || !payingDebt) return;
          try {
            const blob = await compressImage(file, 1200);
            const path = await uploadFile("debt-proofs", blob);
            await payInstallment(payingDebt, path);
          } catch {
            toast.error("Falha ao enviar comprovante");
          } finally {
            setPayingDebt(null);
          }
        }}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nova dívida"
        footer={
          <Button className="flex-1" onClick={() => void save()} disabled={busy}>
            {busy ? <Spinner /> : "Salvar"}
          </Button>
        }
      >
        <Field label="Descrição">
          <input
            className="field"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <Field label="Credor">
          <input
            className="field"
            value={form.creditor}
            onChange={(e) => setForm({ ...form, creditor: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor total">
            <input
              className="field"
              inputMode="decimal"
              placeholder="R$ 0,00"
              value={form.total_value}
              onChange={(e) => setForm({ ...form, total_value: e.target.value })}
            />
          </Field>
          <Field label="Parcelas">
            <input
              className="field"
              inputMode="numeric"
              value={form.total_installments}
              onChange={(e) => setForm({ ...form, total_installments: e.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
