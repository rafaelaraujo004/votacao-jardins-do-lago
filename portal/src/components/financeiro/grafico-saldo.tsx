"use client";

/**
 * Gráfico de linhas do financeiro, interativo.
 *
 * - Tocar ou clicar num mês (ou arrastar o dedo, ou usar as setas do teclado)
 *   mostra os valores daquele mês e quanto mudaram em relação ao mês anterior.
 *   No mouse, só passar por cima já mostra; o clique fixa.
 * - Embaixo, filtros ligam e desligam as linhas: saldo (sempre disponível),
 *   receitas e despesas. Cada linha tem cor E traço próprios (cheio, tracejado,
 *   pontilhado), para ninguém depender só da cor.
 * - Quem usa o gráfico pode controlar o mês escolhido (`mesEscolhido` +
 *   `onEscolherMes`), ex.: o painel troca os cartões de cima junto.
 *
 * SVG feito à mão (sem biblioteca) e cores dos tokens: funciona no modo claro e no escuro.
 */
import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Check } from "lucide-react";
import { formatarMoeda } from "@/lib/formato";
import { nomeDoMes, nomeDoMesTitulo } from "@/lib/financeiro";
import {
  alternarSerie,
  indiceMaisProximo,
  NOME_DA_SERIE,
  seriesDisponiveis,
  valorDaSerie,
  variacaoDoMes,
  type PontoSaldo,
  type Serie,
} from "@/lib/grafico-saldo";

export type { PontoSaldo };

const CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-11" → "nov" */
function mesCurto(mes: string) {
  return CURTOS[Number(mes.slice(5, 7)) - 1] ?? mes;
}

/** Valor curto para o eixo: 1234500 centavos → "12,3 mil". */
function valorCurto(centavos: number) {
  const reais = centavos / 100;
  const abs = Math.abs(reais);
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (abs >= 1_000_000) return `${fmt(reais / 1_000_000)} mi`;
  if (abs >= 1_000) return `${fmt(reais / 1_000)} mil`;
  return fmt(reais);
}

/** Passo "redondo" para a grade (1, 2, 2,5 ou 5 vezes uma potência de 10). */
function passoRedondo(bruto: number) {
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const f = bruto / pot;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * pot;
}

/** Visual de cada linha: cor (token) e traço. */
const ESTILO: Record<Serie, { traco: string; ponto: string; largura: number; tracejado?: string }> = {
  saldo: { traco: "stroke-pine", ponto: "fill-pine", largura: 3 },
  receitas: { traco: "stroke-lake", ponto: "fill-lake", largura: 2.5, tracejado: "9 6" },
  despesas: { traco: "stroke-plum", ponto: "fill-plum", largura: 2.5, tracejado: "1 6" },
};

/** Amostra pequena da linha (filtros e leitura). */
function Amostra({ serie, className = "w-[26px]" }: { serie: Serie; className?: string }) {
  const e = ESTILO[serie];
  return (
    <svg viewBox="0 0 26 8" aria-hidden className={`h-2 shrink-0 ${className}`}>
      <line x1={3} y1={4} x2={23} y2={4} className={e.traco} strokeWidth={e.largura} strokeDasharray={e.tracejado} strokeLinecap="round" />
    </svg>
  );
}

/** "Saldo: R$ 3.492,28, R$ 407,57 a mais que em setembro" — para leitores de tela. */
function falaDoMes(pontos: PontoSaldo[], i: number, series: Serie[]) {
  const partes = series.flatMap((s) => {
    const v = valorDaSerie(pontos[i], s);
    if (v === undefined) return [];
    const variacao = variacaoDoMes(pontos, i, s);
    return [`${NOME_DA_SERIE[s]} ${formatarMoeda(v)}${variacao ? `, ${variacao.texto}` : ""}`];
  });
  return `${nomeDoMes(pontos[i].mes)}: ${partes.join("; ")}`;
}

type Medidas = { id: string; largura: number; altura: number; fonte: number; esquerda: number };

/** Move o grupo com transição suave (desligada para quem pediu menos movimento). */
const deslizar = "motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out";

/** Desenha uma versão do gráfico. Usamos duas (celular e tela larga) para o texto não ficar gigante nem minúsculo. */
function Desenho({
  pontos,
  series,
  m,
  idLista,
  className,
  ativo,
  onEscolher,
  onPrevia,
}: {
  pontos: PontoSaldo[];
  /** Linhas ligadas, na ordem de SERIES. */
  series: Serie[];
  m: Medidas;
  /** id do texto (escondido) com todos os meses e valores, para leitores de tela. */
  idLista: string;
  className: string;
  /** Mês mostrado agora (o escolhido ou, no mouse, o que está sob o ponteiro). */
  ativo: number;
  onEscolher: (i: number) => void;
  onPrevia: (i: number | null) => void;
}) {
  const L = m.esquerda;
  const R = m.largura - 22;
  const T = 36; // espaço no alto para a etiqueta do valor
  const B = m.altura - 30; // espaço embaixo para os nomes dos meses

  // Escala vertical com folga e números redondos na grade, cobrindo todas as linhas ligadas.
  const valores = series.flatMap((s) => pontos.map((p) => valorDaSerie(p, s)).filter((v): v is number => v !== undefined));
  let menor = Math.min(...valores);
  let maior = Math.max(...valores);
  const folga = Math.max((maior - menor) * 0.15, Math.abs(maior) * 0.05, 10_000);
  menor -= folga;
  maior += folga;
  const passo = passoRedondo((maior - menor) / 3);
  const base = Math.floor(menor / passo) * passo;
  const topo = Math.ceil(maior / passo) * passo;
  const linhasGrade: number[] = [];
  for (let v = base; v <= topo + passo / 2; v += passo) linhasGrade.push(v);

  const X = (i: number) => L + ((R - L) * i) / Math.max(pontos.length - 1, 1);
  const Y = (v: number) => B - ((B - T) * (v - base)) / (topo - base || 1);

  /** Pontos da linha (só os meses que têm o valor). */
  const coordenadas = (s: Serie) =>
    pontos.flatMap((p, i) => {
      const v = valorDaSerie(p, s);
      return v === undefined ? [] : [{ i, x: X(i), y: Y(v) }];
    });

  /** Linha suave (curvas entre os pontos). */
  function caminho(c: { x: number; y: number }[]) {
    let d = `M${c[0].x.toFixed(1)} ${c[0].y.toFixed(1)}`;
    for (let k = 1; k < c.length; k++) {
      const meio = (c[k - 1].x + c[k].x) / 2;
      d += ` C${meio.toFixed(1)} ${c[k - 1].y.toFixed(1)} ${meio.toFixed(1)} ${c[k].y.toFixed(1)} ${c[k].x.toFixed(1)} ${c[k].y.toFixed(1)}`;
    }
    return d;
  }

  const linhas = series
    .map((s) => ({ s, c: coordenadas(s) }))
    .filter((l) => l.c.length >= 2)
    .map((l) => ({ ...l, d: caminho(l.c) }));
  // Saldo por cima das outras linhas.
  const emOrdemDeDesenho = [...linhas].reverse();
  const saldo = linhas.find((l) => l.s === "saldo");
  const area = saldo ? `${saldo.d} L${saldo.c.at(-1)!.x.toFixed(1)} ${B} L${saldo.c[0].x.toFixed(1)} ${B} Z` : null;

  // Marcadores no mês ativo (uma bolinha por linha que tem valor nele).
  const ax = X(ativo);
  const marcadores = series.flatMap((s) => {
    const v = valorDaSerie(pontos[ativo], s);
    return v === undefined ? [] : [{ s, y: Y(v), v }];
  });

  // Etiqueta com o valor da primeira linha ligada (com o nome quando há mais de uma).
  const principal = marcadores[0];
  const texto = principal
    ? `${series.length > 1 ? `${NOME_DA_SERIE[principal.s]}: ` : ""}${formatarMoeda(principal.v)}`
    : "";
  const larguraEtiqueta = texto.length * m.fonte * 0.6 + 18;
  const alturaEtiqueta = m.fonte + 11;
  // Não cobre os valores do eixo à esquerda nem sai pela direita.
  const ex = Math.min(Math.max(ax - larguraEtiqueta / 2, L - 10), m.largura - 4 - larguraEtiqueta);
  const ay = principal?.y ?? T;
  let ey = ay - m.fonte - 26;
  if (ey < 2) ey = ay + 14;

  /** Posição do ponteiro → mês mais perto. */
  function indiceDoPonteiro(e: PointerEvent<SVGSVGElement>) {
    const caixa = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - caixa.left) / (caixa.width || 1)) * m.largura;
    return indiceMaisProximo(x, L, R, pontos.length);
  }

  function aoPressionar(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    // Captura: ao arrastar o dedo (ou o mouse apertado) o mês acompanha, mesmo saindo do desenho.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Sem captura o toque continua funcionando; só o arrastar fica limitado ao desenho.
    }
    onEscolher(indiceDoPonteiro(e));
  }

  function aoMover(e: PointerEvent<SVGSVGElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) onEscolher(indiceDoPonteiro(e));
    else if (e.pointerType === "mouse") onPrevia(indiceDoPonteiro(e));
  }

  function aoTeclar(e: KeyboardEvent<SVGSVGElement>) {
    const ultimo = pontos.length - 1;
    const novo =
      e.key === "ArrowLeft" || e.key === "ArrowDown"
        ? ativo - 1
        : e.key === "ArrowRight" || e.key === "ArrowUp"
          ? ativo + 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? ultimo
              : null;
    if (novo === null) return;
    e.preventDefault();
    onEscolher(Math.min(Math.max(novo, 0), ultimo));
  }

  return (
    // Para o teclado e leitores de tela é um controle deslizante: as setas trocam o mês.
    <svg
      viewBox={`0 0 ${m.largura} ${m.altura}`}
      role="slider"
      aria-label="Mês do gráfico"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={pontos.length - 1}
      aria-valuenow={ativo}
      aria-valuetext={falaDoMes(pontos, ativo, series)}
      aria-describedby={idLista}
      tabIndex={0}
      // Contorno de foco só pelo teclado (no toque/clique ele não aparece).
      className={`${className} cursor-pointer touch-pan-y select-none rounded-[calc(var(--radius-card)-6px)] [&:focus:not(:focus-visible)]:outline-none`}
      style={{ fontFamily: "var(--font-sans)", WebkitTapHighlightColor: "transparent" }}
      onPointerDown={aoPressionar}
      onPointerMove={aoMover}
      onPointerLeave={() => onPrevia(null)}
      onKeyDown={aoTeclar}
    >
      <defs>
        <linearGradient id={m.id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--pine)", stopOpacity: 0.32 }} />
          <stop offset="1" style={{ stopColor: "var(--pine)", stopOpacity: 0 }} />
        </linearGradient>
      </defs>

      {/* área que recebe o toque em todo o desenho, não só em cima da linha */}
      <rect x={0} y={0} width={m.largura} height={m.altura} fill="transparent" />

      {/* grade leve com os valores à esquerda */}
      {linhasGrade.map((v) => (
        <g key={v}>
          <line x1={L} x2={R} y1={Y(v)} y2={Y(v)} className="stroke-line-strong" strokeWidth={1} strokeDasharray="3 4" opacity={0.6} />
          <text x={L - 6} y={Y(v) + m.fonte * 0.35} textAnchor="end" fontSize={m.fonte - 1} className="fill-muted">
            {valorCurto(v)}
          </text>
        </g>
      ))}

      {area ? <path d={area} fill={`url(#${m.id})`} /> : null}

      {/* guia vertical no mês ativo */}
      <g className={deslizar} style={{ transform: `translateX(${ax}px)` }}>
        <line x1={0} x2={0} y1={T - 8} y2={B} className="stroke-ink-2" strokeWidth={1.5} strokeDasharray="2 4" opacity={0.4} />
      </g>

      {emOrdemDeDesenho.map((l) => (
        <path
          key={l.s}
          d={l.d}
          fill="none"
          className={ESTILO[l.s].traco}
          strokeWidth={ESTILO[l.s].largura}
          strokeDasharray={ESTILO[l.s].tracejado}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {emOrdemDeDesenho.flatMap((l) =>
        l.c.map((p) => (
          <circle
            key={`${l.s}-${p.i}`}
            cx={p.x}
            cy={p.y}
            r={l.s === "saldo" ? 4.5 : 3.5}
            className={`fill-canvas ${ESTILO[l.s].traco}`}
            strokeWidth={l.s === "saldo" ? 2.5 : 2}
          />
        )),
      )}

      {pontos.map((p, i) => (
        <text
          key={p.mes}
          x={X(i)}
          y={B + 20}
          textAnchor="middle"
          fontSize={m.fonte}
          fontWeight={i === ativo ? 700 : 400}
          className={i === ativo ? "fill-destaque" : "fill-muted"}
        >
          {mesCurto(p.mes)}
        </text>
      ))}

      {/* marcadores do mês ativo: deslizam de um mês para o outro */}
      {marcadores.map((mk) => (
        <g key={mk.s} className={deslizar} style={{ transform: `translate(${ax}px, ${mk.y}px)` }}>
          <circle r={mk.s === "saldo" ? 13 : 11} className={ESTILO[mk.s].ponto} opacity={0.16} />
          <circle r={mk.s === "saldo" ? 7 : 6} className={`${ESTILO[mk.s].ponto} stroke-canvas`} strokeWidth={3} />
        </g>
      ))}

      {/* valor do mês ativo */}
      {principal ? (
        <g className={deslizar} style={{ transform: `translate(${ex}px, ${ey}px)` }}>
          <rect width={larguraEtiqueta} height={alturaEtiqueta} rx={alturaEtiqueta / 2} className="fill-band" />
          <text
            x={larguraEtiqueta / 2}
            y={alturaEtiqueta / 2 + m.fonte * 0.35}
            textAnchor="middle"
            fontSize={m.fonte}
            fontWeight={700}
            className="fill-band-fg"
          >
            {texto}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

/**
 * Gráfico em cartão afundado. Com menos de 2 meses mostra só uma mensagem.
 * Começa no último mês, só com a linha do saldo.
 */
export function GraficoSaldo({
  pontos,
  mensagemVazia = "O gráfico aparece quando houver pelo menos dois meses publicados.",
  mesEscolhido,
  onEscolherMes,
}: {
  pontos: PontoSaldo[];
  /** Texto quando ainda não há meses suficientes (o painel da gestão conta também os não publicados). */
  mensagemVazia?: string;
  /** Mês escolhido por quem usa o gráfico ("AAAA-MM"). Fora da lista: o último mês. */
  mesEscolhido?: string;
  /** Avisa o mês tocado/clicado (com `mesEscolhido`, quem usa o gráfico decide o que mostrar). */
  onEscolherMes?: (mes: string) => void;
}) {
  // Mês escolhido aqui dentro (quando ninguém controla) e, no mouse, o mês sob o ponteiro.
  const [escolhidoAqui, setEscolhidoAqui] = useState<number | null>(null);
  const [previa, setPrevia] = useState<number | null>(null);
  const [ligadas, setLigadas] = useState<Serie[]>(["saldo"]);
  const idLista = useId();

  if (pontos.length < 2) {
    return (
      <div className="afundado rounded-[var(--radius-card)] px-4 py-6 text-center text-ink-2">
        {mensagemVazia}
      </div>
    );
  }

  const ultimo = pontos.length - 1;
  const indiceControlado = mesEscolhido === undefined ? -1 : pontos.findIndex((p) => p.mes === mesEscolhido);
  const fixo =
    mesEscolhido !== undefined
      ? indiceControlado >= 0
        ? indiceControlado
        : ultimo
      : escolhidoAqui !== null && escolhidoAqui <= ultimo
        ? escolhidoAqui
        : ultimo;
  const ativo = previa !== null && previa <= ultimo ? previa : fixo;

  const disponiveis = seriesDisponiveis(pontos);
  const series = ligadas.filter((s) => disponiveis.includes(s));
  const visiveis: Serie[] = series.length ? series : ["saldo"];

  const escolher = (i: number) => {
    setEscolhidoAqui(i);
    setPrevia(null);
    onEscolherMes?.(pontos[i].mes);
  };

  const lista =
    "Gráfico de linhas do financeiro. " +
    pontos.map((p, i) => falaDoMes(pontos, i, visiveis)).join(". ");
  const primeiroNome = nomeDoMes(pontos[0].mes);
  const ultimoNome = nomeDoMes(pontos[ultimo].mes);
  const comum = { pontos, series: visiveis, idLista, ativo, onEscolher: escolher, onPrevia: setPrevia };
  const ponto = pontos[ativo];

  return (
    <figure className="flex flex-col gap-1.5">
      <p id={idLista} className="sr-only">
        {lista}
      </p>
      <div className="afundado rounded-[var(--radius-card)] px-2.5 pt-3.5 pb-2.5">
        {/* celular */}
        <Desenho
          {...comum}
          className="block h-auto w-full sm:hidden"
          m={{ id: "area-saldo-p", largura: 340, altura: 200, fonte: 11.5, esquerda: 58 }}
        />
        {/* telas maiores */}
        <Desenho
          {...comum}
          className="hidden h-auto w-full sm:block"
          m={{ id: "area-saldo-g", largura: 680, altura: 250, fonte: 13, esquerda: 72 }}
        />

        {/* filtros: quais linhas aparecem */}
        {disponiveis.length > 1 ? (
          // No celular: "Mostrar:" numa linha e os botões dividindo a largura.
          <div role="group" aria-label="Linhas do gráfico" className="mt-1 flex flex-wrap items-center gap-1.5 px-1.5 sm:gap-2">
            <span className="basis-full text-[0.86rem] text-muted sm:basis-auto">Mostrar:</span>
            {disponiveis.map((s) => {
              const ligada = visiveis.includes(s);
              const unica = ligada && visiveis.length === 1;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={ligada}
                  aria-disabled={unica || undefined}
                  title={unica ? "Pelo menos uma linha fica ligada" : undefined}
                  onClick={() => setLigadas((atual) => alternarSerie(atual.filter((x) => disponiveis.includes(x)), s))}
                  className={
                    "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border px-1.5 text-[0.86rem] font-semibold transition-colors " +
                    "sm:flex-none sm:gap-2 sm:px-3.5 sm:text-[0.9rem] " +
                    (ligada ? "border-line-strong bg-surface-item text-ink" : "border-line text-muted hover:text-ink-2")
                  }
                >
                  {/* no celular o ✓ some para caber; o botão ligado continua com fundo preenchido */}
                  {ligada ? <Check aria-hidden className="hidden size-4 sm:block" /> : null}
                  <Amostra serie={s} className="w-5 sm:w-[26px]" />
                  {NOME_DA_SERIE[s]}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* o que o gráfico está mostrando agora (o leitor de tela já ouve pelo controle deslizante) */}
        <div aria-hidden className="mt-2 border-t border-line px-1.5 pt-2.5">
          <p className="text-[0.86rem] text-muted">
            {nomeDoMesTitulo(ponto.mes)}
            {ativo === 0 ? " · primeiro mês do gráfico" : ""}
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {visiveis.map((s) => {
              const v = valorDaSerie(ponto, s);
              if (v === undefined) return null;
              const variacao = variacaoDoMes(pontos, ativo, s);
              return (
                <li key={s} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <span className="inline-flex items-center gap-2 text-[0.95rem] text-ink-2">
                    <Amostra serie={s} />
                    {s === "saldo" ? "Saldo no fim do mês" : NOME_DA_SERIE[s]}
                  </span>
                  <strong className="text-[0.95rem] font-bold tabular-nums text-destaque">{formatarMoeda(v)}</strong>
                  {variacao ? (
                    <span
                      className={
                        "text-[0.86rem] " +
                        (variacao.boa === null ? "text-muted" : variacao.boa ? "font-semibold text-pine" : "font-semibold text-plum")
                      }
                    >
                      {variacao.centavos > 0 ? "▲ " : variacao.centavos < 0 ? "▼ " : ""}
                      {variacao.texto}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <figcaption className="px-1 text-[0.86rem] text-muted">
        {visiveis.length === 1 && visiveis[0] === "saldo" ? "Saldo no fim de cada mês" : visiveis.map((s) => NOME_DA_SERIE[s]).join(", ")}, de{" "}
        {primeiroNome} a {ultimoNome}. Toque num mês para ver os valores.
      </figcaption>
    </figure>
  );
}
