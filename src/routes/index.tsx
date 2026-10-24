import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, HeartPulse, History, Home, Mic, Package, Settings, Shirt, Truck, UserPlus, Wallet } from "lucide-react";
import { AuthScreen } from "@/components/AuthScreen";
import { InventoryScreen } from "@/components/InventoryScreen";
import { FinanceScreen } from "@/components/FinanceScreen";
import { WardrobeScreen } from "@/components/WardrobeScreen";
import { HistoryScreen } from "@/components/HistoryScreen";
import { AdminScreen } from "@/components/AdminScreen";
import { AppointmentsScreen } from "@/components/AppointmentsScreen";
import { HouseholdModal } from "@/components/HouseholdModal";
import { AppointmentReminder } from "@/components/AppointmentReminder";
import { AssistantModal } from "@/components/AssistantModal";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { IsisScreen } from "@/components/IsisScreen";
import { CargoScreen } from "@/components/CargoScreen";
import { Button, Spinner } from "@/components/kit";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSync } from "@/lib/data";
import { sendDueAppointmentNotifications, sendDueCleaningNotifications } from "@/lib/notifications.functions";
import { useApplyTheme, useSettings } from "@/lib/settings";
import { isTabAllowed, usePermissions, usePermissionsRealtime } from "@/lib/permissions";
import { getSignedUrl } from "@/lib/storage";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { menuWeek?: string } => ({
    menuWeek: typeof search.menuWeek === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.menuWeek) && Number.isFinite(new Date(`${search.menuWeek}T12:00:00`).getTime()) ? search.menuWeek : undefined,
  }),
  head: () => ({
    meta: [
      { title: "LaediHome" },
      {
        name: "description",
        content:
          "Organize despensa, contas, cartões, dívidas e guarda-roupa em um só lugar, sincronizado em tempo real entre o casal.",
      },
      { property: "og:title", content: "LaediHome" },
      {
        property: "og:description",
        content:
          "Organize despensa, contas, cartões, dívidas e guarda-roupa em um só lugar, sincronizado em tempo real entre o casal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const TABS = [
  { key: "despensa", label: "Despensa", icon: Package },
  { key: "financas", label: "Finanças", icon: Wallet },
  { key: "armario", label: "Armário", icon: Shirt },
  { key: "compromissos", label: "Agenda", icon: CalendarClock },
  { key: "isis", label: "Isis", icon: HeartPulse },
  { key: "historico", label: "Histórico", icon: History },
  { key: "cargas", label: "Cargas", icon: Truck },
] as const;

type TabKey = (typeof TABS)[number]["key"] | "painel";

function Index() {
  const { session, profile, user, loading } = useAuth();
  const [tab, setTab] = useState<TabKey>("despensa");
  const [cargosVisited, setCargosVisited] = useState(false);
  const [houseOpen, setHouseOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const sendNotifications = useServerFn(sendDueAppointmentNotifications);
  const sendCleaningNotifications = useServerFn(sendDueCleaningNotifications);
  useRealtimeSync(!!session);
  const { data: settings } = useSettings(!!session);
  const [headerUrl, setHeaderUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getSignedUrl("product-images", settings?.header_image_url ?? null)
      .then((url) => { if (alive) setHeaderUrl(url); })
      .catch(() => { if (alive) setHeaderUrl(null); });
    return () => { alive = false; };
  }, [settings?.header_image_url]);

  useApplyTheme(settings?.theme);

  const { data: household } = useQuery({
    queryKey: ["household-owner", profile?.household_id],
    enabled: !!profile?.household_id,
    queryFn: async () => {
      const householdId = profile?.household_id;
      if (!householdId) return null;
      const { data } = await supabase
        .from("households")
        .select("id,owner_id")
        .eq("id", householdId)
        .maybeSingle();
      return data;
    },
  });
  const isOwner = !!user && !!household && household.owner_id === user.id;
  const { data: permissions } = usePermissions(user?.id);
  usePermissionsRealtime();
  useEffect(() => {
    if (!session) return;
    const check = () => {
      void sendNotifications().catch(() => undefined);
      void sendCleaningNotifications().catch(() => undefined);
    };
    check();
    const interval = window.setInterval(check, 60_000);
    return () => window.clearInterval(interval);
  }, [sendCleaningNotifications, sendNotifications, session]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-primary">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!session) return <AuthScreen />;

  const userName = profile?.name ?? "Alguém";
  const blocked = !isOwner && !isTabAllowed(permissions, tab) && tab !== "painel";

  return (
    <div className="min-h-dvh pb-24">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div
            className="relative flex h-36 items-end overflow-hidden rounded-2xl border border-border bg-primary"
            style={
              headerUrl
                ? {
                    backgroundImage: `url(${headerUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
          >
            {headerUrl && (
              <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-transparent" />
            )}

            <div className="relative z-10 flex w-full items-end justify-between gap-2 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                  <Home className="h-7 w-7 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-2xl font-bold leading-tight text-white">
                    {settings?.header_title ?? "LaediHome"}
                  </h1>
                  <p className="truncate text-xs text-white/85">Seja bem-vindo, {userName}</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {isOwner && (
                  <Button
                    onClick={() => setTab(tab === "painel" ? "despensa" : "painel")}
                    aria-label="Painel do administrador"
                    title="Painel do administrador"
                    size="icon"
                    variant={tab === "painel" ? "primary" : "soft"}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                )}
                <Button size="icon" variant="outline" onClick={() => setAssistantOpen(true)} aria-label="Abrir assistente" title="Assistente por voz">
                  <Mic className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" onClick={() => setHouseOpen(true)} aria-label="Convidar pessoa" title="Convidar pessoa">
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <ConnectionStatus />
      <AppointmentReminder />

      <main className={`mx-auto px-4 py-4 ${tab === "cargas" ? "max-w-4xl" : "max-w-2xl"}`}>
        {blocked ? (
          <div className="surface p-6 text-center">
            <p className="text-base font-semibold">Esta aba está bloqueada</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Peça a quem administra a casa para liberar o acesso.
            </p>
          </div>
        ) : (
          <>
            {tab === "despensa" && <InventoryScreen userName={userName} />}
            {tab === "financas" && <FinanceScreen userName={userName} />}
            {tab === "armario" && <WardrobeScreen userName={userName} />}
            {tab === "compromissos" && <AppointmentsScreen userName={userName} />}
            {tab === "isis" && <IsisScreen userName={userName} />}
            {tab === "historico" && <HistoryScreen />}
            {cargosVisited && <div hidden={tab !== "cargas"}><CargoScreen /></div>}
            {tab === "painel" && isOwner && <AdminScreen userName={userName} />}
          </>
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { if (key === "cargas") setCargosVisited(true); setTab(key); }}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-semibold transition-colors ${
                tab === key ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <HouseholdModal open={houseOpen} onClose={() => setHouseOpen(false)} />
      <AssistantModal open={assistantOpen} onClose={() => setAssistantOpen(false)} userName={userName} />
    </div>
  );
}
