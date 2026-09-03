"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Radar, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createBrowserSupabaseClient } from "@/lib/services/supabase";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get("mode") === "signup" ? "signup" : "login";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createBrowserSupabaseClient();

  const submit = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success("Conta criada! Verifique seu e-mail para confirmar.");
        router.push("/app");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/app");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-sm border-border bg-card">
      <CardHeader className="items-center gap-2 pb-2 pt-8 text-center">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Radar className="size-6" />
        </div>
        <CardTitle className="text-xl">Radar AI</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-8 pb-8">
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            placeholder="voce@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        {supabase ? (
          <Button className="w-full" onClick={submit} disabled={loading || !email || !password}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            {mode === "signup" ? "Criar conta" : "Entrar"}
          </Button>
        ) : (
          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => router.push("/app")}
              disabled={loading}
            >
              Entrar em modo demonstração
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Supabase não configurado — você verá o sistema com dados de demonstração.
            </p>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          {mode === "signup" ? (
            <>
              Já tem conta?{" "}
              <a href="/login" className="text-info hover:underline">
                Entrar
              </a>
            </>
          ) : (
            <>
              Novo por aqui?{" "}
              <a href="/login?mode=signup" className="text-info hover:underline">
                Criar conta
              </a>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}