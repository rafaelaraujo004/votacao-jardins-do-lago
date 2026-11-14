"use client";

/**
 * Entrada da EQUIPE (síndico, conselho e portaria) com e-mail e senha.
 *   1. o Firebase Auth confere e-mail e senha no navegador;
 *   2. o token do Firebase vira cookie de sessão no servidor (/api/sessao).
 * As mensagens de erro nunca dizem se o e-mail existe ou não.
 */
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { cabecalhosSeguros, firebaseAuth } from "@/lib/firebase/client";
import { codigoDoErro, esquemaLoginEquipe, mensagemErroLogin } from "@/lib/senha";
import { useAvisos } from "@/components/ui/avisos";
import { Alerta, Campo, classeEntrada } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";

/** Erro com mensagem já pronta para a pessoa ler (vinda do nosso servidor). */
class ErroPronto extends Error {}

export function EntrarSenha() {
  const router = useRouter();
  const { avisar } = useAvisos();
  const [mostrar, setMostrar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    const dados = esquemaLoginEquipe.safeParse({ email: form.get("email"), senha: form.get("senha") });
    if (!dados.success) {
      setErro(dados.error.issues[0]?.message ?? "Confira o e-mail e a senha.");
      return;
    }

    setEnviando(true);
    setErro(null);
    const auth = await firebaseAuth().catch(() => null);
    try {
      if (!auth) throw new ErroPronto("O portal não está configurado para entrar agora. Avise a administração.");
      const credencial = await signInWithEmailAndPassword(auth, dados.data.email, dados.data.senha);
      const idToken = await credencial.user.getIdToken();

      const resposta = await fetch("/api/sessao", {
        method: "POST",
        headers: await cabecalhosSeguros(),
        body: JSON.stringify({ idToken }),
      });
      const corpo = (await resposta.json().catch(() => null)) as { destino?: string; erro?: string } | null;
      if (!resposta.ok || !corpo?.destino) {
        throw new ErroPronto(corpo?.erro ?? "Não foi possível entrar agora. Tente de novo em instantes.");
      }

      avisar("sucesso", "Pronto, você entrou.");
      router.replace(corpo.destino);
      router.refresh();
    } catch (e) {
      // Não deixa um login pela metade no navegador.
      if (auth) await signOut(auth).catch(() => undefined);
      setErro(e instanceof ErroPronto ? e.message : mensagemErroLogin(codigoDoErro(e)));
      setEnviando(false);
    }
  }

  return (
    <section aria-labelledby="titulo-equipe" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="titulo-equipe" className="text-[1.2rem] font-bold">
          Equipe do condomínio
        </h2>
        <p className="text-[0.95rem] text-ink-2">Síndico, conselho e portaria entram com o e-mail e a senha recebidos.</p>
      </div>

      {erro ? (
        <Alerta tipo="erro" titulo="Não foi possível entrar">
          {erro}
        </Alerta>
      ) : null}

      <form onSubmit={entrar} className="flex flex-col gap-4" noValidate>
        <Campo id="email" rotulo="E-mail">
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={254}
            className={classeEntrada}
          />
        </Campo>

        <Campo id="senha" rotulo="Senha">
          <div className="relative">
            <input
              id="senha"
              name="senha"
              type={mostrar ? "text" : "password"}
              autoComplete="current-password"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={128}
              className={`${classeEntrada} pr-14`}
            />
            <button
              type="button"
              onClick={() => setMostrar((m) => !m)}
              aria-pressed={mostrar}
              aria-controls="senha"
              title={mostrar ? "Ocultar senha" : "Mostrar senha"}
              className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-pine"
            >
              {mostrar ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
              <span className="sr-only">{mostrar ? "Ocultar senha" : "Mostrar senha"}</span>
            </button>
          </div>
        </Campo>

        <Botao type="submit" largo carregando={enviando} icone={<LogIn aria-hidden className="size-5" />}>
          {enviando ? "Entrando…" : "Entrar"}
        </Botao>
      </form>

      <p className="text-[0.9rem] text-muted">
        Esqueceu a senha? Peça à administração do condomínio uma nova senha provisória.
      </p>
    </section>
  );
}
