import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Home, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button, Field, Spinner } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — Nossa Casa" },
      { name: "description", content: "Crie uma nova senha para acessar o Nossa Casa." },
      { property: "og:title", content: "Redefinir senha — Nossa Casa" },
      { property: "og:description", content: "Crie uma nova senha para acessar o Nossa Casa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [validRecovery, setValidRecovery] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const isRecovery = new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";
    void supabase.auth.getSession().then(({ data }) => {
      setValidRecovery(isRecovery || Boolean(data.session));
      setChecking(false);
    });
  }, []);

  async function submit() {
    if (password.length < 6) {
      toast.error("A nova senha precisa ter ao menos 6 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Senha alterada. Você já pode entrar.");
    await supabase.auth.signOut();
    await navigate({ to: "/" });
  }

  if (checking) {
    return <main className="flex min-h-dvh items-center justify-center text-primary"><Spinner className="h-6 w-6" /></main>;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm surface p-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
            {validRecovery ? <KeyRound className="h-7 w-7" /> : <Home className="h-7 w-7" />}
          </div>
          <h1 className="text-2xl">{validRecovery ? "Crie uma nova senha" : "Link inválido"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {validRecovery ? "Escolha uma senha diferente e segura" : "Este link expirou ou já foi utilizado."}
          </p>
        </div>

        {validRecovery ? (
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <Field label="Nova senha">
              <div className="relative">
                <input className="field pr-11" type={show ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
                <button type="button" onClick={() => setShow((value) => !value)} aria-label={show ? "Ocultar senha" : "Mostrar senha"} className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <Field label="Confirmar nova senha">
              <input className="field" type={show ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? <Spinner /> : "Salvar nova senha"}</Button>
          </form>
        ) : (
          <Button className="w-full" onClick={() => void navigate({ to: "/" })}>Solicitar outro link</Button>
        )}
      </div>
    </main>
  );
}