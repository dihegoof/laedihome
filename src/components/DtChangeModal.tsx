import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Mail, X } from "lucide-react";
import { Button, Field, Modal } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";
import type { CargoLoad } from "@/lib/cargo";

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

const toList = (emails: string[]) => emails.join("; ");

/**
 * Solicitação de troca de DT.
 * Os destinatários saem dos contatos da CT-e: a transportadora vai em "Para"
 * e os contatos fixos em "Cópia". O cancelemento do MDF-e é opcional.
 */
export function DtChangeModal({
  open,
  onClose,
  load,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  load: CargoLoad | null;
  onSent: (novoDt: string) => void;
}) {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [copies, setCopies] = useState<string[]>([]);
  const [carrierEmails, setCarrierEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [novoDt, setNovoDt] = useState("");
  const [nf, setNf] = useState("");
  const [motivo, setMotivo] = useState("");
  const [cancelarMdfe, setCancelarMdfe] = useState(false);

  const carrier = (load?.carrier ?? "").trim().toUpperCase();
  const dtAntigo = (load?.driver_dt ?? "").trim();

  useEffect(() => {
    if (!open) return;
    setNovoDt("");
    setNf("");
    setMotivo("");
    setCancelarMdfe(false);

    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("cte_contacts")
          .select("kind,carrier,email");
        if (error) throw error;
        const rows = data ?? [];
        if (!alive) return;

        const daTransportadora = rows
          .filter((r) => r.kind === "carrier" && (r.carrier ?? "").toUpperCase() === carrier)
          .map((r) => r.email);

        setCarrierEmails(daTransportadora);
        setRecipients([
          ...rows.filter((r) => r.kind === "to_fixed").map((r) => r.email),
          ...daTransportadora,
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

  /** Último e-mail cadastrado da transportadora — é quem recebe a linha do MDF-e. */
  const emailMdfe = carrierEmails.length ? carrierEmails[carrierEmails.length - 1] : "";

  const subject = `Troca de DT - ${carrier || "TRANSPORTADORA"}${novoDt ? `  ${novoDt}` : ""}`;

  const body = useMemo(() => {
    if (!load) return "";
    const linhas = [
      `${greeting()},`,
      "",
      "Por gentileza nos apoiar com a troca de transporte abaixo, será alterado devido faturamento!",
      "",
    ];

    if (cancelarMdfe && emailMdfe) {
      linhas.push(
        `${emailMdfe}, por gentileza nos apoiar com o cancelamento do manifesto do transporte citado abaixo.`,
        "",
      );
    }

    if (nf.trim()) {
      linhas.push(`Notas fiscais: ${nf.trim()}`, "");
    }

    linhas.push(`Transporte antigo: ${dtAntigo ? `400${dtAntigo}` : "—"}`);
    linhas.push(`Transporte novo: ${novoDt ? `400${novoDt}` : "—"}`);
    linhas.push("");
    linhas.push(`Motivo: ${motivo.trim() || "—"}`);
    linhas.push("");

    return linhas.join("\n");
  }, [load, novoDt, nf, motivo, cancelarMdfe, emailMdfe, dtAntigo]);

  const mailto = `mailto:${toList(recipients)}?cc=${encodeURIComponent(toList(copies))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Solicitar troca de DT">
      <div className="space-y-3">
        <Field label="DT novo">
          <input
            className="field"
            inputMode="numeric"
            placeholder="Ex.: 106948603"
            value={novoDt}
            onChange={(e) => setNovoDt(e.target.value)}
          />
        </Field>

        <Field label="Notas fiscais">
          <input
            className="field"
            placeholder="Ex.: 117254, 117255-2"
            value={nf}
            onChange={(e) => setNf(e.target.value)}
          />
        </Field>

        <Field label="Motivo da troca">
          <textarea
            className="field h-20 resize-none text-[13px]"
            placeholder="Ex.: faturamento inverteu SKU"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </Field>

        <label className="flex items-center gap-2 text-[13px] font-semibold">
          <input
            type="checkbox"
            checked={cancelarMdfe}
            onChange={(e) => setCancelarMdfe(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          Solicitar cancelamento de MDF-e?
        </label>

        <Field label="Para">
          <textarea
            className="field h-20 resize-none text-xs"
            readOnly
            value={loading ? "Carregando..." : toList(recipients)}
          />
        </Field>

        <Field label="Cópia">
          <textarea className="field h-16 resize-none text-xs" readOnly value={toList(copies)} />
        </Field>

        <Field label="Assunto">
          <input className="field" readOnly value={subject} />
        </Field>

        <Field label="Mensagem">
          <textarea className="field h-56 resize-y text-[13px]" readOnly value={body} />
        </Field>

        <p className="text-[11px] text-muted-foreground">
          Ao confirmar o envio, o DT da carga é atualizado e a troca fica registrada no histórico.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(body);
                toast.success("Mensagem copiada");
              } catch {
                toast.error("Não consegui copiar");
              }
            }}
          >
            <Copy className="h-4 w-4" /> Copiar mensagem
          </Button>

          <Button variant="outline" onClick={() => { window.location.href = mailto; }}>
            <Mail className="h-4 w-4" /> Abrir no Outlook
          </Button>

          <Button disabled={!novoDt.trim()} onClick={() => onSent(novoDt.trim())}>
            <Check className="h-4 w-4" /> Enviei — atualizar DT
          </Button>

          <Button variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" /> Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
