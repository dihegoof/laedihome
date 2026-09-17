import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, Calculator, CalendarRange, Check, Clock, Palette, Plus, Tag, Trash2, Wallet } from "lucide-react";
import { Button, EmptyState, Field, Spinner } from "@/components/kit";
import { logHistory } from "@/lib/data";
import {
  DEFAULT_SETTINGS,
  THEMES,
  useSaveSettings,
  useSettings,
} from "@/lib/settings";

export function AdminScreen({ userName }: { userName: string }) {
  const { data: settings, isLoading } = useSettings();
  const save = useSaveSettings();
  const [busy, setBusy] = useState(false);

  const theme = settings?.theme ?? DEFAULT_SETTINGS.theme;
  const products = settings?.product_categories ?? DEFAULT_SETTINGS.product_categories;
  const finances = settings?.finance_categories ?? DEFAULT_SETTINGS.finance_categories;
  const resetDay = settings?.finance_reset_day ?? DEFAULT_SETTINGS.finance_reset_day;
  const notificationsEnabled = settings?.notifications_enabled ?? DEFAULT_SETTINGS.notifications_enabled;
  const reminderMinutes = settings?.reminder_minutes ?? DEFAULT_SETTINGS.reminder_minutes;
  const reminderHour = settings?.reminder_hour ?? DEFAULT_SETTINGS.reminder_hour;
  const insulinRatio = settings?.insulin_carb_ratio ?? DEFAULT_SETTINGS.insulin_carb_ratio;
  const targetGlucose = settings?.target_glucose ?? DEFAULT_SETTINGS.target_glucose;
  const correctionFactor = settings?.correction_factor ?? DEFAULT_SETTINGS.correction_factor;
  const doseIncrement = settings?.dose_increment ?? DEFAULT_SETTINGS.dose_increment;

  async function apply(patch: Parameters<typeof save>[0], log: string) {
    setBusy(true);
    try {
      await save(patch, settings?.household_id ?? null);
      void logHistory(userName, log);
      toast.success("Painel atualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <EmptyState>Carregando painel...</EmptyState>;

  return (
    <div className="space-y-4">
      <section className="surface p-4">
        <header className="mb-3 flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          <h3 className="text-base">Parâmetros da Isis</h3>
        </header>
        <div className="grid grid-cols-2 gap-3">
          <SettingNumber label="Relação (g/U)" value={insulinRatio} disabled={busy} min={0.001} onSave={(value) => apply({ insulin_carb_ratio: value }, "alterou a relação insulina/carboidrato")} />
          <SettingNumber label="Glicemia alvo" value={targetGlucose} disabled={busy} min={0} onSave={(value) => apply({ target_glucose: value }, "alterou a glicemia alvo")} />
          <SettingNumber label="Fator (mg/dL/U)" value={correctionFactor} disabled={busy} min={0.001} onSave={(value) => apply({ correction_factor: value }, "alterou o fator de correção")} />
          <Field label="Incremento de dose">
            <select className="field" value={doseIncrement} disabled={busy} onChange={(event) => void apply({ dose_increment: Number(event.target.value) }, "alterou o incremento de dose")}>
              <option value={0.25}>0,25 U</option><option value={0.5}>0,5 U</option><option value={1}>1 U</option>
            </select>
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Use somente os parâmetros informados pela equipe de saúde. A configuração vale para toda a casa.</p>
      </section>

      <section className="surface p-4">
        <header className="mb-3 flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <h3 className="text-base">Cores do aplicativo</h3>
          {busy && <Spinner className="ml-auto" />}
        </header>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {THEMES.map((t) => (
            <button
              key={t.key}
              onClick={() => void apply({ theme: t.key }, `mudou as cores para ${t.label}`)}
              className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-colors ${
                theme === t.key ? "border-primary bg-primary-soft" : "border-border bg-card"
              }`}
            >
              <span className="flex shrink-0 gap-1">
                {t.swatch.map((c) => (
                  <span
                    key={c}
                    className="h-5 w-5 rounded-full border border-border"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.label}</span>
              {theme === t.key && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          A cor escolhida vale para todos que usam a casa.
        </p>
      </section>

      <section className="surface p-4">
        <header className="mb-3 flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" />
          <h3 className="text-base">Ciclo das finanças</h3>
        </header>
        <Field label="Dia em que o novo ciclo começa">
          <input
            className="field max-w-32"
            type="number"
            min={1}
            max={31}
            value={resetDay}
            disabled={busy}
            onChange={(event) => {
              const value = Math.min(31, Math.max(1, Number(event.target.value) || 1));
              void apply({ finance_reset_day: value }, `mudou o início do ciclo financeiro para o dia ${value}`);
            }}
          />
        </Field>
        <p className="mt-2 text-xs text-muted-foreground">Em meses mais curtos, o ciclo começa no último dia disponível.</p>
      </section>

      <section className="surface p-4">
        <header className="mb-3 flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <h3 className="text-base">Avisos de compromissos</h3>
        </header>
        <Button
          variant={notificationsEnabled ? "primary" : "outline"}
          size="sm"
          disabled={busy}
          onClick={() => void apply({ notifications_enabled: !notificationsEnabled }, notificationsEnabled ? "desativou os avisos" : "ativou os avisos")}
        >
          <Bell className="h-4 w-4" /> {notificationsEnabled ? "Avisos ativados" : "Avisos desativados"}
        </Button>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Antecedência">
            <select
              className="field"
              value={reminderMinutes}
              disabled={busy || !notificationsEnabled}
              onChange={(event) => void apply({ reminder_minutes: Number(event.target.value) }, "mudou a antecedência dos avisos")}
            >
              <option value={0}>No mesmo dia</option>
              <option value={1440}>1 dia antes</option>
              <option value={2880}>2 dias antes</option>
              <option value={10080}>7 dias antes</option>
            </select>
          </Field>
          <Field label="Horário">
            <div className="relative">
              <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                className="field pl-9"
                value={reminderHour}
                disabled={busy || !notificationsEnabled}
                onChange={(event) => void apply({ reminder_hour: Number(event.target.value) }, "mudou o horário dos avisos")}
              >
                {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
              </select>
            </div>
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Cada pessoa ativa a permissão no próprio aparelho pelo botão do microfone.</p>
      </section>

      <CategoryEditor
        icon={<Tag className="h-4 w-4 text-primary" />}
        title="Categorias da despensa"
        items={products}
        disabled={busy}
        onChange={(next) => void apply({ product_categories: next }, "editou as categorias da despensa")}
      />

      <CategoryEditor
        icon={<Wallet className="h-4 w-4 text-primary" />}
        title="Categorias das finanças"
        items={finances}
        disabled={busy}
        onChange={(next) => void apply({ finance_categories: next }, "editou as categorias das finanças")}
      />
    </div>
  );
}

function SettingNumber({ label, value, disabled, min, onSave }: { label: string; value: number; disabled: boolean; min: number; onSave: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <Field label={label}><input className="field" inputMode="decimal" value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} onBlur={() => { const next = Number(draft.replace(",", ".")); if (Number.isFinite(next) && next >= min && next !== value) onSave(next); else setDraft(String(value)); }} /></Field>;
}

function CategoryEditor({
  icon,
  title,
  items,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  const [value, setValue] = useState("");
  const [list, setList] = useState(items);

  useEffect(() => setList(items), [items]);

  function add() {
    const name = value.trim();
    if (!name) return;
    if (list.some((c) => c.toLowerCase() === name.toLowerCase())) {
      toast.info("Essa categoria já existe");
      return;
    }
    const next = [...list, name];
    setList(next);
    setValue("");
    onChange(next);
  }

  function remove(name: string) {
    if (list.length <= 1) {
      toast.info("Deixe pelo menos uma categoria");
      return;
    }
    const next = list.filter((c) => c !== name);
    setList(next);
    onChange(next);
  }

  return (
    <section className="surface p-4">
      <header className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-base">{title}</h3>
      </header>
      <div className="flex flex-wrap gap-2">
        {list.map((c) => (
          <span
            key={c}
            className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground"
          >
            {c}
            <button
              aria-label={`Remover ${c}`}
              onClick={() => remove(c)}
              disabled={disabled}
              className="text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className="field"
          placeholder="Nova categoria"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button onClick={add} disabled={disabled}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </section>
  );
}
