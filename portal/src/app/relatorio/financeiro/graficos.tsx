/**
 * Gráficos do relatório impresso, feitos em HTML (o texto não encolhe no celular e sai igual no
 * papel e no PDF). Cada gráfico tem UMA cor e o nome escrito em cada barra: ninguém depende da cor.
 * Cores fixas (o relatório é sempre claro, como papel).
 */
import { formatarMoeda } from "@/lib/formato";
import { nomeDoMes } from "@/lib/financeiro";

export type Barra = { rotulo: string; valorCentavos: number; detalhe?: string };

/** Barras deitadas: nome em cima, barra e valor ao lado (bom para nomes compridos). */
export function BarrasDeitadas({ barras, cor, titulo }: { barras: Barra[]; cor: string; titulo: string }) {
  const max = Math.max(...barras.map((b) => Math.max(b.valorCentavos, 0)), 1);
  return (
    <ul aria-label={titulo} className="flex flex-col gap-2.5">
      {barras.map((b, i) => (
        <li key={`${b.rotulo}-${i}`} className="break-inside-avoid">
          <p className="text-[0.86rem] font-semibold leading-snug break-words">{b.rotulo}</p>
          <div className="mt-1 flex items-center gap-3">
            <div aria-hidden className="h-3 min-w-0 flex-1 rounded bg-[#eef1ef] print:[print-color-adjust:exact]">
              <div
                className="h-full rounded print:[print-color-adjust:exact]"
                style={{ width: `${Math.max((Math.max(b.valorCentavos, 0) / max) * 100, 1.5)}%`, backgroundColor: cor }}
              />
            </div>
            <p className="shrink-0 text-right text-[0.86rem] font-bold tabular-nums whitespace-nowrap">
              {formatarMoeda(b.valorCentavos)}
              {b.detalhe ? <span className="ml-1 font-normal text-[#5e6e65]">{b.detalhe}</span> : null}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "R$ 3.492,28" → "3,5 mil" (para caber quando há muitos meses). */
function valorCurto(centavos: number): string {
  const reais = centavos / 100;
  if (Math.abs(reais) >= 1000) return `${(reais / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return reais.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/**
 * Saldo no fim de cada mês: colunas em pé, uma cor, valor em cima de cada coluna. Com muitos
 * meses o valor fica curto ("3,5 mil") e o valor completo do último mês aparece embaixo.
 */
export function ColunasSaldo({ pontos, cor }: { pontos: { mes: string; saldoCentavos: number }[]; cor: string }) {
  // Saldo negativo não vira coluna alta: fica uma coluna mínima, apagada, e o valor com "−" em cima.
  const max = Math.max(...pontos.map((p) => p.saldoCentavos), 1);
  const muitos = pontos.length > 6;
  const ultimo = pontos.at(-1);
  return (
    <figure className="break-inside-avoid">
      <ol
        aria-label={`Saldo no fim de cada mês. ${pontos.map((p) => `${nomeDoMes(p.mes)}: ${formatarMoeda(p.saldoCentavos)}`).join("; ")}`}
        className="flex h-48 items-end gap-1.5 border-b border-[#c3cbc6] sm:gap-3"
      >
        {pontos.map((p, i) => {
          const fim = i === pontos.length - 1;
          return (
            <li key={p.mes} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className={`text-center text-[0.72rem] leading-tight tabular-nums sm:text-[0.8rem] ${fim ? "font-bold" : ""}`}>
                {muitos ? valorCurto(p.saldoCentavos) : formatarMoeda(p.saldoCentavos)}
              </span>
              <span
                aria-hidden
                className="w-full max-w-14 rounded-t print:[print-color-adjust:exact]"
                style={{ height: `${Math.max((Math.max(p.saldoCentavos, 0) / max) * 78, 2)}%`, backgroundColor: p.saldoCentavos < 0 ? "#8b2a5c" : cor, opacity: fim ? 1 : 0.55 }}
              />
            </li>
          );
        })}
      </ol>
      <div aria-hidden className="mt-1 flex gap-1.5 sm:gap-3">
        {pontos.map((p) => (
          <span key={p.mes} className="min-w-0 flex-1 text-center text-[0.72rem] text-[#5e6e65] sm:text-[0.8rem]">
            {nomeDoMes(p.mes).slice(0, 3)}/{p.mes.slice(2, 4)}
          </span>
        ))}
      </div>
      {muitos && ultimo ? (
        <figcaption className="mt-1 text-[0.85rem] text-[#3d4e45]">
          Saldo no fim de {nomeDoMes(ultimo.mes)}: <strong>{formatarMoeda(ultimo.saldoCentavos)}</strong>
        </figcaption>
      ) : null}
    </figure>
  );
}
