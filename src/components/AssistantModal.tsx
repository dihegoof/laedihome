import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff, Mic, Square, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button, Modal, Spinner } from "@/components/kit";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { understandAssistantCommand, type AssistantCommand } from "@/lib/assistant.functions";
import { queueOfflineMutation } from "@/lib/offline";
import { disablePushForThisUser, enablePush, type PushStatus } from "@/lib/notifications";

type SpeechEvent = Event & { results: { [key: number]: { [key: number]: { transcript: string } } } };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function pushMessage(status: PushStatus) {
  if (status === "registered") return "Notificações ativadas neste aparelho.";
  if (status === "open-in-new-tab") return "Abra o aplicativo em uma nova aba ou use a versão publicada.";
  if (status === "install-on-iphone") return "No iPhone, adicione o Nossa Casa à Tela de Início e abra por lá.";
  if (status === "denied") return "Permissão negada. Libere as notificações nas configurações do navegador.";
  if (status === "not-configured") return "A conexão de notificações precisa incluir Web Push.";
  return "Este aparelho não oferece notificações pelo navegador.";
}

export function AssistantModal({ open, onClose, userName }: { open: boolean; onClose: () => void; userName: string }) {
  const { user, profile, refreshProfile } = useAuth();
  const understand = useServerFn(understandAssistantCommand);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [command, setCommand] = useState<AssistantCommand | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => () => recognition.current?.stop(), []);

  function listen() {
    const Ctor = (window as typeof window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
      ?? (window as typeof window & { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!Ctor) return toast.error("Este navegador não reconhece voz. Use Chrome ou Edge.");
    const instance = new Ctor();
    instance.lang = "pt-BR";
    instance.continuous = Boolean(profile?.assistant_always_on);
    instance.interimResults = false;
    instance.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript ?? "";
      setTranscript(text);
      if (text) void interpret(text);
    };
    instance.onend = () => setListening(false);
    instance.onerror = () => { setListening(false); toast.error("Não consegui ouvir. Verifique o microfone."); };
    recognition.current = instance;
    instance.start();
    setListening(true);
  }

  async function interpret(text: string) {
    setBusy(true);
    try {
      setCommand(await understand({ data: { transcript: text } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não entendi o comando");
    } finally {
      setBusy(false);
    }
  }

  async function setAlwaysOn(value: boolean) {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ assistant_always_on: value }).eq("id", user.id);
    if (error) return toast.error(error.message);
    await refreshProfile();
    toast.success(value ? "Escuta contínua ativada enquanto o app estiver aberto" : "Escuta contínua desativada");
  }

  async function execute() {
    if (!command) return;
    setBusy(true);
    try {
      const p = command.payload;
      let table: "products" | "finances" | "appointments" | "debts" | "goals";
      let payload: Record<string, unknown>;
      if (command.action === "add_product") {
        table = "products";
        payload = { name: String(p.name ?? "Produto"), quantity: Number(p.quantity) || 1, category: p.category ? String(p.category) : null, is_essential: Boolean(p.is_essential), is_new: true };
      } else if (command.action === "change_product_quantity") {
        const { data: products } = await supabase.from("products").select("id,name,quantity");
        const wanted = String(p.name ?? "").toLowerCase();
        const product = products?.find((item) => item.name.toLowerCase().includes(wanted) || wanted.includes(item.name.toLowerCase()));
        if (!product) throw new Error("Não encontrei esse produto na despensa");
        const quantity = Math.max(0, Number(product.quantity) + (Number(p.quantity) || 0));
        if (!navigator.onLine) await queueOfflineMutation({ table: "products", operation: "update", rowId: product.id, payload: { quantity, is_new: false } });
        else {
          const { error } = await supabase.from("products").update({ quantity, is_new: false }).eq("id", product.id);
          if (error) throw error;
        }
        toast.success("Quantidade atualizada");
        setCommand(null);
        return;
      } else if (command.action === "add_finance") {
        table = "finances";
        payload = { description: String(p.description ?? "Lançamento"), value: Number(p.value) || 0, type: p.type === "income" ? "income" : "expense", category: p.category ? String(p.category) : null, date: String(p.date ?? new Date().toISOString().slice(0, 10)) };
      } else if (command.action === "add_appointment") {
        table = "appointments";
        payload = { title: String(p.title ?? "Compromisso"), scheduled_at: String(p.scheduled_at), created_by: user?.id ?? null, created_by_name: userName };
      } else if (command.action === "add_debt") {
        const installments = Math.max(1, Number(p.total_installments) || 1);
        const total = Number(p.total_value) || 0;
        table = "debts";
        payload = { description: String(p.description ?? "Dívida"), creditor: p.creditor ? String(p.creditor) : null, total_value: total, total_installments: installments, installment_value: total / installments };
      } else if (command.action === "add_goal") {
        table = "goals";
        payload = { name: String(p.name ?? "Meta"), description: p.description ? String(p.description) : null, target_value: Number(p.target_value) || 0, saved_value: 0, created_by_name: userName };
      } else throw new Error("Não entendi qual ação devo fazer");

      if (!navigator.onLine) await queueOfflineMutation({ table, operation: "insert", payload });
      else {
        const { error } = await supabase.from(table).insert(payload as never);
        if (error) throw error;
      }
      toast.success(navigator.onLine ? "Pronto, ação concluída" : "Ação guardada para sincronizar");
      setCommand(null);
      setTranscript("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não consegui concluir");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Assistente da casa">
      <div className="flex items-center justify-between rounded-xl bg-secondary p-3">
        <div><p className="text-sm font-semibold">Escuta contínua</p><p className="text-xs text-muted-foreground">Somente com o app aberto</p></div>
        <Button size="sm" variant={profile?.assistant_always_on ? "primary" : "outline"} onClick={() => void setAlwaysOn(!profile?.assistant_always_on)}>{profile?.assistant_always_on ? "Ativa" : "Inativa"}</Button>
      </div>
      <button onClick={() => listening ? recognition.current?.stop() : listen()} className="mx-auto flex flex-col items-center gap-2 py-4 text-sm font-semibold text-primary">
        <span className={`flex h-16 w-16 items-center justify-center rounded-full ${listening ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}>{listening ? <Square className="h-6 w-6" /> : <Mic className="h-7 w-7" />}</span>
        {listening ? "Ouvindo... toque para parar" : "Toque e fale o que precisa"}
      </button>
      {busy && <div className="flex justify-center"><Spinner /></div>}
      {transcript && <p className="rounded-xl border border-border p-3 text-sm">“{transcript}”</p>}
      {command && <div className="rounded-xl bg-primary-soft p-3"><p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4" /> {command.summary}</p><div className="mt-3 flex gap-2"><Button className="flex-1" onClick={() => void execute()} disabled={busy}>Confirmar</Button><Button variant="outline" onClick={() => setCommand(null)}>Cancelar</Button></div></div>}
      <div className="border-t border-border pt-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">NOTIFICAÇÕES NESTE APARELHO</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={async () => { if (!user) return; try { const status = await enablePush(user.id); toast[status === "registered" ? "success" : "info"](pushMessage(status)); } catch (e) { toast.error(e instanceof Error ? e.message : "Não consegui ativar"); } }}><Bell className="h-4 w-4" /> Ativar</Button>
          <Button size="sm" variant="ghost" onClick={async () => { if (!user) return; await disablePushForThisUser(user.id); toast.success("Notificações desativadas"); }}><BellOff className="h-4 w-4" /> Desativar</Button>
        </div>
      </div>
    </Modal>
  );
}