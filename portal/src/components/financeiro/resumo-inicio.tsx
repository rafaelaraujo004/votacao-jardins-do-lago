/**
 * Prestação de contas COMPACTA para a primeira tela do celular (Início do morador):
 * o saldo do último mês publicado em destaque, quanto entrou e quanto saiu e um
 * minigráfico do saldo nos últimos meses. Tudo cabe sem rolar a tela.
 * (No computador o Início usa o bloco completo, ResumoFinanceiroPainel.)
 * Componente de servidor: o SVG sai pronto, com as cores dos tokens (claro e escuro).
 */
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronRight, CircleCheck } from "lucide-react";
import { formatarMoeda } from "@/lib/formato";
import { nomeDoMes, type MesComSaldo } from "@/lib/financeiro";
import { cx } from "@/lib/cx";

/** Quantos meses o minigráfico mostra. */
const MESES_NO_MINIGRAFICO = 6;
const CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (mes: string) => CURTOS[Number(mes.slice(5, 7)) - 1] ?? mes;

/** Minigráfico de área do saldo no fim de cada mês (sem eixos: só a forma e os meses). */
export function MiniGraficoSaldo({ meses, className }: { meses: Pick<MesComSaldo, "mes" | "saldoFinalCentavos">[]; className?: string }) {
  if (meses.length < 2) return null;
  const W = 320;
  const H = 104;
  const E = 14; // margem lateral
  const T = 12; // margem de cima
  const B = H - 22; // linha de base (os meses ficam embaixo)
  const valores = meses.map((m) => m.saldoFinalCentavos);
  const menor = Math.min(...valores);
  const maior = Math.max(...valores);
  const faixa = maior - menor || Math.max(Math.abs(maior), 1);
  const X = (i: number) => E + ((W - 2 * E) * i) / (meses.length - 1);
  const Y = (v: number) => B - 8 - ((B - 8 - T) * (v - menor)) / faixa;
  const pts = meses.map((m, i) => [X(i), Y(m.saldoFinalCentavos)] as const);
  // Curva suave (Catmull-Rom → Bézier), sem passar muito dos pontos.
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[Math.max(0, i - 1)];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C${x1 + (x2 - x0) / 6},${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6},${y2 - (y3 - y1) / 6} ${x2},${y2}`;
  }
  const area = `${d} L${pts.at(-1)![0]},${B} L${pts[0][0]},${B} Z`;
  const descricao = `Saldo no fim de cada mês: ${meses.map((m) => `${nomeDoMes(m.mes)}, ${formatarMoeda(m.saldoFinalCentavos)}`).join("; ")}.`;
  const idGradiente = `mini-saldo-${meses.at(-1)!.mes}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={descricao} className={cx("block h-auto w-full", className)}>
      <defs>
        <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--pine)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--pine)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={E} x2={W - E} y1={B} y2={B} className="stroke-line" strokeWidth={1} />
      <path d={area} fill={`url(#${idGradiente})`} />
      <path d={d} fill="none" className="stroke-pine" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map(([x, y], i) => {
        const ultimo = i === pts.length - 1;
        return (
          <g key={meses[i].mes}>
            {ultimo ? <circle cx={x} cy={y} r={9} className="fill-pine" opacity={0.18} /> : null}
            <circle cx={x} cy={y} r={ultimo ? 5 : 3.5} className={ultimo ? "fill-pine" : "fill-surface stroke-pine"} strokeWidth={2} />
            <text x={x} y={H - 5} textAnchor="middle" fontSize={11} className={ultimo ? "fill-destaque font-bold" : "fill-muted"}>
              {mesCurto(meses[i].mes)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Cartão compacto do Início (celular). `meses` = meses publicados, em ordem. */
export function ResumoContasInicio({ meses, className }: { meses: MesComSaldo[]; className?: string }) {
  const mes = meses.at(-1);
  if (!mes) {
    return (
      <section aria-labelledby="titulo-contas-inicio" className={cx("rounded-[var(--radius-card)] border border-borda-luz bg-surface p-4 shadow-card", className)}>
        <h2 id="titulo-contas-inicio" className="text-[1.1rem] font-bold text-destaque">
          Prestação de contas
        </h2>
        <p className="mt-1 text-ink-2">A primeira prestação de contas ainda não foi publicada.</p>
      </section>
    );
  }
  const nome = nomeDoMes(mes.mes);
  return (
    <section aria-labelledby="titulo-contas-inicio" className={className}>
      <Link
        href="/financeiro"
        className="block rounded-[var(--radius-card)] border border-borda-luz bg-surface p-4 shadow-card transition-shadow active:shadow-afundado"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="titulo-contas-inicio" className="text-[1.1rem] font-bold text-destaque">
            Prestação de contas
          </h2>
          <span className="inline-flex shrink-0 items-center text-[0.88rem] font-bold text-pine">
            Ver tudo <ChevronRight aria-hidden className="size-4" />
          </span>
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-[0.86rem] text-muted">
          <CircleCheck aria-hidden className="size-4 text-pine" />
          {nome.charAt(0).toUpperCase() + nome.slice(1)} · publicado
        </p>
        <div className="mt-2.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div>
            <span className="block text-[0.78rem] font-bold uppercase tracking-wide text-ink-2">Saldo em caixa</span>
            <b className={cx("font-display text-[1.9rem] font-extrabold leading-tight tabular-nums", mes.saldoFinalCentavos < 0 ? "text-danger" : "text-destaque")}>
              {formatarMoeda(mes.saldoFinalCentavos)}
            </b>
          </div>
          <div className="flex flex-col gap-0.5 text-[0.88rem] tabular-nums">
            <span className="flex items-center gap-1 text-ink-2">
              <ArrowDownRight aria-hidden className="size-4 text-lake" /> Entrou <b className="text-ink">{formatarMoeda(mes.receitasCentavos)}</b>
            </span>
            <span className="flex items-center gap-1 text-ink-2">
              <ArrowUpRight aria-hidden className="size-4 text-plum" /> Saiu <b className="text-ink">{formatarMoeda(mes.despesasCentavos)}</b>
            </span>
          </div>
        </div>
        <MiniGraficoSaldo meses={meses.slice(-MESES_NO_MINIGRAFICO)} className="mt-2" />
      </Link>
    </section>
  );
}
