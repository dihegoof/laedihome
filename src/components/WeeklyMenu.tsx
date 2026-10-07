import { Suspense, useState } from "react";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, CookingPot, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button, EmptyState, Field, Modal, Pill, Spinner } from "@/components/kit";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Product } from "@/lib/types";
import { qty } from "@/lib/format";
import { addDays, compatibleUnits, localDate, MEAL_TYPES, prioritizeDays, prioritizeMeals, stockAmount, weekStart, type MenuPlan } from "@/lib/weekly-menu";

const routeApi = getRouteApi("/");
type IngredientDraft = { product_id: string; quantity: string; unit: string };
type Draft = { id?: string; title: string; date: string; time: string; type: string; notes: string; ingredients: IngredientDraft[] };
function newDraft(date: string): Draft {
  return { title: "", date, time: "12:00", type: "lunch", notes: "", ingredients: [] };
}
function dateLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
}

export function WeeklyMenu({ onBack, products }: { onBack: () => void; products: Product[] }) {
  return <Suspense fallback={<EmptyState><Spinner /> Carregando cardápio...</EmptyState>}>
    <MenuContent onBack={onBack} products={products} />
  </Suspense>;
}

function MenuContent({ onBack, products }: { onBack: () => void; products: Product[] }) {
  const { profile } = useAuth();
  const { menuWeek } = routeApi.useSearch();
  const navigate = useNavigate({ from: "/" });
  const qc = useQueryClient();
  const now = new Date();
  const today = localDate(now);
  const start = weekStart(menuWeek ?? today);
  const end = addDays(start, 6);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmation, setConfirmation] = useState<{ plan: MenuPlan; prepared: boolean } | null>(null);
  const [deletion, setDeletion] = useState<MenuPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: plans } = useSuspenseQuery({
    queryKey: ["menu_plans", profile?.household_id, start],
    queryFn: async () => {
      const { data, error } = await supabase.from("menu_plans").select("*,menu_ingredients(*)")
        .gte("meal_date", start).lte("meal_date", end).order("meal_date").order("meal_time");
      if (error) throw error;
      return (data ?? []) as MenuPlan[];
    },
  });
  async function refresh() {
    await Promise.all(["menu_plans", "menu_ingredients", "products", "history"].map((table) => qc.invalidateQueries({ queryKey: [table] })));
  }
  async function mutate(action: () => Promise<void>, message: string) {
    if (!navigator.onLine) return toast.error("Conecte à internet para atualizar o cardápio");
    setBusy(true);
    try { await action(); await refresh(); toast.success(message); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não consegui atualizar o cardápio"); }
    finally { setBusy(false); }
  }
  function edit(plan: MenuPlan) {
    setDraft({ id: plan.id, title: plan.title, date: plan.meal_date, time: plan.meal_time.slice(0, 5), type: plan.meal_type, notes: plan.notes ?? "", ingredients: plan.menu_ingredients.map((i) => ({ product_id: i.product_id ?? "", quantity: String(i.quantity), unit: i.unit })) });
  }
  const days = prioritizeDays(Array.from({ length: 7 }, (_, i) => addDays(start, i)), today);
  const nearest = prioritizeMeals(plans.filter((p) => p.meal_date === today && p.status === "pending" && p.meal_time.slice(0, 5) >= `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`), now)[0]?.id;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><Button size="icon" variant="outline" onClick={onBack} aria-label="Voltar à Despensa" title="Voltar à Despensa"><ArrowLeft className="h-4 w-4" /></Button><h2 className="text-xl">Cardápio semanal</h2></div>
      <Button size="sm" onClick={() => setDraft(newDraft(today >= start && today <= end ? today : start))}><Plus className="h-4 w-4" /> Nova refeição</Button>
    </div>
    <div className="flex items-center justify-between gap-2">
      <Button size="icon" variant="outline" aria-label="Semana anterior" title="Semana anterior" onClick={() => void navigate({ search: (prev) => ({ ...prev, menuWeek: addDays(start, -7) }) })}><ChevronLeft className="h-4 w-4" /></Button>
      <div className="text-center"><p className="text-sm font-semibold">{new Date(`${start}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} — {new Date(`${end}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}</p><Button size="sm" variant="ghost" onClick={() => void navigate({ search: (prev) => ({ ...prev, menuWeek: undefined }) })}>Hoje</Button></div>
      <Button size="icon" variant="outline" aria-label="Próxima semana" title="Próxima semana" onClick={() => void navigate({ search: (prev) => ({ ...prev, menuWeek: addDays(start, 7) }) })}><ChevronRight className="h-4 w-4" /></Button>
    </div>
    {days.map((day) => {
      const meals = prioritizeMeals(plans.filter((p) => p.meal_date === day), now);
      return <section key={day} className="space-y-2">
        <div className="flex items-center justify-between gap-2"><h3 className={day === today ? "text-lg text-primary" : "text-sm text-muted-foreground"}>{day === today ? "Hoje · " : ""}{dateLabel(day)}</h3><Button variant="ghost" size="icon" aria-label={`Adicionar refeição em ${dateLabel(day)}`} title="Adicionar refeição" onClick={() => setDraft(newDraft(day))}><Plus className="h-4 w-4" /></Button></div>
        {!meals.length && <p className="px-1 pb-2 text-xs text-muted-foreground">Nenhuma refeição planejada.</p>}
        {meals.map((plan) => <article key={plan.id} className={`surface space-y-3 p-3 ${plan.id === nearest ? "border-primary" : ""}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-primary">{plan.meal_time.slice(0, 5)}</span><span className="text-xs text-muted-foreground">{MEAL_TYPES.find((m) => m.value === plan.meal_type)?.label}</span>{plan.id === nearest && <Pill tone="primary">Próxima refeição</Pill>}</div><h4 className={`mt-1 break-words font-semibold ${day === today ? "text-lg" : "text-base"}`}>{plan.title}</h4></div>
            <Pill tone={plan.status === "prepared" ? "success" : "muted"}>{plan.status === "prepared" ? "Feita" : plan.status === "skipped" ? "Não feita" : "Pendente"}</Pill>
          </div>
          <ul className="space-y-1 text-sm">{plan.menu_ingredients.map((i) => <li key={i.id} className="flex justify-between gap-3"><span className="min-w-0 break-words text-muted-foreground">{i.product_name}</span><span className="shrink-0 font-medium">{qty(Number(i.quantity))} {i.unit}</span></li>)}</ul>
          {plan.notes && <p className="break-words text-xs text-muted-foreground">{plan.notes}</p>}
          <p className="text-xs text-muted-foreground">Por {plan.created_by_name}{plan.confirmed_by_name ? ` · ${plan.status === "prepared" ? "Preparada" : "Confirmada"} por ${plan.confirmed_by_name}` : ""}</p>
          {plan.status === "pending" && <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => setConfirmation({ plan, prepared: true })}><Check className="h-4 w-4" /> Foi feita</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmation({ plan, prepared: false })}><X className="h-4 w-4" /> Não foi feita</Button>
            <div className="ml-auto flex gap-1"><Button size="icon" variant="ghost" aria-label={`Editar ${plan.title}`} title="Editar refeição" disabled={busy} onClick={() => edit(plan)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Excluir ${plan.title}`} title="Excluir refeição" disabled={busy} onClick={() => setDeletion(plan)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
          </div>}
        </article>)}
      </section>;
    })}
    {draft && <MealEditor draft={draft} products={products} busy={busy} onChange={setDraft} onClose={() => { if (!busy) setDraft(null); }} onSave={() => void mutate(async () => {
      // Generated RPC types omit nullable arguments; SQL requires null for a new plan.
      const args = { _id: draft.id ?? null, _title: draft.title.trim(), _date: draft.date, _time: draft.time, _type: draft.type, _notes: draft.notes.trim(), _ingredients: draft.ingredients.map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity.replace(",", ".")), unit: i.unit })) };
      const { error } = await supabase.rpc("save_menu_plan", args as unknown as Database["public"]["Functions"]["save_menu_plan"]["Args"]);
      if (error) throw new Error(error.message);
      setDraft(null);
    }, "Refeição salva")} />}
    <Modal open={!!confirmation} onClose={() => { if (!busy) setConfirmation(null); }} title={confirmation?.prepared ? "Confirmar preparo" : "Refeição não feita"} footer={<><Button disabled={busy} onClick={() => void mutate(async () => {
      if (!confirmation) return;
      const { error } = await supabase.rpc("confirm_menu_plan", { _id: confirmation.plan.id, _prepared: confirmation.prepared });
      if (error) throw new Error(error.message);
      setConfirmation(null);
    }, confirmation?.prepared ? "Preparo confirmado e despensa atualizada" : "Refeição marcada como não feita")}>{busy ? <Spinner /> : <Check className="h-4 w-4" />} Confirmar</Button><Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>Cancelar</Button></>}>
      <p className="text-sm">{confirmation?.plan.title}</p>
      <p className="text-sm text-muted-foreground">{confirmation?.prepared ? "Os ingredientes abaixo serão descontados da Despensa." : "Nenhum ingrediente será descontado da Despensa."}</p>
      {confirmation?.prepared && <ul className="space-y-1 text-sm">{confirmation.plan.menu_ingredients.map((i) => <li key={i.id}>{i.product_name} · {qty(Number(i.quantity))} {i.unit}</li>)}</ul>}
    </Modal>
    <Modal open={!!deletion} onClose={() => { if (!busy) setDeletion(null); }} title="Excluir refeição" footer={<><Button variant="danger" disabled={busy} onClick={() => void mutate(async () => { if (!deletion) return; const { error } = await supabase.rpc("delete_menu_plan", { _id: deletion.id }); if (error) throw new Error(error.message); setDeletion(null); }, "Refeição excluída")}>{busy ? <Spinner /> : <Trash2 className="h-4 w-4" />} Excluir</Button><Button variant="outline" disabled={busy} onClick={() => setDeletion(null)}>Cancelar</Button></>}><p className="text-sm">Excluir “{deletion?.title}” do cardápio?</p></Modal>
  </div>;
}

function MealEditor({ draft, products, busy, onChange, onClose, onSave }: { draft: Draft; products: Product[]; busy: boolean; onChange: (draft: Draft) => void; onClose: () => void; onSave: () => void }) {
  const [search, setSearch] = useState("");
  const available = products.filter((p) => Number(p.quantity) > 0 && p.name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")) && !draft.ingredients.some((i) => i.product_id === p.id));
  const invalid = draft.ingredients.some((i) => {
    const p = products.find((p) => p.id === i.product_id);
    const amount = Number(i.quantity.replace(",", "."));
    const converted = stockAmount(amount, i.unit, p?.stock_unit ?? "un");
    return !p || !/^\d+(?:[.,]\d{1,3})?$/.test(i.quantity) || !Number.isFinite(converted) || converted > Number(p.quantity) || amount > 100000000;
  });
  function changeIngredient(index: number, patch: Partial<IngredientDraft>) { onChange({ ...draft, ingredients: draft.ingredients.map((i, n) => n === index ? { ...i, ...patch } : i) }); }
  return <Modal open onClose={onClose} title={draft.id ? "Editar refeição" : "Nova refeição"} footer={<><Button className="flex-1" disabled={busy || !draft.title.trim() || !draft.date || !draft.time || !draft.ingredients.length || invalid} onClick={onSave}>{busy ? <Spinner /> : <CookingPot className="h-4 w-4" />} Salvar</Button><Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button></>}>
    <Field label="Nome da refeição"><input className="field" value={draft.title} maxLength={120} disabled={busy} placeholder="Ex.: Arroz, feijão e frango" onChange={(e) => onChange({ ...draft, title: e.target.value })} /></Field>
    <div className="grid grid-cols-2 gap-3"><Field label="Dia"><input type="date" className="field min-w-0" value={draft.date} disabled={busy} onChange={(e) => onChange({ ...draft, date: e.target.value })} /></Field><Field label="Horário"><input type="time" className="field min-w-0" value={draft.time} disabled={busy} onChange={(e) => onChange({ ...draft, time: e.target.value })} /></Field></div>
    <Field label="Refeição"><select className="field" disabled={busy} value={draft.type} onChange={(e) => { const type = MEAL_TYPES.find((m) => m.value === e.target.value); if (type) onChange({ ...draft, type: type.value, time: type.time }); }}>{MEAL_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
    <div className="space-y-3"><h3 className="text-sm">Ingredientes</h3>
      {draft.ingredients.map((i, index) => {
        const p = products.find((p) => p.id === i.product_id);
        const amount = stockAmount(Number(i.quantity.replace(",", ".")), i.unit, p?.stock_unit ?? "un");
        const units = p ? compatibleUnits(p.stock_unit) : [i.unit];
        return <div key={`${i.product_id}-${index}`} className="space-y-1 border-b border-border pb-3">
          <div className="flex items-center justify-between gap-2"><p className="min-w-0 break-words text-sm font-semibold">{p?.name ?? "Ingrediente excluído"}</p><Button size="icon" variant="ghost" aria-label={`Remover ${p?.name ?? "ingrediente"}`} title="Remover ingrediente" disabled={busy} onClick={() => onChange({ ...draft, ingredients: draft.ingredients.filter((_, n) => n !== index) })}><X className="h-4 w-4" /></Button></div>
          <div className="grid grid-cols-2 gap-2"><Field label="Quantidade"><input className="field" inputMode="decimal" disabled={busy} value={i.quantity} onChange={(e) => changeIngredient(index, { quantity: e.target.value })} /></Field><Field label="Medida"><select className="field" disabled={busy} value={i.unit} onChange={(e) => changeIngredient(index, { unit: e.target.value })}>{!units.includes(i.unit) && <option value={i.unit}>{i.unit} (medida anterior)</option>}{units.map((u) => <option key={u} value={u}>{u}</option>)}</select></Field></div>
          <p className={`text-xs ${!p || !Number.isFinite(amount) || amount > Number(p.quantity) ? "text-destructive" : "text-muted-foreground"}`}>{p ? `Disponível: ${qty(Number(p.quantity))} ${p.stock_unit ?? "un"}${Number.isFinite(amount) && amount > Number(p.quantity) ? " · Estoque insuficiente" : !Number.isFinite(amount) ? " · Confira a quantidade e medida" : ""}` : "Remova este ingrediente e selecione outro da Despensa."}</p>
        </div>;
      })}
      <Field label="Adicionar da Despensa"><input className="field" placeholder="Buscar ingrediente..." value={search} onChange={(e) => setSearch(e.target.value)} disabled={busy} /></Field>
      <div className="max-h-40 space-y-1 overflow-y-auto">{available.map((p) => <Button key={p.id} variant="ghost" className="h-auto w-full justify-between py-2 text-left whitespace-normal" disabled={busy || draft.ingredients.length >= 100} onClick={() => { onChange({ ...draft, ingredients: [...draft.ingredients, { product_id: p.id, quantity: "", unit: p.stock_unit ?? "un" }] }); setSearch(""); }}><span className="min-w-0 break-words">{p.name}<span className="block text-xs font-normal text-muted-foreground">{qty(Number(p.quantity))} {p.stock_unit ?? "un"}</span></span><Plus className="h-4 w-4 shrink-0" /></Button>)}{!available.length && <p className="py-2 text-xs text-muted-foreground">Nenhum ingrediente disponível.</p>}</div>
    </div>
    <Field label="Observação"><textarea className="field min-h-16" disabled={busy} maxLength={2000} value={draft.notes} onChange={(e) => onChange({ ...draft, notes: e.target.value })} /></Field>
  </Modal>;
}