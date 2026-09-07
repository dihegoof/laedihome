import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  Card,
  Debt,
  Finance,
  HistoryEntry,
  Product,
  WardrobeItem,
  WardrobeLook,
  WardrobeOwner,
} from "@/lib/types";

const TABLES = [
  "products",
  "cards",
  "finances",
  "debts",
  "history",
  "wardrobe_items",
  "wardrobe_looks",
  "household_settings",
] as const;


export type SyncedTable = (typeof TABLES)[number];

export function useRealtimeSync(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase.channel("casa-sync");
    for (const table of TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        qc.invalidateQueries({ queryKey: [table] });
      });
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}

function useTable<T>(table: SyncedTable, order: { column: string; ascending: boolean }, enabled: boolean) {
  return useQuery({
    queryKey: [table],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .order(order.column, { ascending: order.ascending });
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

export const useProducts = (enabled = true) =>
  useTable<Product>("products", { column: "name", ascending: true }, enabled);
export const useCards = (enabled = true) =>
  useTable<Card>("cards", { column: "created_at", ascending: true }, enabled);
export const useFinances = (enabled = true) =>
  useTable<Finance>("finances", { column: "date", ascending: false }, enabled);
export const useDebts = (enabled = true) =>
  useTable<Debt>("debts", { column: "created_at", ascending: false }, enabled);
export const useHistory = (enabled = true) =>
  useTable<HistoryEntry>("history", { column: "created_at", ascending: false }, enabled);
export const useWardrobeItems = (enabled = true) =>
  useTable<WardrobeItem>("wardrobe_items", { column: "created_at", ascending: false }, enabled);
export const useWardrobeLooks = (enabled = true) =>
  useTable<WardrobeLook>("wardrobe_looks", { column: "created_at", ascending: false }, enabled);

export function useInvalidate() {
  const qc = useQueryClient();
  return (table: SyncedTable) => qc.invalidateQueries({ queryKey: [table] });
}

export async function logHistory(userName: string, action: string, target?: string | null) {
  await supabase.from("history").insert({ user_name: userName, action, target: target ?? null });
}
