/**
 * Regras e nomes do financeiro que valem no servidor e na tela.
 */

export type TipoLancamento = "receita" | "despesa";

export const CATEGORIAS_PADRAO: { id: string; nome: string; tipo: TipoLancamento; ordem: number }[] = [
  { id: "contribuicoes", nome: "Contribuições dos moradores", tipo: "receita", ordem: 1 },
  { id: "taxas-extras", nome: "Taxas extras", tipo: "receita", ordem: 2 },
  { id: "outras-receitas", nome: "Outras receitas", tipo: "receita", ordem: 3 },
  // As duas colunas do relatório mensal do Jardins do Lago (ordinária × extraordinária).
  { id: "despesas-ordinarias", nome: "Despesas ordinárias", tipo: "despesa", ordem: 4 },
  { id: "despesas-extraordinarias", nome: "Despesas extraordinárias", tipo: "despesa", ordem: 5 },
  { id: "energia", nome: "Energia elétrica", tipo: "despesa", ordem: 10 },
  { id: "agua", nome: "Água", tipo: "despesa", ordem: 11 },
  { id: "limpeza", nome: "Limpeza", tipo: "despesa", ordem: 12 },
  { id: "manutencao", nome: "Manutenção", tipo: "despesa", ordem: 13 },
  { id: "jardinagem", nome: "Jardinagem", tipo: "despesa", ordem: 14 },
  { id: "seguranca", nome: "Segurança", tipo: "despesa", ordem: 15 },
  { id: "materiais", nome: "Materiais", tipo: "despesa", ordem: 16 },
  { id: "servicos-terceirizados", nome: "Serviços terceirizados", tipo: "despesa", ordem: 17 },
  { id: "outras-despesas", nome: "Outros", tipo: "despesa", ordem: 18 },
];

export const FORMAS_PAGAMENTO = {
  pix: "Pix",
  transferencia: "Transferência",
  boleto: "Boleto",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  debito: "Débito automático",
  outro: "Outro",
} as const;
export type FormaPagamento = keyof typeof FORMAS_PAGAMENTO;
export const CHAVES_FORMA = Object.keys(FORMAS_PAGAMENTO) as [FormaPagamento, ...FormaPagamento[]];

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export const REGEX_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-11" → "novembro de 2026" */
export function nomeDoMes(mes: string): string {
  const [ano, m] = mes.split("-");
  return `${MESES[Number(m) - 1]} de ${ano}`;
}

/** "2026-11" → "Novembro de 2026" */
export function nomeDoMesTitulo(mes: string): string {
  const n = nomeDoMes(mes);
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** "2026-01" → "2025-12" */
export function mesAnterior(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, "0")}`;
}

export function mesSeguinte(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, "0")}`;
}

export type MesResumo = {
  mes: string;
  receitasCentavos: number;
  despesasCentavos: number;
  publicado: boolean;
  quantidade: number;
};

export type MesComSaldo = MesResumo & {
  resultadoCentavos: number;
  saldoAnteriorCentavos: number;
  saldoFinalCentavos: number;
};

/**
 * Calcula saldo anterior e final de cada mês, em ordem.
 * saldo final = saldo inicial + soma dos resultados de todos os meses até ele.
 */
export function calcularSaldos(meses: MesResumo[], saldoInicialCentavos: number): MesComSaldo[] {
  let saldo = saldoInicialCentavos;
  return [...meses]
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map((m) => {
      const resultado = m.receitasCentavos - m.despesasCentavos;
      const linha = { ...m, resultadoCentavos: resultado, saldoAnteriorCentavos: saldo, saldoFinalCentavos: saldo + resultado };
      saldo += resultado;
      return linha;
    });
}
