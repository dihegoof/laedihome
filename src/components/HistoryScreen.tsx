import { useState } from "react";
import { History, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, EmptyState, Spinner } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";
import { useHistory, useInvalidate } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

export function HistoryScreen() {
  const { data: entries = [], isLoading } = useHistory();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);

  async function clearAll() {
    if (!confirm("Apagar todo o histórico de atividades?")) return;
    setBusy(true);
    const { error } = await supabase.from("history").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setBusy(false);
    if (error) return toast.error(error.message);
    void invalidate("history");
    toast.success("Histórico limpo");
  }

  if (isLoading) return <EmptyState>Carregando histórico...</EmptyState>;

  return (
    <div className="space-y-3">
      {entries.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{entries.length} registro(s)</p>
          <Button size="sm" variant="outline" onClick={() => void clearAll()} disabled={busy}>
            {busy ? <Spinner /> : <Trash2 className="h-4 w-4 text-destructive" />} Limpar histórico
          </Button>
        </div>
      )}

      {!entries.length && <EmptyState>Nenhuma atividade registrada ainda.</EmptyState>}

      <div className="space-y-2">
        {entries.map((e) => (
          <article key={e.id} className="surface flex items-start gap-3 p-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <History className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm">
                <strong>{e.user_name}</strong> {e.action}
                {e.target ? <span className="text-muted-foreground"> — {e.target}</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">{formatDateTime(e.created_at)}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
