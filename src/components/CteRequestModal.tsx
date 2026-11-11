import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Mail, X } from "lucide-react";
import { Button, Field, Modal } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";
import type { CargoLoad } from "@/lib/cargo";

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }).format(new Date()),
  );
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

const toList = (emails: string[]) => emails.join("; ");
const cleanPlate = (p: string | null | undefined) => (p ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/** Solicitação de CT-e manual para uma ou várias cargas da mesma transportadora. */
export function CteRequestModal({
  open, onClose, loads, onSent,
}: {
  open: boolean;
  onClose: () => void;
  loads: CargoLoad[];
  onSent: () => void;
}) {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [copies, setCopies] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const carrier = (loads[0]?.carrier ?? "").trim().toUpperCase();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase.from("cte_contacts").select("kind,carrier,email");
        if (error) throw error;
        const rows = data ?? [];
        if (!alive) return;
        setRecipients([
          ...rows.filter((r) => r.kind === "to_fixed").map((r) => r.email),
          ...rows.filter((r) => r.kind === "carrier" && (r.carrier ?? "").toUpperCase() === carrier).map((r) => r.email),
        ]);
        setCopies(rows.filter((r) => r.kind === "cc_fixed").map((r) => r.email));
      } catch {
        if (alive) toast.error("Não consegui carregar os contatos de CT-e.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open, carrier]);

  const plates = loads.map((l) => cleanPlate(l.plate)).filter(Boolean);
  const subject = `Emissão CTe manual - ${carrier || "TRANSPORTADORA"}${plates.length ? `  ${plates.join(" / ")}` : ""}`;

  const body = useMemo(() => {
    const blocos = loads.flatMap((l) => [
      `DT: 400${(l.driver_dt ?? "").trim()}`,
      `Placa: ${cleanPlate(l.plate) || "<Placa>"}`,
      "",
    ]);
    return [
      `${greeting()},`,
      "",
      loads.length > 1
        ? "Por gentileza nos apoiar com o desacordo para os transportes abaixo para que seja possível a emissão dos CT-es manuais!"
        : "Por gentileza nos apoiar com o desacordo para o transporte abaixo para que seja possível a emissão do CT-e manual!",
      "",
      ...blocos,
      "[Cole aqui a evidência do Triangulus]",
      "",
    ].join("\n");
  }, [loads, open]);

  const mailto = `mailto:${toList(recipients)}?cc=${encodeURIComponent(toList(copies))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title={loads.length > 1 ? `Solicitar CT-e manual (${loads.length} cargas)` : "Solicitar CT-e manual"}>
      <div className="space-y-3">
        <Field label="Para">
          <textarea className="field h-20 resize-none text-xs" readOnly value={loading ? "Carregando..." : toList(recipients)} />
        </Field>
        <Field label="Cópia">
          <textarea className="field h-16 resize-none text-xs" readOnly value={toList(copies)} />
        </Field>
        <Field label="Assunto">
          <input className="field" readOnly value={subject} />
        </Field>
        <Field label="Mensagem">
          <textarea className="field h-48 resize-y text-[13px]" readOnly value={body} />
        </Field>
        <p className="text-[11px] text-muted-foreground">
          As NFs e o print do Triangulus você anexa depois de abrir o e-mail.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              try { await navigator.clipboard.writeText(body); toast.success("Mensagem copiada"); }
              catch { toast.error("Não consegui copiar"); }
            }}
          >
            <Copy className="h-4 w-4" /> Copiar mensagem
          </Button>
          <Button variant="outline" onClick={() => { window.location.href = mailto; }}>
            <Mail className="h-4 w-4" /> Abrir no Outlook
          </Button>
          <Button onClick={onSent}>
            <Check className="h-4 w-4" /> Enviei — iniciar contador
          </Button>
          <Button variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" /> Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
