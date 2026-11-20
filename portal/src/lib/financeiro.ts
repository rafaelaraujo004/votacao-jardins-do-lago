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
  /** Quadro de casas do mês (como no relatório em papel); null = não preenchido. */
  casas?: QuadroCasas | null;
};

// ---------- Quadro de casas do mês ----------

/** Números do quadro de casas do relatório mensal. null = não informado. Só totais: nenhuma casa é identificada. */
export type QuadroCasas = {
  total: number | null;
  pagas: number | null;
  pagasSemExtra: number | null;
  acordos: number | null;
  isentas: number | null;
  inadimplentes: number | null;
  boletosVencidos: number | null;
  observacao: string;
};

export type CampoQuadro = Exclude<keyof QuadroCasas, "observacao">;

/** Campos na ordem em que aparecem na tela e no relatório. */
export const CAMPOS_QUADRO: { chave: CampoQuadro; rotulo: string }[] = [
  { chave: "total", rotulo: "Total de casas" },
  { chave: "pagas", rotulo: "Casas que pagaram a taxa" },
  { chave: "pagasSemExtra", rotulo: "Pagaram sem a taxa extra" },
  { chave: "acordos", rotulo: "Casas com acordo" },
  { chave: "isentas", rotulo: "Casas isentas" },
  { chave: "inadimplentes", rotulo: "Inadimplentes" },
  { chave: "boletosVencidos", rotulo: "Boletos vencidos" },
];

export const LIMITE_QUADRO = 100_000;
export const LIMITE_OBSERVACAO_QUADRO = 300;

/** Lê o quadro gravado no resumo do mês (aceita campos faltando). Sem nenhum dado → null. */
export function lerQuadroCasas(bruto: unknown): QuadroCasas | null {
  if (!bruto || typeof bruto !== "object") return null;
  const o = bruto as Record<string, unknown>;
  const numero = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= LIMITE_QUADRO ? v : null);
  const q: QuadroCasas = {
    total: numero(o.total),
    pagas: numero(o.pagas),
    pagasSemExtra: numero(o.pagasSemExtra),
    acordos: numero(o.acordos),
    isentas: numero(o.isentas),
    inadimplentes: numero(o.inadimplentes),
    boletosVencidos: numero(o.boletosVencidos),
    observacao: typeof o.observacao === "string" ? o.observacao.slice(0, LIMITE_OBSERVACAO_QUADRO) : "",
  };
  return CAMPOS_QUADRO.some((c) => q[c.chave] !== null) || q.observacao ? q : null;
}

// ---------- Lançamentos agrupados como no relatório ----------

type LancamentoBase = { tipo: TipoLancamento; categoriaId: string; categoriaNome: string; valorCentavos: number };

export type GrupoCategoria<L extends LancamentoBase> = {
  categoriaId: string;
  nome: string;
  tipo: TipoLancamento;
  /** Na ordem em que foram lançados (o 1º lançado primeiro), como as linhas do relatório. */
  itens: L[];
  totalCentavos: number;
};

const ORDEM_PADRAO = new Map(CATEGORIAS_PADRAO.map((c) => [c.id, c.ordem]));

/**
 * Agrupa por categoria, como as tabelas do relatório em papel: primeiro as receitas, depois
 * cada categoria de despesa (ordinárias, extraordinárias…), cada uma com seu subtotal.
 * Recebe a lista como as telas usam (do mais novo para o mais antigo) e devolve os itens
 * de cada grupo na ordem em que foram lançados. `ordem` = ordem das categorias (id → número).
 */
export function agruparPorCategoria<L extends LancamentoBase>(
  maisNovosPrimeiro: L[],
  ordem: Map<string, number> = ORDEM_PADRAO,
): GrupoCategoria<L>[] {
  const grupos = new Map<string, GrupoCategoria<L>>();
  const chegada: string[] = [];
  for (const l of [...maisNovosPrimeiro].reverse()) {
    const chave = `${l.tipo}:${l.categoriaId}`;
    let g = grupos.get(chave);
    if (!g) {
      g = { categoriaId: l.categoriaId, nome: l.categoriaNome || "Sem categoria", tipo: l.tipo, itens: [], totalCentavos: 0 };
      grupos.set(chave, g);
      chegada.push(chave);
    }
    g.itens.push(l);
    g.totalCentavos += l.valorCentavos;
  }
  const posicao = (g: GrupoCategoria<L>) => ordem.get(g.categoriaId) ?? 1000 + chegada.indexOf(`${g.tipo}:${g.categoriaId}`);
  return [...grupos.values()].sort((a, b) => (a.tipo === b.tipo ? posicao(a) - posicao(b) : a.tipo === "receita" ? -1 : 1));
}

/** Data padrão de um novo lançamento: hoje no mês atual; no 1º dia do mês escolhido se for um mês anterior. */
export function dataPadraoDoLancamento(mesEscolhido: string | null, hoje: string, mesInicial: string | null): string {
  if (!mesEscolhido || !REGEX_MES.test(mesEscolhido)) return hoje;
  if (mesEscolhido >= hoje.slice(0, 7)) return hoje;
  if (mesInicial && mesEscolhido < mesInicial) return hoje;
  return `${mesEscolhido}-01`;
}

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

/** Um mês no gráfico: saldo no fim do mês e, quando conhecidos, o que entrou e saiu nele. */
export type PontoSaldo = {
  mes: string;
  saldoCentavos: number;
  /** Ausente no mês "de partida" (antes do primeiro mês com lançamentos). */
  receitasCentavos?: number;
  despesasCentavos?: number;
};

/**
 * Pontos do gráfico de saldo (os últimos `quantos` meses). Com um mês só, o gráfico começa no
 * saldo que vinha do mês anterior (ex.: setembro = saldo inicial) — assim já aparece no 1º mês.
 * Esse mês de partida não tem receitas nem despesas.
 */
export function pontosDoSaldo(meses: MesComSaldo[], quantos = 12): PontoSaldo[] {
  const ultimos = meses.slice(-quantos);
  const pontos: PontoSaldo[] = ultimos.map((m) => ({
    mes: m.mes,
    saldoCentavos: m.saldoFinalCentavos,
    receitasCentavos: m.receitasCentavos,
    despesasCentavos: m.despesasCentavos,
  }));
  if (pontos.length === 1) pontos.unshift({ mes: mesAnterior(ultimos[0].mes), saldoCentavos: ultimos[0].saldoAnteriorCentavos });
  return pontos;
}
