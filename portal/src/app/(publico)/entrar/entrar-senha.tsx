"use client";

/**
 * Formulário de entrada com duas opções:
 * - "Sou morador": USUÁRIO (código de 6 caracteres) + senha;
 * - "Sou da equipe": e-mail + senha (síndico, conselho e portaria).
 *
 * Os dois seguem o MESMO caminho:
 *   1. o Firebase Auth confere e-mail e senha no navegador (para o morador,
 *      o usuário vira um e-mail sintético — veja src/lib/usuario-morador.ts);
 *   2. o token do Firebase vira cookie de sessão no servidor (/api/sessao),
 *      que também limita as tentativas e recusa conta suspensa;
 *   3. senha provisória → tela de troca; senão volta para onde estava (?volta=).
 * As mensagens de erro nunca dizem se o usuário/e-mail existe ou não.
 */
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { Eye, EyeOff, House, LogIn, ShieldCheck } from "lucide-react";
import { cabecalhosSeguros, firebaseAuth } from "@/lib/firebase/client";
import { codigoDoErro, esquemaLoginEquipe, mensagemErroLogin, SENHA_MAXIMA } from "@/lib/senha";
import { emailDoMorador, normalizarUsuario } from "@/lib/usuario-morador";
import { destinoDepoisDoLogin, destinoSeguro } from "@/lib/destino-seguro";
import { abaDaEntrada } from "@/lib/modulos";
import { useAvisos } from "@/components/ui/avisos";
import { Alerta, Campo, classeEntrada } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { cx } from "@/lib/cx";

/** Erro com mensagem já pronta para a pessoa ler (vinda do nosso servidor). */
class ErroPronto extends Error {}

type Quem = "morador" | "equipe";

/** Mesma mensagem para usuário inexistente e senha errada (não revela quem tem conta). */
const ERRO_MORADOR = "Usuário ou senha não conferem. Confira e tente de novo.";

/** Erros do Firebase que significam "dados não conferem". */
const CODIGOS_CREDENCIAL = new Set([
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
  "auth/wrong-password",
  "auth/user-not-found",
  "auth/invalid-email",
  "auth/missing-password",
]);

function mensagemDoErro(quem: Quem, e: unknown): string {
  if (e instanceof ErroPronto) return e.message;
  const codigo = codigoDoErro(e);
  if (quem === "morador" && CODIGOS_CREDENCIAL.has(codigo)) return ERRO_MORADOR;
  return mensagemErroLogin(codigo);
}

function CampoSenha({ id }: { id: string }) {
  const [mostrar, setMostrar] = useState(false);
  return (
    <Campo id={id} rotulo="Senha">
      <div className="relative">
        <input
          id={id}
          name="senha"
          type={mostrar ? "text" : "password"}
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          maxLength={SENHA_MAXIMA}
          className={`${classeEntrada} pr-14`}
        />
        <button
          type="button"
          onClick={() => setMostrar((m) => !m)}
          aria-pressed={mostrar}
          aria-controls={id}
          title={mostrar ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-pine"
        >
          {mostrar ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
          <span className="sr-only">{mostrar ? "Ocultar senha" : "Mostrar senha"}</span>
        </button>
      </div>
    </Campo>
  );
}

export function EntrarSenha({
  condominioId,
  volta,
}: {
  /** Condomínio do login do morador (só para montar o e-mail sintético; não mostra dados). */
  condominioId: string;
  /** Para onde voltar depois de entrar (já conferido no servidor; conferimos de novo). */
  volta: string | null;
}) {
  const router = useRouter();
  const { avisar } = useAvisos();
  // Quem veio por um link da equipe (/sindico, /conselho, /portaria, /admin...) já começa na aba da equipe.
  const caminhoVolta = destinoSeguro(volta)?.split(/[?#]/)[0] ?? "";
  const [quem, setQuem] = useState<Quem>(abaDaEntrada(caminhoVolta));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [usuario, setUsuario] = useState("");

  function trocarAba(nova: Quem) {
    setQuem(nova);
    setErro(null);
  }

  /** Para onde ir com o destino que o servidor mandou. */
  function destinoFinal(doServidor: string): string {
    const seguro = destinoSeguro(volta);
    if (doServidor === "/conta/senha") {
      return seguro ? `/conta/senha?volta=${encodeURIComponent(seguro)}` : "/conta/senha";
    }
    return destinoDepoisDoLogin(doServidor, volta);
  }

  async function entrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    const senha = String(form.get("senha") ?? "");

    let email: string;
    if (quem === "morador") {
      const codigo = normalizarUsuario(form.get("usuario"));
      if (!String(form.get("usuario") ?? "").trim()) return setErro("Digite o seu usuário.");
      if (!senha) return setErro("Digite a sua senha.");
      // Usuário fora do formato: mesma mensagem de "não confere" (não ajuda quem chuta).
      if (!codigo) return setErro(ERRO_MORADOR);
      email = emailDoMorador(codigo, condominioId);
    } else {
      const dados = esquemaLoginEquipe.safeParse({ email: form.get("email"), senha });
      if (!dados.success) return setErro(dados.error.issues[0]?.message ?? "Confira o e-mail e a senha.");
      email = dados.data.email;
    }

    setEnviando(true);
    setErro(null);
    const auth = await firebaseAuth().catch(() => null);
    try {
      if (!auth) throw new ErroPronto("O portal não está configurado para entrar agora. Avise a administração.");
      const credencial = await signInWithEmailAndPassword(auth, email, senha);
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
      router.replace(destinoFinal(corpo.destino));
      router.refresh();
    } catch (e) {
      // Não deixa um login pela metade no navegador.
      if (auth) await signOut(auth).catch(() => undefined);
      setErro(mensagemDoErro(quem, e));
      setEnviando(false);
    }
  }

  const abas: { valor: Quem; rotulo: string; icone: typeof House }[] = [
    { valor: "morador", rotulo: "Sou morador", icone: House },
    { valor: "equipe", rotulo: "Sou da equipe", icone: ShieldCheck },
  ];

  return (
    <section aria-labelledby="titulo-entrar" className="flex flex-col gap-4">
      <h2 id="titulo-entrar" className="sr-only">
        Entrar no portal
      </h2>

      {/* Escolha clara entre morador e equipe (dois botões grandes). */}
      <div role="group" aria-label="Quem vai entrar" className="grid grid-cols-2 gap-1.5 rounded-full bg-canvas p-1.5 shadow-afundado">
        {abas.map(({ valor, rotulo, icone: Icone }) => {
          const ativa = quem === valor;
          return (
            <button
              key={valor}
              type="button"
              onClick={() => trocarAba(valor)}
              aria-pressed={ativa}
              disabled={enviando}
              className={cx(
                "flex min-h-12 items-center justify-center gap-2 rounded-full px-3 font-bold transition-[background-color,box-shadow,color]",
                ativa ? "bg-surface text-pine shadow-card" : "text-ink-2 hover:text-ink",
              )}
            >
              <Icone aria-hidden className="size-5 shrink-0" />
              {rotulo}
            </button>
          );
        })}
      </div>

      <p className="text-[0.95rem] text-ink-2">
        {quem === "morador"
          ? "Use o usuário e a senha que você recebeu da administração."
          : "Síndico, conselho e portaria entram com o e-mail e a senha recebidos."}
      </p>

      {erro ? (
        <Alerta tipo="erro" titulo="Não foi possível entrar">
          {erro}
        </Alerta>
      ) : null}

      {/* `key` recria o formulário ao trocar de aba (limpa os campos e o "mostrar senha"). */}
      <form key={quem} onSubmit={entrar} className="flex flex-col gap-4" noValidate>
        {quem === "morador" ? (
          <Campo id="usuario" rotulo="Usuário">
            <input
              id="usuario"
              name="usuario"
              type="text"
              value={usuario}
              // Maiúsculas automáticas; o espaço é aceito (ex.: "K7M 4PX").
              onChange={(e) => setUsuario(e.target.value.toUpperCase())}
              autoComplete="username"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              required
              maxLength={12}
              placeholder="Ex.: K7M4PX"
              className={cx(classeEntrada, "font-bold uppercase tracking-[0.18em] placeholder:font-normal placeholder:tracking-normal")}
            />
          </Campo>
        ) : (
          <Campo id="email" rotulo="E-mail">
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              maxLength={254}
              className={classeEntrada}
            />
          </Campo>
        )}

        <CampoSenha id={quem === "morador" ? "senha-morador" : "senha-equipe"} />

        <Botao type="submit" largo carregando={enviando} icone={<LogIn aria-hidden className="size-5" />}>
          {enviando ? "Entrando…" : "Entrar"}
        </Botao>
      </form>

      {quem === "morador" ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-sand px-4 py-3 text-ink">
          <p className="text-[0.95rem]">
            <b>Ainda não tem usuário ou esqueceu a senha?</b> Peça ao síndico. Você recebe uma senha provisória e
            escolhe outra no primeiro acesso.
          </p>
        </div>
      ) : (
        <p className="text-[0.9rem] text-muted">Esqueceu a senha? Peça à administração do condomínio uma nova senha provisória.</p>
      )}
    </section>
  );
}
