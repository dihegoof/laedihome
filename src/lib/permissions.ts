import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** As abas do app, na mesma ordem do menu. */
export const TABS = [
  { key: "despensa", label: "Despensa" },
  { key: "financas", label: "Finanças" },
  { key: "armario", label: "Armário" },
  { key: "compromissos", label: "Agenda" },
  { key: "isis", label: "Isis" },
  { key: "historico", label: "Histórico" },
  { key: "cargas", label: "Cargas" },
] as const;

/** Quem não tem nada cadastrado pode tudo — é o padrão de hoje. */
export function usePermissions(userId?: string | null) {
  const { profile } = useAuth();
  const household = profile?.household_id;

  return useQuery({
    queryKey: ["tab_permissions", household, userId],
    enabled: !!household && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tab_permissions")
        .select("tab,allowed")
        .eq("user_id", userId!);
      if (error) throw error;
      const map: Record<string, boolean> = {};
      for (const row of data ?? []) map[row.tab] = row.allowed;
      return map;
    },
  });
}

/** Uma aba está liberada? Sem cadastro, liberada. */
export function isTabAllowed(
  permissions: Record<string, boolean> | undefined,
  tab: string,
): boolean {
  if (!permissions) return true;
  return permissions[tab] !== false;
}

export function useSavePermission() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return async (userId: string, tab: string, allowed: boolean) => {
    const household = profile?.household_id;
    if (!household) throw new Error("Sem casa identificada.");

    const { error } = await supabase
      .from("tab_permissions")
      .upsert(
        { user_id: userId, household_id: household, tab, allowed },
        { onConflict: "user_id,tab" },
      );
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["tab_permissions", household] });
  };
}
