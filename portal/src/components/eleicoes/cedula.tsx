"use client";

/**
 * CÉDULA da votação oficial: escolher → revisar (janela) → confirmar.
 * Modo "chapa" (padrão): mostra os integrantes e UMA pergunta: Sim ou Não para a chapa.
 * Modo "candidatos": 1 candidato (botões de opção) ou até N (caixas), e o voto em branco.
 * O voto NÃO pode ser mudado: a janela avisa antes de enviar.
 * A escolha não é guardada no navegador (nem no endereço, nem no armazenamento).
 * O servidor confere tudo de novo (votação aberta, casa liberada e que ainda não votou, escolha válida).
 */
import { useActionState, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleSlash,
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

type Props = {
  eleicaoId: string;
  /** Ação que grava o voto. Padrão: voto do morador logado. O link de voto passa votarComCodigo. */
  acao?: typeof votarEleicao;
  /** Campos escondidos extras (ex.: o código do link). */
  campos?: Record<string, string>;
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

  // Depois de enviar: fecha a janela; se deu certo, limpa a escolha da memória e atualiza a página.
  const [estado, enviar] = useActionState(
    async (
      anterior: Awaited<ReturnType<typeof votarEleicao>>,
      dados: FormData,
    ) => {
      const r = await (props.acao ?? votarEleicao)(anterior, dados);
      janela.current?.close();
      if (r?.ok) {
        setVoto(null);
        setMarcados([]);
        avisar("sucesso", r.mensagem);
        router.refresh();
      }
      return r;
    },
    null,
  );

  const chapa = props.modo === "chapa";
  const valores = chapa ? (voto ? [voto] : []) : marcados;
  const completo = chapa
    ? voto !== null
    : marcados.includes(BRANCO) ||
      (marcados.length >= 1 && marcados.length <= props.escolhasPorCasa);

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {estado && !estado.ok ? (
        <Alerta tipo="erro" titulo="O voto não foi registrado">
          {estado.erro}
        </Alerta>
      ) : null}
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
  voto,
  setVoto,
}: {
  candidatos: Candidato[];
  voto: VotoChapa | null;
  setVoto: (v: VotoChapa) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-line bg-surface-item p-3.5">
        <p className="mb-2 text-[0.82rem] font-bold uppercase tracking-wide text-muted">
          Integrantes da chapa
        </p>
        <ul className="flex flex-col gap-2">
          {candidatos.map((c) => (
            <li key={c.id}>
              <p className="break-words font-bold leading-tight">{c.nome}</p>
              <FuncaoCandidato funcao={c.funcao} casa={c.casa} />
              {c.apresentacao ? (
                <p className="mt-0.5 break-words text-[0.88rem] text-ink-2">
                  {c.apresentacao}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
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
