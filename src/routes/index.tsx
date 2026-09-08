import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, History, Home, Package, Shield, Shirt, Wallet } from "lucide-react";
import { AuthScreen } from "@/components/AuthScreen";
import { InventoryScreen } from "@/components/InventoryScreen";
import { FinanceScreen } from "@/components/FinanceScreen";
import { WardrobeScreen } from "@/components/WardrobeScreen";
import { HistoryScreen } from "@/components/HistoryScreen";
import { AdminScreen } from "@/components/AdminScreen";
import { AppointmentsScreen } from "@/components/AppointmentsScreen";
import { HouseholdModal } from "@/components/HouseholdModal";
import { Spinner } from "@/components/kit";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSync } from "@/lib/data";
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
  useRealtimeSync(!!session);
  const { data: settings } = useSettings(!!session);
  useApplyTheme(settings?.theme);

  const { data: household } = useQuery({
    queryKey: ["household-owner", profile?.household_id],
    enabled: !!profile?.household_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("households")
        .select("id,owner_id")
        .eq("id", profile!.household_id!)
        .maybeSingle();
      return data;
    },
  });
  const isOwner = !!user && !!household && household.owner_id === user.id;

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
              <button
                onClick={() => setTab(tab === "painel" ? "despensa" : "painel")}
                aria-label="Painel do administrador"
                className={`ml-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide transition-colors ${
                  tab === "painel"
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary-soft text-primary hover:brightness-95"
                }`}
              >
                <Shield className="h-3.5 w-3.5" /> ADM
              </button>
            )}
          </div>
          <button
            onClick={() => setHouseOpen(true)}
            className="rounded-xl bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground"
          >
            Convidar / Conta
          </button>
        </div>
      </header>

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
    </div>
  );
}
