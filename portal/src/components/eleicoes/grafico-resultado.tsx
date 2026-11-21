"use client";

/**
 * GRÁFICO DO RESULTADO da votação oficial (só existe depois do encerramento).
 *
 * - Chapa: uma barra com TODAS as casas aptas dividida em Sim | Não | Nulos (nulos = casas
 *   aptas que não votaram), a legenda com número e porcentagem de cada parte e, embaixo,
 *   a barra só dos votos VÁLIDOS (Sim + Não) com a linha da "metade mais 1" — é nela que
 *   se decide se a chapa foi eleita.
 * - Candidatos: uma barra por candidato, com troféu e a palavra "eleito" (nunca só cor).
 *
 * Com `animar`, as barras crescem e os números sobem a partir do zero (desligado para quem
 * pede menos movimento no aparelho). Usado no painel do Início e na revelação animada.
 *
 * Também ficam aqui duas peças pequenas usadas pelas outras telas da votação:
 * useMenosMovimento() e <NumeroAnimado>.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CircleMinus, House, Scale, ThumbsDown, ThumbsUp, Trophy, type LucideIcon } from "lucide-react";
import { porcentagemParticipacao, type ResultadoPainel } from "@/lib/eleicoes";
import { cx } from "@/lib/cx";

// ---------- Menos movimento (preferência do aparelho) ----------

const CONSULTA_MENOS_MOVIMENTO = "(prefers-reduced-motion: reduce)";

function assinarMenosMovimento(aviso: () => void) {
  const m = window.matchMedia(CONSULTA_MENOS_MOVIMENTO);
  m.addEventListener("change", aviso);
  return () => m.removeEventListener("change", aviso);
}

/** true quando a pessoa pediu "menos movimento" no aparelho (no servidor: false). */
export function useMenosMovimento(): boolean {
  return useSyncExternalStore(
    assinarMenosMovimento,
    () => window.matchMedia(CONSULTA_MENOS_MOVIMENTO).matches,
    () => false,
  );
}

// ---------- Número que sobe ----------

const numeroBR = new Intl.NumberFormat("pt-BR");

/**
 * Número que "conta" até o valor novo quando ele muda (ex.: mais uma casa votou).
 * Com `desde`, começa contando desse valor ao aparecer (ex.: 0 na revelação).
 * Com menos movimento, mostra o valor final direto.
 */
export function NumeroAnimado({
  valor,
  desde,
  duracaoMs = 700,
  className,
}: {
  valor: number;
  desde?: number;
  duracaoMs?: number;
  className?: string;
}) {
  const menosMovimento = useMenosMovimento();
  const [mostrado, setMostrado] = useState(desde ?? valor);
  // Valor que está na tela agora (ponto de partida da próxima contagem).
  const naTela = useRef(desde ?? valor);

  useEffect(() => {
    const inicio = naTela.current;
    if (inicio === valor) return;
    let quadro = 0;
    if (menosMovimento) {
      quadro = requestAnimationFrame(() => {
        naTela.current = valor;
        setMostrado(valor);
      });
      return () => cancelAnimationFrame(quadro);
    }
    let comecou = 0;
    const passo = (t: number) => {
      if (!comecou) comecou = t;
      const p = Math.min(1, (t - comecou) / duracaoMs);
      const suave = 1 - Math.pow(1 - p, 3);
      const v = Math.round(inicio + (valor - inicio) * suave);
      naTela.current = v;
      setMostrado(v);
      if (p < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [valor, menosMovimento, duracaoMs]);

  return <span className={cx("tabular-nums", className)}>{numeroBR.format(mostrado)}</span>;
}

// ---------- Gráfico ----------

type Parte = {
  chave: "sim" | "nao" | "nulos";
  rotulo: string;
  valor: number;
  barra: string;
  textoBarra: string;
  icone: LucideIcon;
  corIcone: string;
};

const pct = (n: number, total: number) => (total > 0 ? Math.round((n * 100) / total) : 0);

/** Barras começam vazias e crescem no quadro seguinte (com `animar`). */
function useBarrasCheias(animar: boolean): boolean {
  const [cheias, setCheias] = useState(!animar);
  useEffect(() => {
    if (cheias) return;
    // Dois quadros: garante que a largura zero foi desenhada antes de crescer.
    let segundo = 0;
    const primeiro = requestAnimationFrame(() => {
      segundo = requestAnimationFrame(() => setCheias(true));
    });
    return () => {
      cancelAnimationFrame(primeiro);
      cancelAnimationFrame(segundo);
    };
  }, [cheias]);
  return cheias;
}

const TRANSICAO_BARRA = "transition-[width] duration-[900ms] ease-out motion-reduce:transition-none";

export function GraficoResultado({
  resultado,
  casasAptas,
  animar = false,
  className,
}: {
  resultado: ResultadoPainel;
  casasAptas: number;
  animar?: boolean;
  className?: string;
}) {
  const cheias = useBarrasCheias(animar);
  return resultado.modo === "chapa" ? (
    <GraficoChapa r={resultado} casasAptas={casasAptas} cheias={cheias} animar={animar} className={className} />
  ) : (
    <GraficoCandidatos r={resultado} cheias={cheias} animar={animar} className={className} />
  );
}

function GraficoChapa({
  r,
  casasAptas,
  cheias,
  animar,
  className,
}: {
  r: Extract<ResultadoPainel, { modo: "chapa" }>;
  casasAptas: number;
  cheias: boolean;
  animar: boolean;
  className?: string;
}) {
  const nulos = Math.max(0, r.nulos || 0);
  // Base = todas as casas aptas (Sim + Não + Nulos). Se a comissão não informou as aptas, as que votaram.
  const base = Math.max(casasAptas, r.sim + r.nao + nulos);
  const partes: Parte[] = [
    { chave: "sim", rotulo: "Sim", valor: r.sim, barra: "bg-pine", textoBarra: "text-on-pine", icone: ThumbsUp, corIcone: "text-pine" },
    { chave: "nao", rotulo: "Não", valor: r.nao, barra: "bg-danger", textoBarra: "text-on-danger", icone: ThumbsDown, corIcone: "text-danger" },
    { chave: "nulos", rotulo: "Nulos", valor: nulos, barra: "bg-line-strong", textoBarra: "text-ink", icone: CircleMinus, corIcone: "text-muted" },
  ];
  const resumo = partes.map((p) => `${p.rotulo}: ${p.valor} (${pct(p.valor, base)}%)`).join("; ");
  const linhaMinimo = r.validos > 0 ? Math.min(100, (r.minimo * 100) / r.validos) : 0;

  return (
    <figure className={cx("flex min-w-0 flex-col gap-3", className)}>
      <figcaption className="sr-only">
        Resultado entre as {base} casas aptas. {resumo}. Nulos são casas que não votaram.
      </figcaption>

      <div aria-hidden className="flex items-baseline justify-between gap-2 text-[0.84rem] text-muted">
        <span>Todas as casas aptas</span>
        <span className="tabular-nums">
          {base} {base === 1 ? "casa" : "casas"}
        </span>
      </div>
      {/* Barra empilhada: cada parte com a porcentagem escrita dentro quando cabe. */}
      <div aria-hidden className="afundado flex h-7 overflow-hidden rounded-full">
        {partes.map((p) => {
          const largura = pct(p.valor, base);
          if (p.valor <= 0) return null;
          return (
            <div
              key={p.chave}
              className={cx("flex h-full items-center justify-center overflow-hidden", p.barra, TRANSICAO_BARRA)}
              style={{ width: cheias ? `${(p.valor * 100) / (base || 1)}%` : "0%" }}
            >
              {largura >= 14 ? (
                <span className={cx("whitespace-nowrap px-1 text-[0.74rem] font-extrabold", p.textoBarra)}>{largura}%</span>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Legenda: ícone + nome + número + porcentagem (nunca só a cor). */}
      <ul aria-hidden className="grid grid-cols-3 gap-2">
        {partes.map((p) => (
          <li key={p.chave} className="flex min-w-0 flex-col gap-0.5 rounded-2xl bg-surface-item px-2.5 py-2">
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.84rem] font-bold text-ink-2">
              <i className={cx("size-2.5 shrink-0 rounded-sm", p.barra)} />
              <p.icone className={cx("size-4 shrink-0", p.corIcone)} />
              <span className="min-w-0 break-words">{p.rotulo}</span>
            </span>
            <b className="font-display text-[1.45rem] leading-none text-ink">
              <NumeroAnimado valor={p.valor} desde={animar ? 0 : undefined} duracaoMs={900} />
            </b>
            <span className="text-[0.76rem] leading-tight text-muted">{pct(p.valor, base)}% das casas</span>
          </li>
        ))}
      </ul>

      {/* Só os votos válidos: a linha marca a metade mais 1 (onde o Sim precisa chegar). */}
      {r.validos > 0 ? (
        <div className="mt-1 flex flex-col gap-1.5">
          <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-[0.86rem] font-bold text-ink-2">
            <span>Só os votos válidos (Sim + Não)</span>
            <span className="font-normal tabular-nums text-muted">
              Sim {r.porcentagemSim}% · Não {r.porcentagemNao}%
            </span>
          </p>
          <div aria-hidden className="relative py-1">
            <div className="afundado flex h-3.5 overflow-hidden rounded-full">
              <div className={cx("h-full bg-pine", TRANSICAO_BARRA)} style={{ width: cheias ? `${(r.sim * 100) / r.validos}%` : "0%" }} />
              <div className={cx("h-full bg-danger", TRANSICAO_BARRA)} style={{ width: cheias ? `${(r.nao * 100) / r.validos}%` : "0%" }} />
            </div>
            <span
              className="absolute inset-y-0 w-[3px] -translate-x-1/2 rounded-full bg-ink"
              style={{ left: `${linhaMinimo}%` }}
            />
          </div>
          <p className="text-[0.8rem] text-muted">
            O risco em pé marca a metade mais 1: {r.minimo} {r.minimo === 1 ? "voto" : "votos"} Sim.
          </p>
        </div>
      ) : null}
    </figure>
  );
}

function GraficoCandidatos({
  r,
  cheias,
  animar,
  className,
}: {
  r: Extract<ResultadoPainel, { modo: "candidatos" }>;
  cheias: boolean;
  animar: boolean;
  className?: string;
}) {
  const base = Math.max(1, r.cedulas);
  const nulos = Math.max(0, r.nulos || 0);
  return (
    <figure className={cx("flex min-w-0 flex-col gap-3", className)}>
      <figcaption className="sr-only">Votos de cada candidato, do mais votado para o menos votado.</figcaption>
      <ul className="flex flex-col gap-3">
        {r.ranking.map((l) => (
          <li key={l.numero} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className={cx("min-w-0 break-words", l.eleito ? "font-bold text-destaque" : "text-ink")}>
                {l.eleito ? <Trophy aria-hidden className="mr-1.5 inline size-4 align-[-2px] text-texto-laranja" /> : null}
                {l.numero} · {l.nome}
                {l.eleito ? (
                  <span className="ml-1.5 whitespace-nowrap rounded-full bg-ok-soft px-2 py-px text-[0.72rem] font-bold text-pine">
                    eleito
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-[0.92rem] text-ink-2">
                <b className="text-ink">
                  <NumeroAnimado valor={l.votos} desde={animar ? 0 : undefined} duracaoMs={900} />
                </b>{" "}
                {l.votos === 1 ? "voto" : "votos"}
              </span>
            </div>
            <div aria-hidden className="afundado h-3.5 overflow-hidden rounded-full">
              <div
                className={cx("h-full rounded-full", l.eleito ? "bg-pine" : "bg-lake", TRANSICAO_BARRA)}
                style={{ width: cheias ? `${Math.max((l.votos * 100) / base, l.votos ? 2 : 0)}%` : "0%" }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[0.9rem] text-ink-2">
        <b className="text-ink">{r.cedulas}</b> {r.cedulas === 1 ? "cédula" : "cédulas"} ·{" "}
        <b className="text-ink">{r.brancos}</b> em branco · <b className="text-ink">{nulos}</b>{" "}
        {nulos === 1 ? "nulo" : "nulos"}
      </p>
    </figure>
  );
}

// ---------- A regra, em palavras ----------

/**
 * Explica o resultado em linguagem simples: quantos votos Sim eram necessários
 * (metade mais 1 dos válidos), o que são os nulos e a participação.
 */
export function RegraDoResultado({
  resultado,
  casasAptas,
  votaram,
  className,
}: {
  resultado: ResultadoPainel;
  casasAptas: number;
  votaram: number;
  className?: string;
}) {
  const participacao = porcentagemParticipacao(votaram, casasAptas);
  return (
    <div className={cx("flex flex-col gap-2 text-[0.95rem] text-ink-2", className)}>
      {resultado.modo === "chapa" ? (
        <p className="flex items-start gap-2">
          <Scale aria-hidden className="mt-0.5 size-5 shrink-0 text-destaque" />
          {resultado.validos > 0 ? (
            <span>
              Precisava de <b className="text-ink">{resultado.minimo}</b> {resultado.minimo === 1 ? "voto" : "votos"} Sim
              (metade mais 1 dos <b className="text-ink">{resultado.validos}</b>{" "}
              {resultado.validos === 1 ? "voto válido" : "votos válidos"}) e teve <b className="text-ink">{resultado.sim}</b>.
            </span>
          ) : (
            <span>Nenhum voto válido: sem votos, a chapa não é eleita.</span>
          )}
        </p>
      ) : null}
      <p className="flex items-start gap-2">
        <CircleMinus aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
        <span>Nulos = casas que não votaram; não entram na conta.</span>
      </p>
      <p className="flex items-start gap-2">
        <House aria-hidden className="mt-0.5 size-5 shrink-0 text-destaque" />
        {casasAptas > 0 ? (
          <span>
            <b className="text-ink">{votaram}</b> de <b className="text-ink">{casasAptas}</b> casas votaram ({participacao}%).
          </span>
        ) : (
          <span>
            <b className="text-ink">{votaram}</b> {votaram === 1 ? "casa votou" : "casas votaram"}.
          </span>
        )}
      </p>
    </div>
  );
}
