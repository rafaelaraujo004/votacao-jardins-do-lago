/**
 * Contas do gráfico do saldo (sem tela): as linhas que dá para mostrar (saldo,
 * receitas e despesas), qual mês está sob o dedo e quanto cada valor mudou em
 * relação ao mês anterior.
 */
import { formatarMoeda } from "@/lib/formato";
import { nomeDoMes, type PontoSaldo } from "@/lib/financeiro";

export type { PontoSaldo };

/** Linhas do gráfico. A ordem é a dos filtros e da leitura embaixo do gráfico. */
export type Serie = "saldo" | "receitas" | "despesas";
export const SERIES: readonly Serie[] = ["saldo", "receitas", "despesas"];

export const NOME_DA_SERIE: Record<Serie, string> = {
  saldo: "Saldo",
  receitas: "Receitas",
  despesas: "Despesas",
};

/** Valor da linha no mês (`undefined` quando o mês não tem esse dado). */
export function valorDaSerie(p: PontoSaldo, serie: Serie): number | undefined {
  if (serie === "saldo") return p.saldoCentavos;
  return serie === "receitas" ? p.receitasCentavos : p.despesasCentavos;
}

/** Linhas que dá para desenhar: as que têm valor em pelo menos dois meses. O saldo sempre. */
export function seriesDisponiveis(pontos: PontoSaldo[]): Serie[] {
  return SERIES.filter((s) => s === "saldo" || pontos.filter((p) => valorDaSerie(p, s) !== undefined).length >= 2);
}

/**
 * Liga ou desliga uma linha. Pelo menos uma fica sempre ligada (desligar a
 * última não faz nada). Mantém a ordem de SERIES.
 */
export function alternarSerie(ligadas: readonly Serie[], serie: Serie): Serie[] {
  if (ligadas.includes(serie)) return ligadas.length > 1 ? ligadas.filter((s) => s !== serie) : [...ligadas];
  return SERIES.filter((s) => s === serie || ligadas.includes(s));
}

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
  /** A mudança é boa? Saldo e receitas subindo é bom; despesas subindo, não. Igual: null. */
  boa: boolean | null;
  /** Frase pronta, ex.: "R$ 411,28 a mais que em setembro". */
  texto: string;
};

/**
 * Quanto a linha mudou no mês `i` em relação ao mês anterior.
 * `null` no primeiro mês ou quando um dos dois meses não tem o valor.
 */
export function variacaoDoMes(pontos: PontoSaldo[], i: number, serie: Serie = "saldo"): Variacao | null {
  if (i <= 0 || i >= pontos.length) return null;
  const atual = valorDaSerie(pontos[i], serie);
  const anterior = valorDaSerie(pontos[i - 1], serie);
  if (atual === undefined || anterior === undefined) return null;
  const centavos = atual - anterior;
  const mes = mesDeComparacao(pontos[i - 1].mes, pontos[i].mes);
  if (centavos === 0) return { centavos, boa: null, texto: `Igual a ${mes}` };
  const subiu = centavos > 0;
  return {
    centavos,
    boa: serie === "despesas" ? !subiu : subiu,
    texto: `${formatarMoeda(Math.abs(centavos))} ${subiu ? "a mais" : "a menos"} que em ${mes}`,
  };
}
