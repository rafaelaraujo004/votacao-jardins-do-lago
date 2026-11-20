/**
 * Gráfico de linha do saldo no fim de cada mês.
 * O SVG é montado aqui no servidor (sem biblioteca) e as cores vêm dos tokens,
 * por isso funciona no modo claro e no escuro.
 */
import { formatarMoeda } from "@/lib/formato";
import { nomeDoMes } from "@/lib/financeiro";

export type PontoSaldo = { mes: string; saldoCentavos: number };

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

/** Desenha uma versão do gráfico. Usamos duas (celular e tela larga) para o texto não ficar gigante nem minúsculo. */
function Desenho({ pontos, m, rotulo, className }: { pontos: PontoSaldo[]; m: Medidas; rotulo: string; className: string }) {
  const L = m.esquerda;
  const R = m.largura - 22;
  const T = 36; // espaço no alto para a etiqueta do último valor
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

  // Etiqueta do último ponto (fica dentro do desenho).
  const ultimo = pontos.length - 1;
  const ux = X(ultimo);
  const uy = Y(pontos[ultimo].saldoCentavos);
  const texto = formatarMoeda(pontos[ultimo].saldoCentavos);
  const larguraEtiqueta = texto.length * m.fonte * 0.6 + 18;
  const ex = Math.min(Math.max(ux - larguraEtiqueta / 2, 4), m.largura - 4 - larguraEtiqueta);
  let ey = uy - m.fonte - 26;
  if (ey < 2) ey = uy + 14;
  const alturaEtiqueta = m.fonte + 11;

  return (
    <svg
      viewBox={`0 0 ${m.largura} ${m.altura}`}
      role="img"
      aria-label={rotulo}
      className={className}
      style={{ fontFamily: "var(--font-sans)" }}
    >
      <defs>
        <linearGradient id={m.id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--pine)", stopOpacity: 0.32 }} />
          <stop offset="1" style={{ stopColor: "var(--pine)", stopOpacity: 0 }} />
        </linearGradient>
      </defs>

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
      <path d={d} fill="none" className="stroke-pine" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />

      {pontos.map((p, i) => {
        const cx = X(i);
        const cy = Y(p.saldoCentavos);
        const destaque = i === ultimo;
        return (
          <g key={p.mes}>
            <title>{`${nomeDoMes(p.mes)}: ${formatarMoeda(p.saldoCentavos)}`}</title>
            {destaque ? <circle cx={cx} cy={cy} r={13} className="fill-pine" opacity={0.16} /> : null}
            <circle
              cx={cx}
              cy={cy}
              r={destaque ? 7 : 4.5}
              className={destaque ? "fill-pine stroke-canvas" : "fill-canvas stroke-pine"}
              strokeWidth={destaque ? 3 : 2.5}
            />
            <text
              x={cx}
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

      {/* valor do último mês em destaque */}
      <rect x={ex} y={ey} width={larguraEtiqueta} height={alturaEtiqueta} rx={alturaEtiqueta / 2} className="fill-band" />
      <text
        x={ex + larguraEtiqueta / 2}
        y={ey + alturaEtiqueta / 2 + m.fonte * 0.35}
        textAnchor="middle"
        fontSize={m.fonte}
        fontWeight={700}
        className="fill-band-fg"
      >
        {texto}
      </text>
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
  if (pontos.length < 2) {
    return (
      <div className="afundado rounded-[var(--radius-card)] px-4 py-6 text-center text-ink-2">
        {mensagemVazia}
      </div>
    );
  }

  const rotulo =
    "Gráfico de linha do saldo no fim de cada mês. " +
    pontos.map((p) => `${nomeDoMes(p.mes)}: ${formatarMoeda(p.saldoCentavos)}`).join("; ");
  const primeiro = nomeDoMes(pontos[0].mes);
  const ultimo = nomeDoMes(pontos[pontos.length - 1].mes);

  return (
    <figure className="flex flex-col gap-1.5">
      <div className="afundado rounded-[var(--radius-card)] px-2.5 pt-3.5 pb-2">
        {/* celular */}
        <Desenho
          pontos={pontos}
          rotulo={rotulo}
          className="block h-auto w-full sm:hidden"
          m={{ id: "area-saldo-p", largura: 340, altura: 200, fonte: 11.5, esquerda: 58 }}
        />
        {/* telas maiores */}
        <Desenho
          pontos={pontos}
          rotulo={rotulo}
          className="hidden h-auto w-full sm:block"
          m={{ id: "area-saldo-g", largura: 680, altura: 250, fonte: 13, esquerda: 72 }}
        />
      </div>
      <figcaption className="px-1 text-[0.86rem] text-muted">
        Saldo no fim de cada mês, de {primeiro} a {ultimo}.
      </figcaption>
    </figure>
  );
}
