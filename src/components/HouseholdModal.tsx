import { useState } from "react";
import { toast } from "sonner";
import { Copy, LogOut, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button, Field, Modal, Spinner } from "@/components/kit";
import { AuthService, useAuth } from "@/hooks/useAuth";

export function HouseholdModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, refreshProfile } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: household } = useQuery({
    queryKey: ["household", profile?.household_id],
    enabled: !!profile?.household_id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("households")
        .select("id,name,invite_code")
        .eq("id", profile!.household_id!)
        .maybeSingle();
      return data;
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["members", profile?.household_id],
    enabled: !!profile?.household_id && open,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,name,email");
      return data ?? [];
    },
  });

  async function join() {
    if (!code.trim()) return toast.error("Informe o código do convite");
    setBusy(true);
    const { error } = await supabase.rpc("join_household", { _code: code.trim().toUpperCase() });
    setBusy(false);
    if (error) return toast.error("Código inválido. Confira e tente de novo.");
    await refreshProfile();
    toast.success("Vocês agora compartilham a mesma casa! 🏡");
    setCode("");
    window.location.reload();
  }

  return (
    <Modal open={open} onClose={onClose} title="Nossa casa">
      <div className="rounded-2xl bg-primary-soft p-4">
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">Código de convite</p>
        <div className="mt-1 flex items-center gap-2">
          <p className="font-mono text-2xl font-bold tracking-widest text-primary">
            {household?.invite_code ?? "..."}
          </p>
          <Button
            size="icon"
            variant="soft"
            aria-label="Copiar código"
            onClick={() => {
              void navigator.clipboard.writeText(household?.invite_code ?? "");
              toast.success("Código copiado!");
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 text-xs text-primary/80">
          Compartilhe esse código para que a outra pessoa veja exatamente os mesmos dados, em tempo real.
        </p>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Users className="h-4 w-4" /> Quem está na casa
        </p>
        <ul className="space-y-1 text-sm text-muted-foreground">
          {members.map((m: { id: string; name: string; email: string }) => (
            <li key={m.id} className="flex justify-between rounded-lg bg-secondary px-3 py-2">
              <span className="font-medium text-foreground">{m.name}</span>
              <span className="text-xs">{m.email}</span>
            </li>
          ))}
        </ul>
      </div>

      <Field label="Entrar em outra casa">
        <div className="flex gap-2">
          <input
            className="field font-mono uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CÓDIGO"
          />
          <Button onClick={() => void join()} disabled={busy}>
            {busy ? <Spinner /> : "Entrar"}
          </Button>
        </div>
      </Field>

      <Button variant="dangerGhost" className="w-full" onClick={() => void AuthService.signOut()}>
        <LogOut className="h-4 w-4" /> Sair da conta
      </Button>
    </Modal>
  );
}
