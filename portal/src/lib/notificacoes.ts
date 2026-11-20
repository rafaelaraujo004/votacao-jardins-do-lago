/**
 * NOTIFICAÇÕES (o sino) — regras puras, sem banco (testadas em tests/unit/notificacoes.test.ts).
 *
 * Como funciona, em linguagem simples:
 * - O portal NÃO grava uma notificação para cada casa (seriam 225 gravações a cada
 *   comunicado). A lista é MONTADA na hora em que a pessoa abre o sino, a partir do
 *   que já existe: anúncios aguardando, reservas pendentes, votações, comunicados…
 * - Cada pessoa guarda só UMA data: quando abriu o sino pela última vez
 *   ("notificacoesVistasEm"). O que aconteceu depois disso aparece como "Novo".
 * - Itens que pedem uma ação (aprovar um anúncio, votar) continuam contando no
 *   número do sino até a ação ser feita, mesmo depois de vistos.
 */
import { formatarData } from "./formato";
import type { ModuloSinc } from "./sincronizacao";

export const TIPOS_NOTIFICACAO = [
  // Gestão: precisa de uma decisão da administração
  "anuncio_pendente",
  "reserva_pendente",
  "solicitacao_aberta",
  // Morador: o condomínio informa ou pede participação
  "votacao",
  "enquete",
  "comunicado",
  "documento",
  // Morador: resposta a algo que a casa pediu
  "anuncio_decidido",
  "reserva_decidida",
  "solicitacao_respondida",
  // Portaria
  "visita_autorizada",
] as const;
export type TipoNotificacao = (typeof TIPOS_NOTIFICACAO)[number];

export type TomNotificacao = "ok" | "info" | "aviso" | "erro" | "destaque" | "neutro";

export type Notificacao = {
  /** Chave estável (ex.: "anuncio:abc123"). */
  id: string;
  tipo: TipoNotificacao;
  titulo: string;
  texto: string;
  /** Tela onde a pessoa resolve ou lê. Sempre um caminho interno. */
  href: string;
  /** Quando aconteceu (milissegundos). Decide o "Novo" e a ordem. */
  quando: number;
  /** Pede uma ação da pessoa (aprovar, votar…): conta no sino até ser feita. */
  acao: boolean;
  tom: TomNotificacao;
};

/** Módulos que mudam o que aparece no sino (o sino se atualiza quando um deles muda). */
export const MODULOS_DO_SINO: readonly ModuloSinc[] = [
  "portaria",
  "classificados",
  "reservas",
  "solicitacoes",
  "eleicoes",
  "enquetes",
  "comunicados",
  "documentos",
];

/** Até quantos dias para trás entram comunicados, documentos e respostas. */
export const DIAS_NOTIFICACAO = 30;

/** Teto da lista (o sino mostra as mais importantes primeiro). */
export const LIMITE_NOTIFICACOES = 60;

/** Folga para diferença de relógio: algo de 1 min antes de "visto" ainda conta como novo. */
const FOLGA_MS = 60_000;

/** A notificação é nova para quem viu o sino pela última vez em `vistasEm`? */
export function ehNova(n: Pick<Notificacao, "quando">, vistasEm: number | null): boolean {
  if (vistasEm === null) return true;
  return n.quando > vistasEm - FOLGA_MS;
}

/** O número do sino: o que pede ação + o que é novo (sem contar duas vezes). */
export function contarSino(lista: readonly Notificacao[], vistasEm: number | null): number {
  return lista.filter((n) => n.acao || ehNova(n, vistasEm)).length;
}

/** Texto curto do número do sino ("9+" acima de 9). */
export function rotuloContagem(total: number): string {
  return total > 9 ? "9+" : String(total);
}

/** Ordem: primeiro o que pede ação, depois o mais recente. Devolve uma lista nova. */
export function ordenarNotificacoes(lista: readonly Notificacao[]): Notificacao[] {
  return [...lista].sort((a, b) => Number(b.acao) - Number(a.acao) || b.quando - a.quando);
}

/** Junta, tira repetidas (mesma chave), ordena e corta no teto. */
export function montarLista(partes: readonly (readonly Notificacao[])[]): Notificacao[] {
  const porChave = new Map<string, Notificacao>();
  for (const parte of partes) for (const n of parte) if (!porChave.has(n.id)) porChave.set(n.id, n);
  return ordenarNotificacoes([...porChave.values()]).slice(0, LIMITE_NOTIFICACOES);
}

/** Separa em "Precisa de você" e "Novidades" para a tela. */
export function separarNotificacoes(lista: readonly Notificacao[]): { acao: Notificacao[]; outras: Notificacao[] } {
  const ordenada = ordenarNotificacoes(lista);
  return { acao: ordenada.filter((n) => n.acao), outras: ordenada.filter((n) => !n.acao) };
}

/** Está dentro da janela de dias que o sino mostra? */
export function dentroDaJanela(quando: Date | null, agora: Date, dias = DIAS_NOTIFICACAO): boolean {
  if (!quando) return false;
  const diferenca = agora.getTime() - quando.getTime();
  return diferenca >= -FOLGA_MS && diferenca <= dias * 24 * 60 * 60 * 1000;
}

/** "agora há pouco", "há 15 min", "há 3 h", "ontem", "há 4 dias" ou a data. */
export function quandoFoi(quando: number, agora: number, fuso?: string): string {
  const minutos = Math.floor((agora - quando) / 60_000);
  if (minutos < 2) return "agora há pouco";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  return formatarData(new Date(quando), fuso);
}

/** Lê o que veio da rota /api/notificacoes, ignorando o que estiver fora do formato. */
export function lerNotificacoes(bruto: unknown): Notificacao[] {
  if (!Array.isArray(bruto)) return [];
  const lista: Notificacao[] = [];
  for (const item of bruto) {
    if (!item || typeof item !== "object") continue;
    const n = item as Record<string, unknown>;
    if (
      typeof n.id !== "string" ||
      typeof n.titulo !== "string" ||
      typeof n.texto !== "string" ||
      typeof n.href !== "string" ||
      !n.href.startsWith("/") ||
      n.href.startsWith("//") ||
      typeof n.quando !== "number" ||
      !Number.isFinite(n.quando) ||
      !(TIPOS_NOTIFICACAO as readonly unknown[]).includes(n.tipo)
    ) {
      continue;
    }
    lista.push({
      id: n.id,
      tipo: n.tipo as TipoNotificacao,
      titulo: n.titulo,
      texto: n.texto,
      href: n.href,
      quando: n.quando,
      acao: n.acao === true,
      tom: (["ok", "info", "aviso", "erro", "destaque", "neutro"] as const).find((t) => t === n.tom) ?? "neutro",
    });
  }
  return lista;
}
