import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell, Calculator, CalendarRange, Check, Clock, Lock, Palette, Plus,
  Sparkles, Tag, Trash2, Wallet,
} from "lucide-react";
import { Button, EmptyState, Field, Spinner } from "@/components/kit";
import { logHistory, useMembers } from "@/lib/data";
import { TABS, isTabAllowed, usePermissions, useSavePermission } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import { compressImage, uploadFile } from "@/lib/storage";
import { Image as ImageIcon } from "lucide-react";
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
  const cleaningNotificationsEnabled = settings?.cleaning_notifications_enabled ?? DEFAULT_SETTINGS.cleaning_notifications_enabled;
  const cleaningReminderMinutes = settings?.cleaning_reminder_minutes ?? DEFAULT_SETTINGS.cleaning_reminder_minutes;
  const cleaningReminderHour = settings?.cleaning_reminder_hour ?? DEFAULT_SETTINGS.cleaning_reminder_hour;
  const insulinRatio = settings?.insulin_carb_ratio ?? DEFAULT_SETTINGS.insulin_carb_ratio;
  const targetGlucose = settings?.target_glucose ?? DEFAULT_SETTINGS.target_glucose;
  const correctionFactor = settings?.correction_factor ?? DEFAULT_SETTINGS.correction_factor;
  const doseIncrement = settings?.dose_increment ?? DEFAULT_SETTINGS.dose_increment;
  const { data: members = [] } = useMembers();
  const { data: household } = useQuery({
    queryKey: ["household-owner"],
    queryFn: async () => {
      const { data } = await supabase.from("households").select("id,owner_id").limit(1).maybeSingle();
      return data;
    },
  });
  const [selected, setSelected] = useState<string | null>(null);
  const { data: permissions } = usePermissions(selected);
  const savePermission = useSavePermission();


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

  const memberList = members.filter((m) => m.id !== household?.owner_id);
  const activeMember = selected ?? memberList[0]?.id ?? null;
  
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

      <section className="surface p-4">
        <header className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-base">Avisos de lavagem</h3>
        </header>
        <Button
          variant={cleaningNotificationsEnabled ? "primary" : "outline"}
          size="sm"
          disabled={busy}
          onClick={() => void apply(
            { cleaning_notifications_enabled: !cleaningNotificationsEnabled },
            cleaningNotificationsEnabled ? "desativou os avisos de lavagem" : "ativou os avisos de lavagem",
          )}
        >
          <Bell className="h-4 w-4" /> {cleaningNotificationsEnabled ? "Avisos ativados" : "Avisos desativados"}
        </Button>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Antecedência">
            <select
              className="field"
              value={cleaningReminderMinutes}
              disabled={busy || !cleaningNotificationsEnabled}
              onChange={(event) => void apply({ cleaning_reminder_minutes: Number(event.target.value) }, "mudou a antecedência dos avisos de lavagem")}
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
                value={cleaningReminderHour}
                disabled={busy || !cleaningNotificationsEnabled}
                onChange={(event) => void apply({ cleaning_reminder_hour: Number(event.target.value) }, "mudou o horário dos avisos de lavagem")}
              >
                {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
              </select>
            </div>
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">O aviso é enviado aos aparelhos ativados das pessoas da casa.</p>
      </section>

      <section className="surface p-4">
        <header className="mb-3 flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" />
          <h3 className="text-base">Abas liberadas</h3>
        </header>

        {memberList.length === 0 && (
          <p className="text-sm text-muted-foreground">Ninguém além de você na casa ainda.</p>
        )}

        {memberList.length > 1 && (
          <Field label="Membro">
            <select
              className="field"
              value={activeMember ?? ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              {memberList.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </Field>
        )}

        {activeMember && (
          <div className="mt-3 space-y-2">
            {TABS.map((t) => {
              const allowed = isTabAllowed(permissions, t.key);
              return (
                <label key={t.key} className="flex items-center justify-between gap-2 text-sm">
                  <span>{t.label}</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-primary"
                    checked={allowed}
                    disabled={busy}
                    onChange={(e) => {
                      setBusy(true);
                      void savePermission(activeMember, t.key, e.target.checked)
                        .then(() => {
                          void logHistory(userName, `${e.target.checked ? "liberou" : "bloqueou"} a aba ${t.label}`);
                          toast.success("Permissão atualizada");
                        })
                        .catch((err: unknown) =>
                          toast.error(err instanceof Error ? err.message : "Não consegui salvar"),
                        )
                        .finally(() => setBusy(false));
                    }}
                  />
                </label>
              );
            })}
            <p className="pt-1 text-xs text-muted-foreground">
              Desmarcado deixa a aba bloqueada para essa pessoa. O dono da casa sempre tem acesso a tudo.
            </p>
          </div>
        )}
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

      <section className="surface p-4">
        <header className="mb-3 flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          <h3 className="text-base">Cabeçalho do app</h3>
        </header>

        <div
          className="relative mb-3 flex h-28 items-end overflow-hidden rounded-xl border border-border bg-secondary"
          style={
            settings?.header_image_url
              ? {
                  backgroundImage: `url(${settings.header_image_url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          <div className="w-full bg-gradient-to-t from-black/70 to-transparent p-3">
            <p className="text-lg font-bold text-white">
              {settings?.header_title ?? "LaediHome"}
            </p>
            <p className="text-xs text-white/80">Seja bem-vindo, {userName}</p>
          </div>
        </div>

        <Field label="Título">
          <input
            className="field"
            value={settings?.header_title ?? "LaediHome"}
            disabled={busy}
            onChange={(event) => void apply({ header_title: event.target.value }, "mudou o título do cabeçalho")}
          />
        </Field>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm font-semibold text-primary">
          <ImageIcon className="h-4 w-4" />
          {busy ? "Enviando..." : "Trocar imagem"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setBusy(true);
              try {
                const path = await uploadFile(
                  "product-images",
                  await compressImage(file, 1600, 0.85),
                  "jpg",
                );
                await apply({ header_image_url: path }, "mudou a imagem do cabeçalho");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Não consegui enviar a imagem");
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Utilizar uma foto de tamanho padrão!
        </p>
      </section>
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
