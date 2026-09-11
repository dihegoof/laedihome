import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { flushOfflineMutations, pendingMutationCount } from "@/lib/offline";

export function ConnectionStatus() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const refresh = async () => {
      const nowOnline = navigator.onLine;
      setOnline(nowOnline);
      if (nowOnline) {
        const sent = await flushOfflineMutations();
        if (sent) toast.success(`${sent} alteração${sent === 1 ? "" : "ões"} sincronizada${sent === 1 ? "" : "s"}`);
      }
      setPending(await pendingMutationCount());
    };
    const onVisibility = () => document.visibilityState === "visible" && void refresh();
    void refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("offline-queue-change", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("offline-queue-change", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (online && !pending) return null;
  return (
    <div className="sticky top-[65px] z-20 border-b border-border bg-warning/15 px-4 py-2 text-center text-xs font-semibold text-foreground">
      <span className="inline-flex items-center gap-2">
        {online ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CloudOff className="h-3.5 w-3.5" />}
        {online ? `Sincronizando ${pending} alteração${pending === 1 ? "" : "ões"}` : `Sem internet${pending ? ` · ${pending} pendente${pending === 1 ? "" : "s"}` : ""}`}
      </span>
    </div>
  );
}