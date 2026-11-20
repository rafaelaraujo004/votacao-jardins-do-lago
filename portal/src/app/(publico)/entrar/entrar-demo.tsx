"use client";

/**
 * Botões "Entrar como..." — SÓ aparecem no computador local, com o simulador.
 * Seguem o mesmo caminho de um login real:
 *   1. pega um token do usuário fictício (/api/demo/entrar);
 *   2. entra no Firebase Auth (simulado) com ele;
 *   3. troca o token por um cookie de sessão (/api/sessao).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { Building2, CalendarCheck, ChevronRight, House, LoaderCircle, ShieldCheck, Landmark, type LucideIcon } from "lucide-react";
import { cabecalhosSeguros, firebaseAuth } from "@/lib/firebase/client";
import { useAvisos } from "@/components/ui/avisos";
import { Alerta } from "@/components/ui/basicos";
import type { Papel } from "@/lib/permissoes";
import { destinoDepoisDoLogin } from "@/lib/destino-seguro";

type Perfil = { papel: Papel; titulo: string; nome: string; descricao: string };

const ICONES: Record<Papel, LucideIcon> = {
  morador: House,
  portaria: ShieldCheck,
  admin: Building2,
  conselheiro: Landmark,
  reservas: CalendarCheck,
};

async function lerErro(resposta: Response): Promise<string> {
  const corpo = (await resposta.json().catch(() => null)) as { erro?: string } | null;
  return corpo?.erro ?? "Algo deu errado. Tente de novo em instantes.";
}

export function EntrarDemo({ perfis, volta = null }: { perfis: Perfil[]; volta?: string | null }) {
  const router = useRouter();
  const { avisar } = useAvisos();
  const [entrando, setEntrando] = useState<Papel | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar(papel: Papel) {
    setEntrando(papel);
    setErro(null);
    try {
      const r1 = await fetch("/api/demo/entrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfil: papel }),
      });
      if (!r1.ok) throw new Error(await lerErro(r1));
      const { token } = (await r1.json()) as { token: string };

      const auth = await firebaseAuth();
      const credencial = await signInWithCustomToken(auth, token);
      const idToken = await credencial.user.getIdToken();

      const r2 = await fetch("/api/sessao", {
        method: "POST",
        headers: await cabecalhosSeguros(),
        body: JSON.stringify({ idToken }),
      });
      if (!r2.ok) throw new Error(await lerErro(r2));
      const { destino } = (await r2.json()) as { destino: string };

      avisar("sucesso", "Pronto, você entrou.");
      // Veio por um link de módulo (ex.: /reservas)? Segue para a versão dele no perfil escolhido.
      router.replace(destinoDepoisDoLogin(destino, volta));
      router.refresh();
    } catch (e) {
      const mensagem =
        e instanceof Error && e.message
          ? e.message
          : "Não foi possível entrar. Confira se o simulador está ligado (npm run dev:emu).";
      setErro(mensagem);
      avisar("erro", "Não foi possível entrar.");
      setEntrando(null);
    }
  }

  return (
    <section aria-labelledby="titulo-demo" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 rounded-2xl bg-sand px-4 py-3 text-ink">
        <h2 id="titulo-demo" className="text-[1.05rem] font-bold">
          Demonstração no seu computador
        </h2>
        <p className="text-[0.95rem] text-ink-2">
          Escolha um perfil para ver o portal como essa pessoa. Os nomes são fictícios e estes botões não existem na
          versão publicada.
        </p>
      </div>

      {erro ? (
        <Alerta tipo="erro" titulo="Não foi possível entrar">
          {erro}
        </Alerta>
      ) : null}

      <ul className="flex flex-col gap-2.5">
        {perfis.map(({ papel, titulo, nome, descricao }) => {
          const Icone = ICONES[papel];
          const carregando = entrando === papel;
          return (
            <li key={papel}>
              <button
                type="button"
                onClick={() => entrar(papel)}
                disabled={entrando !== null}
                aria-busy={carregando || undefined}
                className="saltado flex min-h-20 w-full items-center gap-3.5 rounded-[28px] py-3 pl-3 pr-4 text-left transition-[box-shadow,color] hover:text-pine active:shadow-afundado disabled:cursor-wait disabled:opacity-60"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-ok-soft text-pine">
                  <Icone aria-hidden className="size-6" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-display text-[1.08rem] font-bold">Entrar como {titulo}</span>
                  <span className="text-[0.92rem] text-muted">
                    {nome} · {descricao}
                  </span>
                </span>
                {carregando ? (
                  <LoaderCircle aria-hidden className="size-5 shrink-0 animate-spin text-pine" />
                ) : (
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
