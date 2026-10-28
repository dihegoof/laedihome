import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Mail, Plus, Trash2 } from "lucide-react";
import { Button, Field, Spinner } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";
import { logHistory } from "@/lib/data";

type Row = { id: string; kind: string; carrier: string | null; email: string };

/**
 * Seção do painel de administração: cadastro dos contatos de CT-e.
 * - Torre (fixo no "Para")
 * - Cópia fixa (recebimento fiscal, gestores, faturamento)
 * - E-mails por transportadora
 *
 * Cole este componente no AdminScreen.tsx e renderize <CteContactsAdmin userName={userName} />
 * dentro do painel, junto das outras seções.
 */
export function CteContactsAdmin({ userName }: { userName: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [newFixed, setNewFixed] = useState("");
  const [newCc, setNewCc] = useState("");
  const [carrier, setCarrier] = useState("");
  const [carrierEmail, setCarrierEmail] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("cte_contacts")
      .select("id,kind,carrier,email")
      .order("carrier", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const toFixed = useMemo(() => rows.filter((r) => r.kind === "to_fixed"), [rows]);
  const ccFixed = useMemo(() => rows.filter((r) => r.kind === "cc_fixed"), [rows]);
  const carriers = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      if (r.kind !== "carrier") continue;
      const key = (r.carrier ?? "").toUpperCase();
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [rows]);

  async function add(kind: string, email: string, carrierName?: string) {
    const clean = email.trim();
    if (!clean) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("cte_contacts").insert({
        kind,
        carrier: carrierName ? carrierName.toUpperCase() : null,
        email: clean,
      });
      if (error) throw error;
      await load();
      toast.success("Contato salvo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const { error } = await supabase.from("cte_contacts").delete().eq("id", id);
      if (error) throw error;
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui remover");
    } finally {
      setBusy(false);
    }
  }

  function EmailList({ list }: { list: Row[] }) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {list.map((r) => (
          <span
            key={r.id}
            className="flex items-center gap-1.5 rounded bg-secondary px-2 py-1 text-[12px]"
          >
            {r.email}
            <button
              aria-label={`Remover ${r.email}`}
              className="text-muted-foreground hover:text-destructive"
              disabled={busy}
              onClick={() => {
                void remove(r.id);
                void logHistory(userName, `removeu o contato ${r.email} de CT-e`);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        {!list.length && <span className="text-xs text-muted-foreground">Nenhum contato.</span>}
      </div>
    );
  }

  return (
    <section className="surface p-4">
      <header className="mb-3 flex items-center gap-2">
        <Mail className="h-4 w-4 text-primary" />
        <h3 className="text-base">Contatos de CT-e</h3>
        {loading && <Spinner className="ml-auto" />}
      </header>

      <p className="mb-3 text-xs text-muted-foreground">
        Usados ao solicitar CT-e manual. A Torre vai no Para, junto com a transportadora da carga.
        A cópia é sempre a mesma, em qualquer pedido.
      </p>

      <div className="space-y-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
            Para — Torre (desconsidera o CT-e automático)
          </p>
          <EmailList list={toFixed} />
          <div className="mt-2 flex gap-2">
            <input
              className="field"
              placeholder="email@kof.com"
              value={newFixed}
              onChange={(e) => setNewFixed(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => { void add("to_fixed", newFixed); setNewFixed(""); }}
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
            Cópia fixa
          </p>
          <EmailList list={ccFixed} />
          <div className="mt-2 flex gap-2">
            <input
              className="field"
              placeholder="email@kof.com"
              value={newCc}
              onChange={(e) => setNewCc(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => { void add("cc_fixed", newCc); setNewCc(""); }}
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
            Por transportadora
          </p>

          <div className="mb-2 flex gap-2">
            <input
              className="field"
              placeholder="Transportadora"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
            />
            <input
              className="field"
              placeholder="email@transportadora.com"
              value={carrierEmail}
              onChange={(e) => setCarrierEmail(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={busy || !carrier.trim()}
              onClick={() => {
                void add("carrier", carrierEmail, carrier);
                setCarrierEmail("");
              }}
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>

          <div className="space-y-2">
            {carriers.map(([name, list]) => (
              <div key={name} className="rounded border border-border p-2">
                <p className="mb-1 text-[12px] font-semibold">{name}</p>
                <EmailList list={list} />
              </div>
            ))}
            {!carriers.length && (
              <p className="text-xs text-muted-foreground">Nenhuma transportadora cadastrada.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
