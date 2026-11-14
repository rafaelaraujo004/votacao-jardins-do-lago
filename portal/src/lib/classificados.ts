/**
 * Regras dos classificados (código "puro": roda no servidor, na tela e nos
 * testes, sem banco).
 *
 * Caminho: o morador cria o anúncio → fica "pendente" → o síndico aprova
 * (vale por 30 dias) ou rejeita com motivo. Nada é apagado: só muda o status.
 * O anúncio aprovado mostra só o PRIMEIRO NOME do autor e o WhatsApp que ele
 * escolheu mostrar — nunca a casa.
 */

// ---------- Tipos e rótulos ----------

export const CATEGORIAS_CLASSIFICADO = ["venda", "servico", "doacao", "procura", "outro"] as const;
export type CategoriaClassificado = (typeof CATEGORIAS_CLASSIFICADO)[number];

export const ROTULO_CATEGORIA: Record<CategoriaClassificado, string> = {
  venda: "Venda",
  servico: "Serviço",
  doacao: "Doação",
  procura: "Procura-se",
  outro: "Outros",
};

/** Explicação curta de cada categoria (aparece no formulário). */
export const DICA_CATEGORIA: Record<CategoriaClassificado, string> = {
  venda: "Algo que você quer vender",
  servico: "Um serviço que você oferece (aulas, consertos, bolos…)",
  doacao: "Algo que você quer doar de graça",
  procura: "Algo ou alguém que você está procurando",
  outro: "Qualquer outro assunto",
};

export const STATUS_CLASSIFICADO = ["pendente", "aprovado", "rejeitado", "removido", "expirado"] as const;
export type StatusClassificado = (typeof STATUS_CLASSIFICADO)[number];

export const ROTULO_STATUS_CLASSIFICADO: Record<StatusClassificado, string> = {
  pendente: "Aguardando aprovação",
  aprovado: "Publicado",
  rejeitado: "Não aprovado",
  removido: "Removido",
  expirado: "Expirado",
};

export function ehCategoria(v: unknown): v is CategoriaClassificado {
  return typeof v === "string" && (CATEGORIAS_CLASSIFICADO as readonly string[]).includes(v);
}

export function ehStatusClassificado(v: unknown): v is StatusClassificado {
  return typeof v === "string" && (STATUS_CLASSIFICADO as readonly string[]).includes(v);
}

// ---------- Prazos e limites ----------

/** Quantos dias o anúncio fica no ar depois de aprovado. */
export const DIAS_VALIDADE = 30;

/** Máximo de anúncios "ativos" (aguardando ou publicados) por pessoa. Evita excesso. */
export const LIMITE_ATIVOS_POR_PESSOA = 5;

const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** Data em que o anúncio sai do ar: 30 dias depois da aprovação. */
export function calcularExpiraEm(aprovadoEm: Date): Date {
  return new Date(aprovadoEm.getTime() + DIAS_VALIDADE * UM_DIA_MS);
}

/**
 * Situação que a pessoa vê. O banco continua com "aprovado", mas depois do
 * prazo ele aparece como "expirado" (calculado na leitura, sem tarefa agendada).
 */
export function situacaoEfetiva(status: StatusClassificado, expiraEm: Date | null, agora: Date): StatusClassificado {
  if (status === "aprovado" && (!expiraEm || expiraEm.getTime() <= agora.getTime())) return "expirado";
  return status;
}

/** Aparece na lista dos moradores? Só aprovado e dentro do prazo. */
export function estaVisivel(status: StatusClassificado, expiraEm: Date | null, agora: Date): boolean {
  return situacaoEfetiva(status, expiraEm, agora) === "aprovado";
}

/** Conta no limite por pessoa? (aguardando aprovação ou ainda publicado) */
export function contaComoAtivo(status: StatusClassificado, expiraEm: Date | null, agora: Date): boolean {
  const s = situacaoEfetiva(status, expiraEm, agora);
  return s === "pendente" || s === "aprovado";
}

/** Quem pode remover o próprio anúncio: só enquanto aguarda ou está publicado. */
export function podeRemover(status: StatusClassificado, expiraEm: Date | null, agora: Date): boolean {
  return contaComoAtivo(status, expiraEm, agora);
}

/** Dias inteiros que faltam até sair do ar (0 = sai hoje). */
export function diasRestantes(expiraEm: Date, agora: Date): number {
  return Math.max(0, Math.ceil((expiraEm.getTime() - agora.getTime()) / UM_DIA_MS));
}

// ---------- Nome e contato ----------

/** "Maria José da Silva" → "Maria". Nunca mostramos o nome completo nem a casa. */
export function primeiroNome(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  return primeiro.slice(0, 30) || "Morador";
}

/**
 * WhatsApp digitado → só dígitos, com o 55 do Brasil na frente.
 * Aceita "(91) 98888-7777", "91988887777", "+55 91 98888-7777".
 * Retorna null se não parecer um telefone brasileiro (DDD + 8 ou 9 dígitos).
 */
export function normalizarWhatsapp(texto: string): string | null {
  let d = texto.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  // DDD de 11 a 99 (nenhum começa ou termina com 0).
  if (d[0] === "0" || d[1] === "0") return null;
  // Celular com 11 dígitos começa com 9 depois do DDD.
  if (d.length === 11 && d[2] !== "9") return null;
  return `55${d}`;
}

/** "5591988887777" → "(91) 98888-7777". */
export function formatarWhatsapp(digitos: string): string {
  const d = digitos.startsWith("55") && digitos.length >= 12 ? digitos.slice(2) : digitos;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

/** Link que abre a conversa no WhatsApp já com uma mensagem sobre o anúncio. */
export function linkWhatsapp(digitos: string, titulo: string): string {
  const numero = digitos.replace(/\D/g, "");
  const mensagem = `Olá! Vi seu anúncio "${titulo}" nos classificados do condomínio.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

// ---------- Conteúdo ----------

/** CPF escrito no formato 000.000.000-00: não deixamos publicar (LGPD). */
const REGEX_CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;
/** Sequência que parece número de cartão (15 a 19 dígitos, com ou sem espaço; telefone com 55 tem só 13). */
const REGEX_CARTAO = /\b(?:\d[ -]?){15,19}\b/;

/** Procura dados que não devem ir para um anúncio. Retorna a explicação ou null. */
export function problemaNoConteudo(texto: string): string | null {
  if (REGEX_CPF.test(texto)) return "Tire o CPF do anúncio: ele ficaria visível para todos.";
  if (REGEX_CARTAO.test(texto)) return "Tire números de cartão ou conta do anúncio: eles ficariam visíveis para todos.";
  return null;
}
