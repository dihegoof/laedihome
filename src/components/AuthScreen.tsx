import { useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Home } from "lucide-react";
import { AuthService } from "@/hooks/useAuth";
import { Button, Field, Spinner } from "@/components/kit";

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [nameOrEmail, setNameOrEmail] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!name.trim()) throw new Error("Informe seu nome");
        if (!email.includes("@")) throw new Error("Informe um e-mail válido");
        if (password.length < 6) throw new Error("A senha precisa ter ao menos 6 caracteres");
        await AuthService.signUp(name, email, password);
        toast.success("Conta criada! Bem-vindo(a).");
      } else {
        if (!nameOrEmail.trim() || !password) throw new Error("Preencha nome/e-mail e senha");
        await AuthService.signIn(nameOrEmail, password);
        toast.success("Bem-vindo(a) de volta!");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível entrar";
      toast.error(
        message.includes("Invalid login credentials") ? "Nome/e-mail ou senha incorretos" : message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(120%_80%_at_50%_0%,var(--color-primary-soft),var(--color-background))] px-4 py-10">
      <div className="w-full max-w-sm surface p-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
            <Home className="h-7 w-7" />
          </div>
          <h1 className="text-2xl">{mode === "login" ? "Entrar" : "Criar conta"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "login"
              ? "Use seu nome ou e-mail para acessar"
              : "Crie sua conta para começar"}
          </p>
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode === "signup" && (
            <Field label="Nome">
              <input
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                autoComplete="name"
              />
            </Field>
          )}

          {mode === "signup" ? (
            <Field label="E-mail">
              <input
                className="field"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                autoComplete="email"
              />
            </Field>
          ) : (
            <Field label="Nome ou e-mail">
              <input
                className="field"
                value={nameOrEmail}
                onChange={(e) => setNameOrEmail(e.target.value)}
                placeholder="Nome ou e-mail"
                autoComplete="username"
              />
            </Field>
          )}

          <Field label="Senha">
            <div className="relative">
              <input
                className="field pr-11"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <Button type="submit" size="lg" className="mt-2 w-full" disabled={busy}>
            {busy ? <Spinner /> : mode === "login" ? "Entrar" : "Cadastrar"}
          </Button>
        </form>

        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-4 w-full text-center text-sm font-medium text-primary"
        >
          {mode === "login" ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
        </button>
      </div>
    </main>
  );
}
