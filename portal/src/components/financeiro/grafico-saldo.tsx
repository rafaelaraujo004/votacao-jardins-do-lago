"use client";

/**
 * Gráfico de linha do saldo no fim de cada mês, interativo: tocar ou clicar
 * num mês (ou arrastar o dedo pelo gráfico, ou usar as setas do teclado) mostra
 * o saldo daquele mês e quanto mudou em relação ao mês anterior. No mouse, só
 * passar por cima já mostra; o clique fixa.
 * SVG feito à mão (sem biblioteca) e cores dos tokens: funciona no modo claro e
 * no escuro.
 */
import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatarMoeda } from "@/lib/formato";
import { nomeDoMes, nomeDoMesTitulo } from "@/lib/financeiro";
import { indiceMaisProximo, variacaoDoMes, type PontoSaldo } from "@/lib/grafico-saldo";

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

type Medidas = { id: string; largura: number; altura: number; fonte: number; esquerda: number };

/** Move o grupo com transição suave (desligada para quem pediu menos movimento). */
const deslizar = "motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out";

/** Desenha uma versão do gráfico. Usamos duas (celular e tela larga) para o texto não ficar gigante nem minúsculo. */
function Desenho({
  pontos,
  m,
  idLista,
  className,
  ativo,
  onEscolher,
  onPrevia,
}: {
  pontos: PontoSaldo[];
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

  // Escala vertical com folga e números redondos na grade.
  const valores = pontos.map((p) => p.saldoCentavos);
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

  // Linha suave (curvas entre os pontos).
  let d = `M${X(0).toFixed(1)} ${Y(pontos[0].saldoCentavos).toFixed(1)}`;
  for (let i = 1; i < pontos.length; i++) {
    const x0 = X(i - 1);
    const y0 = Y(pontos[i - 1].saldoCentavos);
    const x1 = X(i);
    const y1 = Y(pontos[i].saldoCentavos);
    const meio = (x0 + x1) / 2;
    d += ` C${meio.toFixed(1)} ${y0.toFixed(1)} ${meio.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  const area = `${d} L${X(pontos.length - 1).toFixed(1)} ${B} L${X(0).toFixed(1)} ${B} Z`;

  // Etiqueta do mês ativo (fica dentro do desenho).
  const ax = X(ativo);
  const ay = Y(pontos[ativo].saldoCentavos);
  const texto = formatarMoeda(pontos[ativo].saldoCentavos);
  const larguraEtiqueta = texto.length * m.fonte * 0.6 + 18;
  const alturaEtiqueta = m.fonte + 11;
  // Não cobre os valores do eixo à esquerda nem sai pela direita.
  const ex = Math.min(Math.max(ax - larguraEtiqueta / 2, L - 10), m.largura - 4 - larguraEtiqueta);
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
      aria-label="Mês do gráfico do saldo"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={pontos.length - 1}
      aria-valuenow={ativo}
      aria-valuetext={`${nomeDoMes(pontos[ativo].mes)}: ${texto}${variacaoDoMes(pontos, ativo) ? `, ${variacaoDoMes(pontos, ativo)?.texto}` : ""}`}
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

      <path d={area} fill={`url(#${m.id})`} />

      {/* guia vertical no mês ativo */}
      <g className={deslizar} style={{ transform: `translateX(${ax}px)` }}>
        <line x1={0} x2={0} y1={T - 8} y2={B} className="stroke-pine" strokeWidth={1.5} strokeDasharray="2 4" opacity={0.45} />
      </g>

      <path d={d} fill="none" className="stroke-pine" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />

      {pontos.map((p, i) => {
        const destaque = i === ativo;
        return (
          <g key={p.mes}>
            <circle cx={X(i)} cy={Y(p.saldoCentavos)} r={4.5} className="fill-canvas stroke-pine" strokeWidth={2.5} />
            <text
              x={X(i)}
              y={B + 20}
              textAnchor="middle"
              fontSize={m.fonte}
              fontWeight={destaque ? 700 : 400}
              className={destaque ? "fill-destaque" : "fill-muted"}
            >
              {mesCurto(p.mes)}
            </text>
          </g>
        );
      })}

      {/* marcador do mês ativo: desliza de um mês para o outro */}
      <g className={deslizar} style={{ transform: `translate(${ax}px, ${ay}px)` }}>
        <circle r={13} className="fill-pine" opacity={0.16} />
        <circle r={7} className="fill-pine stroke-canvas" strokeWidth={3} />
      </g>

      {/* valor do mês ativo */}
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
    </svg>
  );
}

/** Gráfico em cartão afundado. Com menos de 2 meses mostra só uma mensagem. */
export function GraficoSaldo({
  pontos,
  mensagemVazia = "O gráfico aparece quando houver pelo menos dois meses publicados.",
}: {
  pontos: PontoSaldo[];
  /** Texto quando ainda não há meses suficientes (o painel da gestão conta também os não publicados). */
  mensagemVazia?: string;
}) {
  // Mês escolhido (começa no último) e, no mouse, o mês sob o ponteiro.
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [previa, setPrevia] = useState<number | null>(null);
  const idLista = useId();

  if (pontos.length < 2) {
    return (
      <div className="afundado rounded-[var(--radius-card)] px-4 py-6 text-center text-ink-2">
        {mensagemVazia}
      </div>
    );
  }

  const ultimo = pontos.length - 1;
  // Se a lista mudar e o mês escolhido não existir mais, volta para o último.
  const fixo = escolhido !== null && escolhido <= ultimo ? escolhido : ultimo;
  const ativo = previa !== null && previa <= ultimo ? previa : fixo;
  const ponto = pontos[ativo];
  const variacao = variacaoDoMes(pontos, ativo);

  const escolher = (i: number) => {
    setEscolhido(i);
    setPrevia(null);
  };

  const lista =
    "Gráfico de linha do saldo no fim de cada mês. " +
    pontos.map((p) => `${nomeDoMes(p.mes)}: ${formatarMoeda(p.saldoCentavos)}`).join("; ");
  const primeiroNome = nomeDoMes(pontos[0].mes);
  const ultimoNome = nomeDoMes(pontos[ultimo].mes);
  const comum = { pontos, idLista, ativo, onEscolher: escolher, onPrevia: setPrevia };

  return (
    <figure className="flex flex-col gap-1.5">
      <p id={idLista} className="sr-only">
        {lista}
      </p>
      <div className="afundado rounded-[var(--radius-card)] px-2.5 pt-3.5 pb-2">
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

        {/* o que o gráfico está mostrando agora (o leitor de tela já ouve pelo controle deslizante) */}
        <div
          aria-hidden
          className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-line px-1.5 pt-2.5"
        >
          <p className="text-[0.95rem]">
            <span className="text-ink-2">Fim de {nomeDoMes(ponto.mes)}: </span>
            <strong className="font-bold tabular-nums text-destaque">{formatarMoeda(ponto.saldoCentavos)}</strong>
          </p>
          <p
            className={
              variacao === null || variacao.centavos === 0
                ? "text-[0.86rem] text-muted"
                : variacao.centavos > 0
                  ? "text-[0.86rem] font-semibold text-pine"
                  : "text-[0.86rem] font-semibold text-plum"
            }
          >
            {variacao === null ? (
              `${nomeDoMesTitulo(ponto.mes)} é o primeiro mês do gráfico`
            ) : (
              <>
                {variacao.centavos > 0 ? <span aria-hidden>▲ </span> : variacao.centavos < 0 ? <span aria-hidden>▼ </span> : null}
                {variacao.texto}
              </>
            )}
          </p>
        </div>
      </div>
      <figcaption className="px-1 text-[0.86rem] text-muted">
        Saldo no fim de cada mês, de {primeiroNome} a {ultimoNome}. Toque num mês para ver o valor.
      </figcaption>
    </figure>
  );
}
