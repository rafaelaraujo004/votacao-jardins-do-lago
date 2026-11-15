/**
 * Regras das SOLICITAÇÕES com protocolo (código "puro": roda no servidor,
 * na tela e nos testes, sem banco).
 *
 * Caminho no banco (dentro de condominiums/{c}):
 * - tickets/{id}: a solicitação (protocolo "AAAA-NNNN", casa, categoria, situação...);
 * - tickets/{id}/updates/{id}: a linha do tempo (comentários e mudanças de situação).
 *   `publico: false` = NOTA INTERNA da administração: o morador NUNCA vê.
 * - counters/solicitacoes-AAAA: o último número usado no ano (só o servidor mexe).
 *
 * Nada é apagado: a solicitação muda de situação e o histórico fica.
 */

// ---------- Categorias ----------

export const CATEGORIAS_SOLICITACAO = [
  "manutencao",
  "limpeza",
  "iluminacao",
  "convivencia",
  "seguranca",
  "sugestao",
  "outro",
] as const;
export type CategoriaSolicitacao = (typeof CATEGORIAS_SOLICITACAO)[number];

export const ROTULO_CATEGORIA: Record<CategoriaSolicitacao, string> = {
  manutencao: "Manutenção",
  limpeza: "Limpeza",
  iluminacao: "Iluminação",
  convivencia: "Barulho / convivência",
  seguranca: "Segurança",
  sugestao: "Sugestão",
  outro: "Outro assunto",
};

/** Exemplo que aparece no formulário para ajudar o morador. */
export const EXEMPLO_CATEGORIA: Record<CategoriaSolicitacao, string> = {
  manutencao: "portão, calçada, vazamento, brinquedo quebrado",
  limpeza: "lixo acumulado, mato alto, área suja",
  iluminacao: "poste apagado, lâmpada piscando",
  convivencia: "som alto, animais, uso de áreas comuns",
  seguranca: "pessoa estranha, muro danificado, câmera",
  sugestao: "ideias para melhorar o condomínio",
  outro: "qualquer outro assunto",
};

export function ehCategoria(v: unknown): v is CategoriaSolicitacao {
  return typeof v === "string" && (CATEGORIAS_SOLICITACAO as readonly string[]).includes(v);
}

// ---------- Situação (status) ----------

export const STATUS_SOLICITACAO = ["aberta", "em_andamento", "resolvida", "cancelada"] as const;
export type StatusSolicitacao = (typeof STATUS_SOLICITACAO)[number];

export const ROTULO_STATUS_SOLICITACAO: Record<StatusSolicitacao, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  resolvida: "Resolvida",
  cancelada: "Cancelada",
};

export function ehStatusSolicitacao(v: unknown): v is StatusSolicitacao {
  return typeof v === "string" && (STATUS_SOLICITACAO as readonly string[]).includes(v);
}

/** Situações "vivas" (ainda precisam de atenção). */
export function estaAtiva(status: StatusSolicitacao): boolean {
  return status === "aberta" || status === "em_andamento";
}

/**
 * Para onde a ADMINISTRAÇÃO pode mudar cada situação.
 * - Resolvida pode voltar para "em andamento" (o problema voltou).
 * - Cancelada pode ser reaberta (cancelou por engano).
 */
export const TRANSICOES: Record<StatusSolicitacao, readonly StatusSolicitacao[]> = {
  aberta: ["em_andamento", "resolvida", "cancelada"],
  em_andamento: ["aberta", "resolvida", "cancelada"],
  resolvida: ["em_andamento"],
  cancelada: ["aberta"],
};

export function podeMudarStatus(de: StatusSolicitacao, para: StatusSolicitacao): boolean {
  return TRANSICOES[de].includes(para);
}

/** O morador só cancela enquanto ninguém começou a cuidar ("aberta"). */
export function podeCancelarMorador(status: StatusSolicitacao): boolean {
  return status === "aberta";
}

/** O morador comenta enquanto a solicitação está viva (aberta ou em andamento). */
export function podeComentarMorador(status: StatusSolicitacao): boolean {
  return estaAtiva(status);
}

// ---------- Protocolo ----------

/** "2026-0007" (ano + número sequencial do ano, com 4 dígitos). */
export const REGEX_PROTOCOLO = /^\d{4}-\d{4,}$/;

export function formatarProtocolo(ano: number, numero: number): string {
  return `${ano}-${String(numero).padStart(4, "0")}`;
}

/** Documento do contador do ano: counters/solicitacoes-2026. */
export function idContadorSolicitacoes(ano: number): string {
  return `solicitacoes-${ano}`;
}

/** Próximo número a partir do valor gravado no contador (lixo ou ausente = começa do 1). */
export function proximoNumero(ultimo: unknown): number {
  return typeof ultimo === "number" && Number.isSafeInteger(ultimo) && ultimo >= 0 ? ultimo + 1 : 1;
}

// ---------- Conversão dos documentos (LISTA FECHADA de campos) ----------

type DocBruto = Record<string, unknown> | undefined;

function texto(v: unknown, padrao = ""): string {
  return typeof v === "string" ? v : padrao;
}

/** Timestamp do Firestore (ou Date) → Date; qualquer outra coisa → null. */
function data(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: unknown }).toDate === "function") {
    const d = (v as { toDate: () => unknown }).toDate();
    return d instanceof Date ? d : null;
  }
  return null;
}

/** O que as telas recebem de uma solicitação. Nunca o uid de quem abriu. */
export type Solicitacao = {
  id: string;
  protocolo: string;
  unitId: string;
  unidadeRotulo: string;
  categoria: CategoriaSolicitacao;
  local: string;
  descricao: string;
  status: StatusSolicitacao;
  criadoEm: Date | null;
  atualizadoEm: Date | null;
  resolvidoEm: Date | null;
};

export function paraSolicitacao(id: string, d: DocBruto): Solicitacao {
  return {
    id,
    protocolo: texto(d?.protocolo, "—"),
    unitId: texto(d?.unitId),
    unidadeRotulo: texto(d?.unidadeRotulo, "—"),
    categoria: ehCategoria(d?.categoria) ? d.categoria : "outro",
    local: texto(d?.local),
    descricao: texto(d?.descricao),
    // Valor estranho no banco: trata como cancelada (não aparece como pendente).
    status: ehStatusSolicitacao(d?.status) ? d.status : "cancelada",
    criadoEm: data(d?.criadoEm),
    atualizadoEm: data(d?.atualizadoEm),
    resolvidoEm: data(d?.resolvidoEm),
  };
}

export type PapelAutor = "morador" | "administracao";

/** Um item da linha do tempo, como a GESTÃO vê (inclui notas internas). */
export type AtualizacaoSolicitacao = {
  id: string;
  tipo: "comentario" | "status";
  texto: string;
  deStatus: StatusSolicitacao | null;
  paraStatus: StatusSolicitacao | null;
  autorNome: string;
  autorPapel: PapelAutor;
  publico: boolean;
  criadoEm: Date | null;
};

export function paraAtualizacao(id: string, d: DocBruto): AtualizacaoSolicitacao {
  return {
    id,
    tipo: d?.tipo === "status" ? "status" : "comentario",
    texto: texto(d?.texto),
    deStatus: ehStatusSolicitacao(d?.deStatus) ? d.deStatus : null,
    paraStatus: ehStatusSolicitacao(d?.paraStatus) ? d.paraStatus : null,
    autorNome: texto(d?.autorNome),
    autorPapel: d?.autorPapel === "morador" ? "morador" : "administracao",
    // Só é público se estiver gravado como true (na dúvida, é interno).
    publico: d?.publico === true,
    criadoEm: data(d?.criadoEm),
  };
}

/**
 * Linha do tempo para o MORADOR:
 * - tira as notas internas (publico !== true);
 * - quem respondeu pela administração aparece como "Administração".
 */
export function linhaDoTempoDoMorador(lista: AtualizacaoSolicitacao[]): AtualizacaoSolicitacao[] {
  return lista
    .filter((a) => a.publico)
    .map((a) => ({ ...a, autorNome: a.autorPapel === "morador" ? a.autorNome : "Administração" }));
}

const tempo = (d: Date | null) => d?.getTime() ?? 0;

/** Mais novas primeiro. */
export function ordenarSolicitacoes(lista: Solicitacao[]): Solicitacao[] {
  return [...lista].sort((a, b) => tempo(b.criadoEm) - tempo(a.criadoEm) || b.protocolo.localeCompare(a.protocolo));
}

/** Linha do tempo em ordem cronológica (a mais antiga primeiro). */
export function ordenarAtualizacoes(lista: AtualizacaoSolicitacao[]): AtualizacaoSolicitacao[] {
  // Mesmo instante (mudança de situação + nota gravadas juntas): a mudança vem primeiro.
  const peso = (a: AtualizacaoSolicitacao) => (a.tipo === "status" ? 0 : 1);
  return [...lista].sort((a, b) => tempo(a.criadoEm) - tempo(b.criadoEm) || peso(a) - peso(b));
}

/** Frase da mudança de situação: "Situação: Aberta → Em andamento". */
export function descreverMudanca(a: Pick<AtualizacaoSolicitacao, "deStatus" | "paraStatus">): string {
  if (!a.paraStatus) return "Situação alterada";
  const para = ROTULO_STATUS_SOLICITACAO[a.paraStatus];
  return a.deStatus ? `Situação: ${ROTULO_STATUS_SOLICITACAO[a.deStatus]} → ${para}` : `Situação: ${para}`;
}

/** Conta quantas há em cada situação. */
export function contarPorStatus(lista: Pick<Solicitacao, "status">[]): Record<StatusSolicitacao, number> {
  const total: Record<StatusSolicitacao, number> = { aberta: 0, em_andamento: 0, resolvida: 0, cancelada: 0 };
  for (const s of lista) total[s.status]++;
  return total;
}
