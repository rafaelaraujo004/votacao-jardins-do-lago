/**
 * Gráfico de barras montado no servidor (SVG, sem biblioteca).
 * Cada coluna (ex.: um mês) pode ter uma ou mais barras lado a lado (ex.: receitas e despesas).
 * As cores vêm dos tokens do tema, então funciona no modo claro e no escuro.
 */
import { cx } from "@/lib/cx";

export type CorBarra = "pine" | "plum" | "lake" | "warn";

const COR_PREENCHIMENTO: Record<CorBarra, string> = {
  pine: "fill-pine",
  plum: "fill-plum",
  lake: "fill-lake",
  warn: "fill-warn",
};
const COR_AMOSTRA: Record<CorBarra, string> = {
  pine: "bg-pine",
  plum: "bg-plum",
  lake: "bg-lake",
  warn: "bg-warn",
};

export type SerieBarras = { nome: string; cor: CorBarra; valores: number[] };

/** Valor curto para o eixo: 1234500 → "1,2 mi"; 12345 → "12,3 mil". */
function curto(n: number) {
  const abs = Math.abs(n);
  const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (abs >= 1_000_000) return `${fmt(n / 1_000_000)} mi`;
  if (abs >= 1_000) return `${fmt(n / 1_000)} mil`;
  return fmt(n);
}

/** Passo "redondo" da grade (1, 2, 2,5 ou 5 vezes uma potência de 10). */
function passoRedondo(bruto: number, inteiro: boolean) {
  if (bruto <= 0) return 1;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const f = bruto / pot;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  const passo = n * pot;
  return inteiro ? Math.max(1, Math.ceil(passo)) : passo;
}

/** Valor completo (dica e leitor de tela): centavos → "R$ 1.234,56"; contagem → "12". */
function formatarValor(v: number, emReais: boolean) {
  return emReais ? (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : v.toLocaleString("pt-BR");
}

type Medidas = { largura: number; altura: number; fonte: number; esquerda: number };

function Desenho({
  colunas,
  series,
  emReais,
  m,
  rotulo,
  className,
}: {
  colunas: string[];
  series: SerieBarras[];
  emReais: boolean;
  m: Medidas;
  rotulo: string;
  className: string;
}) {
  const L = m.esquerda;
  const R = m.largura - 8;
  const T = 12;
  const B = m.altura - 26;

  // Valores em reais quando for dinheiro (os dados chegam em centavos).
  const conv = (v: number) => (emReais ? v / 100 : v);
  const todos = series.flatMap((s) => s.valores.map(conv));
  const menorBruto = Math.min(0, ...todos);
  const maiorBruto = Math.max(0, ...todos);
  const passo = passoRedondo((maiorBruto - menorBruto || 1) / 4, !emReais);
  const base = Math.floor(menorBruto / passo) * passo;
  const topo = Math.max(Math.ceil(maiorBruto / passo) * passo, base + passo);
  const grade: number[] = [];
  for (let v = base; v <= topo + passo / 2; v += passo) grade.push(v);

  const Y = (v: number) => B - ((B - T) * (v - base)) / (topo - base);
  const largColuna = (R - L) / colunas.length;
  const folga = largColuna * 0.22;
  const largBarra = (largColuna - folga) / series.length;

  return (
    <svg viewBox={`0 0 ${m.largura} ${m.altura}`} role="img" aria-label={rotulo} className={className} style={{ fontFamily: "var(--font-sans)" }}>
      {grade.map((v) => (
        <g key={v}>
          <line
            x1={L}
            x2={R}
            y1={Y(v)}
            y2={Y(v)}
            className="stroke-line-strong"
            strokeWidth={1}
            strokeDasharray={v === 0 ? undefined : "3 4"}
            opacity={v === 0 ? 1 : 0.6}
          />
          <text x={L - 5} y={Y(v) + m.fonte * 0.35} textAnchor="end" fontSize={m.fonte - 1} className="fill-muted">
            {curto(v)}
          </text>
        </g>
      ))}

      {colunas.map((nome, i) => {
        const x0 = L + i * largColuna + folga / 2;
        return (
          <g key={nome + i}>
            {series.map((s, j) => {
              const v = conv(s.valores[i] ?? 0);
              const y = Math.min(Y(v), Y(0));
              const h = Math.max(Math.abs(Y(v) - Y(0)), v === 0 ? 0 : 1.5);
              return (
                <rect
                  key={s.nome}
                  x={x0 + j * largBarra}
                  y={y}
                  width={Math.max(largBarra - 1.5, 1)}
                  height={h}
                  rx={Math.min(3, largBarra / 3)}
                  className={COR_PREENCHIMENTO[s.cor]}
                >
                  <title>{`${nome} — ${s.nome}: ${formatarValor(s.valores[i] ?? 0, emReais)}`}</title>
                </rect>
              );
            })}
            <text x={x0 + (largColuna - folga) / 2} y={B + 17} textAnchor="middle" fontSize={m.fonte} className="fill-muted">
              {nome}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Barras em cartão afundado, com legenda (cor + nome, nunca só cor).
 * `emReais`: os valores estão em centavos e o eixo mostra reais.
 */
export function GraficoBarras({
  colunas,
  series,
  emReais = false,
  descricao,
  className,
}: {
  colunas: string[];
  series: SerieBarras[];
  emReais?: boolean;
  /** Frase curta embaixo do gráfico (também vira o texto para leitores de tela). */
  descricao: string;
  className?: string;
}) {
  const rotulo =
    `${descricao}. ` +
    colunas.map((c, i) => `${c}: ${series.map((s) => `${s.nome} ${formatarValor(s.valores[i] ?? 0, emReais)}`).join(", ")}`).join("; ");

  return (
    <figure className={cx("flex flex-col gap-2", className)}>
      <div className="afundado rounded-[var(--radius-card)] px-2 pt-3 pb-1.5">
        {/* celular */}
        <Desenho
          colunas={colunas}
          series={series}
          emReais={emReais}
          rotulo={rotulo}
          className="block h-auto w-full sm:hidden"
          m={{ largura: 340, altura: 190, fonte: 10.5, esquerda: emReais ? 44 : 32 }}
        />
        {/* telas maiores */}
        <Desenho
          colunas={colunas}
          series={series}
          emReais={emReais}
          rotulo={rotulo}
          className="hidden h-auto w-full sm:block"
          m={{ largura: 680, altura: 240, fonte: 12.5, esquerda: emReais ? 60 : 40 }}
        />
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[0.86rem] text-muted">
        {series.length > 1
          ? series.map((s) => (
              <span key={s.nome} className="inline-flex items-center gap-1.5 font-bold text-ink-2">
                <i aria-hidden className={cx("inline-block size-3 rounded-[4px]", COR_AMOSTRA[s.cor])} />
                {s.nome}
              </span>
            ))
          : null}
        <span>{descricao}</span>
      </figcaption>
    </figure>
  );
}
