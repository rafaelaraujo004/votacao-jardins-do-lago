"use client";

/**
 * CÉDULA da votação oficial: escolher → revisar (janela) → confirmar.
 * Modo "chapa" (padrão): mostra os integrantes e UMA pergunta: Sim ou Não para a chapa.
 * Modo "candidatos": 1 candidato (botões de opção) ou até N (caixas), e o voto em branco.
 * O voto NÃO pode ser mudado: a janela avisa antes de enviar.
 * A escolha não é guardada no navegador (nem no endereço, nem no armazenamento).
 * O servidor confere tudo de novo (votação aberta, casa liberada e que ainda não votou, escolha válida).
 *
 * O MORADOR NUNCA FICA NA DÚVIDA se o voto chegou:
 * - Queda de internet, site atualizado ou servidor demorando (o envio falha sem resposta):
 *   aviso fixo perto do botão — "Não deu para confirmar se o voto chegou" — com o botão
 *   "Conferir meu voto", que atualiza a página: se o voto chegou, ela mostra "Voto já realizado".
 *   Nunca a tela genérica de erro.
 * - Casa que já votou (ex.: o primeiro envio chegou mas a resposta se perdeu): mostra como
 *   INFORMAÇÃO ("O voto da sua casa já está registrado"), não como erro.
 * - Recusa de verdade (votação encerrada, casa bloqueada, senha vencida...): "O voto não foi
 *   registrado", com o motivo. Em todos os casos a página se atualiza e a tela leva a pessoa
 *   até o aviso (rola e põe o foco nele).
 */
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import {
  CircleSlash,
  RefreshCw,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Vote,
} from "lucide-react";
import { Alerta } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/formulario";
import { useAvisos } from "@/components/ui/avisos";
import { votarEleicao } from "@/server/acoes/eleicoes";
import {
  BRANCO,
  textoEscolhas,
  type Candidato,
  type ModoEleicao,
  type VotoChapa,
} from "@/lib/eleicoes";
import { cx } from "@/lib/cx";
import { FuncaoCandidato } from "./pecas";
import { ArvoreChapa } from "./arvore-chapa";

const classeOpcao = cx(
  "flex min-h-16 cursor-pointer items-start gap-3 rounded-2xl border-2 border-borda-luz bg-surface px-4 py-3 shadow-relevo",
  "has-checked:border-pine has-checked:bg-ok-soft has-checked:shadow-afundado",
  "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-lake",
  "has-disabled:cursor-not-allowed has-disabled:opacity-55",
);

const classeSimNao = (voto: VotoChapa) =>
  cx(
    "flex min-h-16 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-borda-luz bg-surface px-3 text-[1.05rem] font-bold shadow-relevo",
    "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-lake",
    voto === "sim"
      ? "has-checked:border-pine has-checked:bg-ok-soft has-checked:text-pine has-checked:shadow-afundado"
      : "has-checked:border-danger has-checked:bg-danger-soft has-checked:text-danger has-checked:shadow-afundado",
  );

/** O que aconteceu com o último envio da cédula. */
type EstadoCedula =
  | { tipo: "ok"; vez: number }
  /** O servidor recusou de verdade (motivo em `erro`). */
  | { tipo: "recusado"; erro: string; vez: number }
  /** A casa já tinha votado (pode ser este mesmo voto, se a resposta anterior se perdeu). */
  | { tipo: "ja-votou"; vez: number }
  /** O envio falhou sem resposta: não dá para saber se o voto chegou. */
  | { tipo: "incerto"; vez: number }
  | null;

/** Resposta do servidor dizendo que a casa já votou (portal: "já votou"; link: "já foi realizado"). */
const JA_VOTOU = /já foi realizado|já votou/i;
/** Resposta genérica de erro inesperado (executar, em server/acoes/resultado.ts). */
const FALHA_INESPERADA = /não foi possível salvar agora/i;

type Props = {
  eleicaoId: string;
  /** Ação que grava o voto. Padrão: voto do morador logado. O link de voto passa votarComCodigo. */
  acao?: typeof votarEleicao;
  /** Campos escondidos extras (ex.: o código do link). */
  campos?: Record<string, string>;
  /** Fotos dos integrantes (id → imagem), para a árvore da chapa. */
  fotos?: Record<string, string>;
  modo: ModoEleicao;
  candidatos: Candidato[];
  escolhasPorCasa: number;
  permiteBranco: boolean;
};

export function Cedula(props: Props) {
  const router = useRouter();
  const janela = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  const { avisar } = useAvisos();
  // Chapa: Sim ou Não. Candidatos: lista dos marcados (ou "branco").
  const [voto, setVoto] = useState<VotoChapa | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);
  const aviso = useRef<HTMLDivElement>(null);
  const [conferindo, iniciarConferencia] = useTransition();

  // Depois de enviar: fecha a janela e atualiza a página em TODOS os casos (ela mostra
  // "Voto já realizado" se o voto chegou). Se deu certo, limpa a escolha da memória.
  const [estado, enviar] = useActionState(
    async (_anterior: EstadoCedula, dados: FormData): Promise<EstadoCedula> => {
      const vez = Date.now();
      let r: Awaited<ReturnType<typeof votarEleicao>>;
      try {
        r = await (props.acao ?? votarEleicao)(null, dados);
      } catch (erro) {
        // Redirecionamentos do Next (ex.: sessão do portal terminou) seguem o caminho normal.
        unstable_rethrow(erro);
        r = null;
      }
      janela.current?.close();
      // Sem resposta (internet caiu, site atualizado, servidor demorou): não dá para saber.
      // Não atualiza sozinho (sem internet, a atualização também falharia): o aviso tem o botão.
      if (!r) return { tipo: "incerto", vez };
      router.refresh();
      // Falha inesperada no servidor (resposta genérica): também não dá para garantir nada.
      if (!r.ok && FALHA_INESPERADA.test(r.erro)) return { tipo: "incerto", vez };
      if (r.ok) {
        setVoto(null);
        setMarcados([]);
        avisar("sucesso", r.mensagem);
        return { tipo: "ok", vez };
      }
      if (JA_VOTOU.test(r.erro)) {
        avisar("info", "O voto da sua casa já está registrado.");
        return { tipo: "ja-votou", vez };
      }
      avisar("erro", r.erro);
      return { tipo: "recusado", erro: r.erro, vez };
    },
    null,
  );

  // Aviso novo: leva a pessoa até ele (no celular ele pode ficar fora da tela).
  useEffect(() => {
    if (!estado || estado.tipo === "ok") return;
    aviso.current?.focus({ preventScroll: true });
    aviso.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [estado]);

  const chapa = props.modo === "chapa";
  const valores = chapa ? (voto ? [voto] : []) : marcados;
  const completo = chapa
    ? voto !== null
    : marcados.includes(BRANCO) ||
      (marcados.length >= 1 && marcados.length <= props.escolhasPorCasa);

  return (
    <form action={enviar} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={props.eleicaoId} />
      {Object.entries(props.campos ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {valores.map((v) => (
        <input key={v} type="hidden" name="escolha" value={v} />
      ))}

      {chapa ? (
        <CedulaChapa
          candidatos={props.candidatos}
          fotos={props.fotos ?? {}}
          voto={voto}
          setVoto={setVoto}
        />
      ) : (
        <CedulaCandidatos
          {...props}
          marcados={marcados}
          setMarcados={setMarcados}
        />
      )}

      <p className="text-[0.9rem] text-muted">
        Vale <b>um voto por casa</b>. Depois de confirmado, o voto{" "}
        <b>não pode ser mudado</b>.
      </p>

      {/* Aviso do último envio, logo acima do botão (onde a pessoa estava olhando). */}
      {estado && estado.tipo !== "ok" ? (
        <div
          ref={aviso}
          tabIndex={-1}
          className="scroll-mt-24 rounded-2xl outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-lake"
        >
          {estado.tipo === "incerto" ? (
            <Alerta tipo="aviso" titulo="Não deu para confirmar se o voto chegou">
              <div className="flex flex-col gap-3">
                <p>Confira a internet e toque em Conferir meu voto.</p>
                <Botao
                  largo
                  variante="secundario"
                  carregando={conferindo}
                  icone={<RefreshCw aria-hidden className="size-5" />}
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.onLine === false) {
                      avisar("erro", "Sem internet agora. Quando a internet voltar, toque de novo em Conferir meu voto.");
                      return;
                    }
                    iniciarConferencia(() => router.refresh());
                  }}
                >
                  {conferindo ? "Conferindo…" : "Conferir meu voto"}
                </Botao>
                <p className="text-[0.9rem]">
                  Se o voto chegou, a página mostra <b>Voto já realizado</b>. Se
                  a cédula continuar aqui, pode votar de novo: a casa nunca vota
                  duas vezes, e o portal avisa se o voto já tinha chegado.
                </p>
              </div>
            </Alerta>
          ) : estado.tipo === "ja-votou" ? (
            <Alerta tipo="info" titulo="O voto da sua casa já está registrado.">
              Cada casa vota uma vez. A página vai mostrar a confirmação.
            </Alerta>
          ) : (
            <Alerta tipo="erro" titulo="O voto não foi registrado">
              {estado.erro}
            </Alerta>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Botao
          largo
          disabled={!completo}
          icone={<Vote aria-hidden className="size-5" />}
          onClick={() => janela.current?.showModal()}
        >
          Revisar meu voto
        </Botao>
        {chapa && !completo ? (
          <p className="text-[0.88rem] text-muted">
            Escolha Sim ou Não para continuar.
          </p>
        ) : null}
      </div>

      <dialog
        ref={janela}
        aria-labelledby={idTitulo}
        className="m-auto w-[min(92vw,28rem)] rounded-[26px] border border-borda-luz bg-surface p-0 text-ink shadow-float backdrop:bg-black/50"
      >
        <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-6">
          <h2 id={idTitulo} className="text-xl font-bold">
            Confirmar o voto da sua casa?
          </h2>
          <div className="rounded-2xl bg-surface-item p-4">
            <p className="text-[0.82rem] font-bold uppercase tracking-wide text-muted">
              Seu voto
            </p>
            {chapa ? (
              <p
                className={cx(
                  "mt-1 text-[1.2rem] font-bold",
                  voto === "sim" ? "text-pine" : "text-danger",
                )}
              >
                {voto === "sim"
                  ? "SIM — aprovo a chapa"
                  : "NÃO — não aprovo a chapa"}
              </p>
            ) : marcados.includes(BRANCO) ? (
              <p className="mt-1 text-[1.1rem] font-bold">Em branco</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {props.candidatos
                  .filter((c) => marcados.includes(c.id))
                  .map((c) => (
                    <li key={c.id} className="text-[1.1rem] font-bold">
                      {c.numero} · {c.nome}
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <p className="flex items-start gap-2 text-[0.92rem] text-ink-2">
            <ShieldCheck
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-pine"
            />
            Este é o voto da casa inteira, é secreto e não pode ser mudado
            depois.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Botao
              variante="secundario"
              onClick={() => janela.current?.close()}
            >
              Voltar e mudar
            </Botao>
            <BotaoEnviar textoEnviando="Registrando…">
              Confirmar voto
            </BotaoEnviar>
          </div>
        </div>
      </dialog>
    </form>
  );
}

function CedulaChapa({
  candidatos,
  fotos,
  voto,
  setVoto,
}: {
  candidatos: Candidato[];
  fotos: Record<string, string>;
  voto: VotoChapa | null;
  setVoto: (v: VotoChapa) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-line bg-surface-item p-3.5">
        <p className="mb-3 text-center text-[0.82rem] font-bold uppercase tracking-wide text-muted">
          Integrantes da chapa
        </p>
        <ArvoreChapa candidatos={candidatos} fotos={fotos} />
      </div>
      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1.5 text-[1.05rem] font-bold">
          Você aprova esta chapa?
        </legend>
        <div className="flex gap-2.5">
          {(["sim", "nao"] as const).map((v) => (
            <label key={v} className={classeSimNao(v)}>
              <input
                type="radio"
                name="resposta-chapa"
                checked={voto === v}
                onChange={() => setVoto(v)}
                className="sr-only"
              />
              {v === "sim" ? (
                <ThumbsUp aria-hidden className="size-6" />
              ) : (
                <ThumbsDown aria-hidden className="size-6" />
              )}
              {v === "sim" ? "Sim" : "Não"}
            </label>
          ))}
        </div>
        <p className="text-[0.88rem] text-muted">
          Votando Sim, todos os integrantes são eleitos juntos.
        </p>
      </fieldset>
    </div>
  );
}

function CedulaCandidatos({
  candidatos,
  escolhasPorCasa,
  permiteBranco,
  marcados,
  setMarcados,
}: Props & {
  marcados: string[];
  setMarcados: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const varios = escolhasPorCasa > 1;
  const branco = marcados.includes(BRANCO);
  const escolhidos = candidatos.filter((c) => marcados.includes(c.id));

  function alternar(id: string) {
    setMarcados((atual) => {
      if (id === BRANCO) return atual.includes(BRANCO) ? [] : [BRANCO];
      const semBranco = atual.filter((x) => x !== BRANCO);
      if (!varios) return [id];
      if (semBranco.includes(id)) return semBranco.filter((x) => x !== id);
      return semBranco.length >= escolhasPorCasa
        ? semBranco
        : [...semBranco, id];
    });
  }

  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-1.5 font-bold">
        {textoEscolhas(escolhasPorCasa)}
        {varios ? (
          <span className="font-normal text-muted">
            {" "}
            ({escolhidos.length} de {escolhasPorCasa})
          </span>
        ) : null}
      </legend>
      {candidatos.map((c) => {
        const marcado = marcados.includes(c.id);
        const cheio =
          varios && !marcado && escolhidos.length >= escolhasPorCasa;
        return (
          <label key={c.id} className={classeOpcao}>
            <input
              type={varios ? "checkbox" : "radio"}
              name="opcao-visual"
              checked={marcado}
              disabled={cheio}
              onChange={() => alternar(c.id)}
              className="mt-2.5 size-5 shrink-0 accent-pine"
            />
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-item font-display text-[1.05rem] font-extrabold text-destaque shadow-[inset_0_0_0_1px_var(--line)]"
            >
              {c.numero}
            </span>
            <span className="flex min-w-0 flex-col">
              <b className="break-words leading-tight">{c.nome}</b>
              <FuncaoCandidato funcao={c.funcao} casa={c.casa} />
              {c.apresentacao ? (
                <span className="mt-1 break-words text-[0.9rem] text-ink-2">
                  {c.apresentacao}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
      {permiteBranco ? (
        <label className={classeOpcao}>
          <input
            type={varios ? "checkbox" : "radio"}
            name="opcao-visual"
            checked={branco}
            onChange={() => alternar(BRANCO)}
            className="mt-2.5 size-5 shrink-0 accent-pine"
          />
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-item text-muted shadow-[inset_0_0_0_1px_var(--line)]"
          >
            <CircleSlash className="size-5" />
          </span>
          <span className="flex flex-col">
            <b>Votar em branco</b>
            <span className="text-[0.88rem] text-muted">
              Sua casa participa, mas não escolhe ninguém.
            </span>
          </span>
        </label>
      ) : null}
    </fieldset>
  );
}
