/**
 * Regras das enquetes (sem banco): situação, resultado e datas.
 *
 * Decisões do projeto:
 * - 1 voto por CASA (não por pessoa). Quem da casa votar primeiro decide;
 * - o voto NÃO pode ser mudado depois (simples e auditável);
 * - o síndico vê só os TOTAIS, nunca qual casa votou em quê;
 * - "resultado": "sempre" (moradores veem a parcial) ou "apos_encerrar".
 */

export const STATUS_ENQUETE = ["rascunho", "aberta", "encerrada"] as const;
export type StatusEnquete = (typeof STATUS_ENQUETE)[number];

export const REGRAS_RESULTADO = ["sempre", "apos_encerrar"] as const;
export type RegraResultado = (typeof REGRAS_RESULTADO)[number];

export const MIN_OPCOES = 2;
export const MAX_OPCOES = 8;

export type OpcaoEnquete = { id: string; texto: string };

/**
 * Situação que a pessoa vê, juntando o status gravado com as datas:
 * - "agendada": publicada, mas ainda não chegou a hora de abrir;
 * - "aberta": dá para votar agora;
 * - "encerrada": encerrada pelo síndico ou o prazo já passou.
 */
export type SituacaoEnquete = "rascunho" | "agendada" | "aberta" | "encerrada";

export const ROTULO_SITUACAO: Record<SituacaoEnquete, string> = {
  rascunho: "Rascunho",
  agendada: "Ainda não abriu",
  aberta: "Aberta",
  encerrada: "Encerrada",
};

export function situacaoEnquete(e: { status: StatusEnquete; abreEm: Date; fechaEm: Date }, agora = new Date()): SituacaoEnquete {
  if (e.status === "rascunho") return "rascunho";
  if (e.status === "encerrada") return "encerrada";
  if (agora.getTime() >= e.fechaEm.getTime()) return "encerrada";
  if (agora.getTime() < e.abreEm.getTime()) return "agendada";
  return "aberta";
}

/** O morador pode ver os números agora? */
export function resultadoVisivelParaMorador(regra: RegraResultado, situacao: SituacaoEnquete): boolean {
  if (situacao === "rascunho") return false;
  return regra === "sempre" || situacao === "encerrada";
}

export type LinhaResultado = { id: string; texto: string; votos: number; porcentagem: number };

/**
 * Totais + porcentagem de cada opção. As porcentagens são inteiras e somam 100
 * (método dos maiores restos), para a tela não mostrar "99%" ou "101%".
 */
export function calcularResultado(opcoes: OpcaoEnquete[], totais: Record<string, number>): { linhas: LinhaResultado[]; total: number } {
  const votos = opcoes.map((o) => {
    const n = totais[o.id];
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  });
  const total = votos.reduce((s, n) => s + n, 0);
  if (total === 0) {
    return { linhas: opcoes.map((o) => ({ id: o.id, texto: o.texto, votos: 0, porcentagem: 0 })), total: 0 };
  }
  const exatas = votos.map((n) => (n * 100) / total);
  const inteiras = exatas.map(Math.floor);
  let falta = 100 - inteiras.reduce((s, n) => s + n, 0);
  const ordem = exatas
    .map((x, i) => ({ i, resto: x - Math.floor(x) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of ordem) {
    if (falta <= 0) break;
    inteiras[i] += 1;
    falta -= 1;
  }
  return {
    linhas: opcoes.map((o, i) => ({ id: o.id, texto: o.texto, votos: votos[i], porcentagem: inteiras[i] })),
    total,
  };
}

/** Opções vencedoras (pode haver empate). Vazio se ninguém votou. */
export function vencedoras(linhas: LinhaResultado[]): string[] {
  const max = Math.max(0, ...linhas.map((l) => l.votos));
  if (max === 0) return [];
  return linhas.filter((l) => l.votos === max).map((l) => l.id);
}

/**
 * Limpa a lista digitada: tira espaços e linhas vazias e dá ids estáveis (o1, o2...).
 * Retorna uma mensagem de erro (texto) se algo estiver errado.
 */
export function montarOpcoes(textos: string[]): OpcaoEnquete[] | string {
  const limpos = textos.map((t) => t.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (limpos.length < MIN_OPCOES) return `Escreva pelo menos ${MIN_OPCOES} opções.`;
  if (limpos.length > MAX_OPCOES) return `Use no máximo ${MAX_OPCOES} opções.`;
  const vistos = new Set<string>();
  for (const t of limpos) {
    const chave = t.toLocaleLowerCase("pt-BR");
    if (vistos.has(chave)) return `A opção "${t}" está repetida.`;
    vistos.add(chave);
  }
  return limpos.map((texto, i) => ({ id: `o${i + 1}`, texto }));
}

// ---------- Datas (o campo "data e hora" do navegador não tem fuso) ----------

export const REGEX_DATA_HORA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Partes da data no fuso pedido, como se fosse UTC (para calcular a diferença). */
function comoUtc(data: Date, fuso: string): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(data).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
}

/**
 * "2026-11-20T18:00" digitado no fuso do condomínio → instante exato (Date).
 * null se o texto não for uma data/hora válida (ex.: 31/02).
 */
export function dataHoraLocalParaDate(texto: string, fuso: string): Date | null {
  const m = REGEX_DATA_HORA.exec(texto.trim());
  if (!m) return null;
  const [, a, me, d, h, mi] = m.map(Number);
  if (h > 23 || mi > 59) return null;
  const comoSeUtc = Date.UTC(a, me - 1, d, h, mi);
  const conferir = new Date(comoSeUtc);
  if (conferir.getUTCFullYear() !== a || conferir.getUTCMonth() !== me - 1 || conferir.getUTCDate() !== d) return null;
  // Ajusta pela diferença do fuso (duas voltas cobrem mudanças de horário de verão).
  let instante = comoSeUtc;
  for (let i = 0; i < 2; i++) {
    const diferenca = comoUtc(new Date(instante), fuso) - instante;
    instante = comoSeUtc - diferenca;
  }
  return new Date(instante);
}

/** Instante → "AAAA-MM-DDTHH:MM" no fuso do condomínio (valor do campo "data e hora"). */
export function dateParaDataHoraLocal(data: Date, fuso: string): string {
  const iso = new Date(comoUtc(data, fuso)).toISOString();
  return iso.slice(0, 16);
}

/** "dd/mm" no fuso do condomínio (ex.: "Sua casa já votou em ... em 12/11"). */
export function diaMes(data: Date, fuso: string): string {
  const iso = dateParaDataHoraLocal(data, fuso);
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Texto curto de casas: "1 casa", "12 casas". */
export function casas(n: number): string {
  return n === 1 ? "1 casa" : `${n} casas`;
}

/** Participação em % (inteiro). 0 se não houver casas ativas. */
export function participacao(votaram: number, ativas: number): number {
  if (ativas <= 0) return 0;
  return Math.min(100, Math.round((votaram * 100) / ativas));
}
