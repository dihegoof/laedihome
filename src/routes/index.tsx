import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, History, Home, Mic, Package, Settings, Shirt, UserPlus, Wallet } from "lucide-react";
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
import { Button, Spinner } from "@/components/kit";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSync } from "@/lib/data";
import { sendDueAppointmentNotifications } from "@/lib/notifications.functions";
import { useApplyTheme, useSettings } from "@/lib/settings";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nossa Casa — despensa, finanças e guarda-roupa a dois" },
      {
        name: "description",
        content:
          "Organize despensa, contas, cartões, dívidas e guarda-roupa em um só lugar, sincronizado em tempo real entre o casal.",
      },
      { property: "og:title", content: "Nossa Casa — despensa, finanças e guarda-roupa a dois" },
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
  { key: "historico", label: "Histórico", icon: History },
] as const;

type TabKey = (typeof TABS)[number]["key"] | "painel";

function Index() {
  const { session, profile, user, loading } = useAuth();
  const [tab, setTab] = useState<TabKey>("despensa");
  const [houseOpen, setHouseOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const sendNotifications = useServerFn(sendDueAppointmentNotifications);
  useRealtimeSync(!!session);
  const { data: settings } = useSettings(!!session);
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

  useEffect(() => {
    if (!session) return;
    const check = () => void sendNotifications().catch(() => undefined);
    check();
    const interval = window.setInterval(check, 60_000);
    return () => window.clearInterval(interval);
  }, [sendNotifications, session]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-primary">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!session) return <AuthScreen />;

  const userName = profile?.name ?? "Alguém";

  return (
    <div className="min-h-dvh pb-24">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg leading-tight">Nossa Casa</h1>
              <p className="text-xs text-muted-foreground">Olá, {userName}</p>
            </div>
            {isOwner && (
              <Button
                onClick={() => setTab(tab === "painel" ? "despensa" : "painel")}
                aria-label="Painel do administrador"
                title="Painel do administrador"
                size="icon"
                variant={tab === "painel" ? "primary" : "soft"}
                className="ml-1"
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" onClick={() => setAssistantOpen(true)} aria-label="Abrir assistente" title="Assistente por voz">
              <Mic className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={() => setHouseOpen(true)} aria-label="Convidar pessoa" title="Convidar pessoa">
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <ConnectionStatus />
      <AppointmentReminder />

      <main className="mx-auto max-w-2xl px-4 py-4">
        {tab === "despensa" && <InventoryScreen userName={userName} />}
        {tab === "financas" && <FinanceScreen userName={userName} />}
        {tab === "armario" && <WardrobeScreen userName={userName} />}
        {tab === "compromissos" && <AppointmentsScreen userName={userName} />}
        {tab === "historico" && <HistoryScreen />}
        {tab === "painel" && isOwner && <AdminScreen userName={userName} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
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
