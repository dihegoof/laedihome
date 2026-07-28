import { History } from "lucide-react";
import { EmptyState } from "@/components/kit";
import { useHistory } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

export function HistoryScreen() {
  const { data: entries = [], isLoading } = useHistory();

  if (isLoading) return <EmptyState>Carregando histórico...</EmptyState>;
  if (!entries.length) return <EmptyState>Nenhuma atividade registrada ainda.</EmptyState>;

  return (
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
  );
}
