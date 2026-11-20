/**
 * Contas do gráfico do saldo (sem tela): qual mês está sob o dedo e quanto o
 * saldo mudou em relação ao mês anterior.
 */
import { formatarMoeda } from "@/lib/formato";
import { nomeDoMes } from "@/lib/financeiro";

export type PontoSaldo = { mes: string; saldoCentavos: number };

/**
 * Mês mais perto de uma posição horizontal do desenho.
 * Os meses ficam espalhados por igual entre `esquerda` e `direita`.
 */
export function indiceMaisProximo(x: number, esquerda: number, direita: number, total: number): number {
  if (total <= 1 || direita <= esquerda) return 0;
  const passo = (direita - esquerda) / (total - 1);
  const i = Math.round((x - esquerda) / passo);
  return Math.min(Math.max(i, 0), total - 1);
}

/** "2026-09" comparado com "2026-10" → "setembro"; de outro ano → "dezembro de 2025". */
function mesDeComparacao(anterior: string, atual: string): string {
  const nome = nomeDoMes(anterior);
  return anterior.slice(0, 4) === atual.slice(0, 4) ? nome.split(" de ")[0] : nome;
}

export type Variacao = {
  /** Diferença em centavos (positivo: subiu). */
  centavos: number;
  /** Frase pronta, ex.: "R$ 411,28 a mais que em setembro". */
  texto: string;
};

/** Quanto o saldo do mês `i` mudou em relação ao mês anterior. No primeiro mês, `null`. */
export function variacaoDoMes(pontos: PontoSaldo[], i: number): Variacao | null {
  if (i <= 0 || i >= pontos.length) return null;
  const atual = pontos[i];
  const anterior = pontos[i - 1];
  const centavos = atual.saldoCentavos - anterior.saldoCentavos;
  const mes = mesDeComparacao(anterior.mes, atual.mes);
  if (centavos === 0) return { centavos, texto: `Igual a ${mes}` };
  const valor = formatarMoeda(Math.abs(centavos));
  return { centavos, texto: `${valor} ${centavos > 0 ? "a mais" : "a menos"} que em ${mes}` };
}
