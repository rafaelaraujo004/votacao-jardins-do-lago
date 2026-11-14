"use client";

/**
 * Formulário "Trocar senha".
 *   1. confirma a senha atual no Firebase (reautenticação);
 *   2. troca a senha no Firebase (isso desconecta todos os aparelhos);
 *   3. entra de novo com a senha nova e avisa o servidor (tira a obrigação de trocar);
 *   4. cria a sessão nova (/api/sessao) e volta para o início.
 */
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type User,
} from "firebase/auth";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { cabecalhosSeguros, firebaseAuth } from "@/lib/firebase/client";
import { codigoDoErro, esquemaTrocaSenha, mensagemErroTroca, SENHA_MINIMA } from "@/lib/senha";
import { concluirTrocaDeSenha } from "@/server/acoes/acesso";
import { destinoDepoisDoLogin } from "@/lib/destino-seguro";
import { useAvisos } from "@/components/ui/avisos";
import { Alerta, Campo, classeEntrada } from "@/components/ui/basicos";
import { Botao, BotaoLink } from "@/components/ui/botao";

type NomeCampo = "atual" | "nova" | "confirmar";

/** Erro com mensagem já pronta para a pessoa ler. */
class ErroPronto extends Error {}

function CampoSenha({
  id,
  rotulo,
  dica,
  erro,
  autoComplete,
}: {
  id: NomeCampo;
  rotulo: string;
  dica?: string;
  erro?: string;
  autoComplete: "current-password" | "new-password";
}) {
  const [mostrar, setMostrar] = useState(false);
  const descricao = [dica ? `${id}-dica` : null, erro ? `${id}-erro` : null].filter(Boolean).join(" ") || undefined;
  return (
    <Campo id={id} rotulo={rotulo} dica={dica} erro={erro}>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={mostrar ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={128}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descricao}
          className={`${classeEntrada} pr-14`}
        />
        <button
          type="button"
          onClick={() => setMostrar((m) => !m)}
          aria-pressed={mostrar}
          aria-controls={id}
          title={mostrar ? "Ocultar" : "Mostrar"}
          className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-pine"
        >
          {mostrar ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
          <span className="sr-only">{mostrar ? `Ocultar ${rotulo.toLowerCase()}` : `Mostrar ${rotulo.toLowerCase()}`}</span>
        </button>
      </div>
    </Campo>
  );
}

export function TrocarSenha({
  email,
  uid,
  rotuloConta,
  provisoria = false,
  volta = null,
  inicio = null,
  entrarHref = "/entrar",
}: {
  /** Início com o ?c= do condomínio (morador); usado no lugar de "/inicio". */
  inicio?: string | null;
  /** Tela de entrada com o ?c= do condomínio. */
  entrarHref?: string;
  email: string;
  uid: string;
  /** "Usuário: K7M 4PX" (morador) ou "Conta: email" (equipe). */
  rotuloConta: string;
  /** true = está com a senha provisória (muda o texto do campo "senha atual"). */
  provisoria?: boolean;
  /** Caminho interno para onde voltar depois (já conferido no servidor). */
  volta?: string | null;
}) {
  const router = useRouter();
  const { avisar } = useAvisos();
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<Partial<Record<NomeCampo, string>>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [precisaEntrarDeNovo, setPrecisaEntrarDeNovo] = useState(false);

  async function trocar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const form = new FormData(evento.currentTarget);
    const dados = esquemaTrocaSenha.safeParse({
      atual: form.get("atual"),
      nova: form.get("nova"),
      confirmar: form.get("confirmar"),
    });
    if (!dados.success) {
      const porCampo: Partial<Record<NomeCampo, string>> = {};
      for (const i of dados.error.issues) {
        const campo = i.path[0] as NomeCampo;
        porCampo[campo] ??= i.message;
      }
      setErros(porCampo);
      setErro(null);
      return;
    }

    setErros({});
    setErro(null);
    setEnviando(true);
    let senhaJaMudou = false;
    try {
      const auth = await firebaseAuth();
      const { atual, nova } = dados.data;

      // 1. Confirma a senha atual.
      let usuario: User;
      if (auth.currentUser?.uid === uid) {
        usuario = auth.currentUser;
        await reauthenticateWithCredential(usuario, EmailAuthProvider.credential(email, atual));
      } else {
        if (auth.currentUser) await signOut(auth);
        usuario = (await signInWithEmailAndPassword(auth, email, atual)).user;
        if (usuario.uid !== uid) throw new ErroPronto("Esta conta não é a que está aberta no portal. Saia e entre de novo.");
      }

      // 2. Troca a senha.
      await updatePassword(usuario, nova);
      senhaJaMudou = true;

      // 3. Entra de novo com a senha nova (token recente) e avisa o servidor.
      const idToken = await (await signInWithEmailAndPassword(auth, email, nova)).user.getIdToken();
      const r = await concluirTrocaDeSenha(idToken);
      if (!r?.ok) throw new ErroPronto(r?.erro ?? "Não foi possível concluir agora.");

      // 4. Sessão nova neste aparelho.
      const resposta = await fetch("/api/sessao", {
        method: "POST",
        headers: await cabecalhosSeguros(),
        body: JSON.stringify({ idToken }),
      });
      const corpo = (await resposta.json().catch(() => null)) as { destino?: string; erro?: string } | null;
      if (!resposta.ok || !corpo?.destino) throw new ErroPronto(corpo?.erro ?? "Não foi possível abrir a sessão.");

      avisar("sucesso", "Senha trocada. Use a nova senha nas próximas vezes.");
      const destino = destinoDepoisDoLogin(corpo.destino, volta);
      router.replace(destino === "/inicio" && inicio ? inicio : destino);
      router.refresh();
    } catch (e) {
      const mensagem = e instanceof ErroPronto ? e.message : mensagemErroTroca(codigoDoErro(e));
      if (senhaJaMudou) {
        // A senha já é a nova, mas a sessão antiga caiu: é preciso entrar de novo.
        setErro(`Sua senha nova já está valendo, mas a sessão não pôde ser aberta: ${mensagem} Entre de novo usando a senha nova.`);
        setPrecisaEntrarDeNovo(true);
      } else {
        setErro(mensagem);
      }
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={trocar} className="flex flex-col gap-4" noValidate>
      {erro ? (
        <Alerta tipo="erro" titulo={precisaEntrarDeNovo ? "Quase lá" : "Não foi possível trocar a senha"}>
          <p>{erro}</p>
          {precisaEntrarDeNovo ? (
            <BotaoLink href={entrarHref} variante="secundario" tamanho="pequeno" className="mt-2">
              Ir para a entrada
            </BotaoLink>
          ) : null}
        </Alerta>
      ) : null}

      <p className="text-ink-2">
        <strong className="text-ink">{rotuloConta}</strong>
      </p>

      <CampoSenha
        id="atual"
        rotulo={provisoria ? "Senha provisória (a que você recebeu)" : "Senha atual"}
        erro={erros.atual}
        autoComplete="current-password"
      />
      <CampoSenha
        id="nova"
        rotulo="Nova senha"
        dica={`Pelo menos ${SENHA_MINIMA} caracteres. Uma frase curta que só você conhece é ótima.`}
        erro={erros.nova}
        autoComplete="new-password"
      />
      <CampoSenha id="confirmar" rotulo="Repita a nova senha" erro={erros.confirmar} autoComplete="new-password" />

      <div>
        <Botao
          type="submit"
          carregando={enviando}
          disabled={precisaEntrarDeNovo}
          icone={<KeyRound aria-hidden className="size-5" />}
        >
          {enviando ? "Salvando…" : provisoria ? "Salvar minha senha" : "Trocar senha"}
        </Botao>
      </div>
    </form>
  );
}
