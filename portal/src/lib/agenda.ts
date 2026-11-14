/**
 * Tipos e ajudantes da agenda do condomínio (usados no servidor e na tela).
 * Datas sempre no formato "AAAA-MM-DD", já no fuso do condomínio.
 */

export type TipoEvento = "taxa" | "salao" | "piscina" | "manutencao" | "assembleia" | "votacao";

export type EventoAgenda = {
  id: string;
  data: string; // "AAAA-MM-DD"
  tipo: TipoEvento;
  titulo: string;
  detalhe: string;
  /** true = evento de EXEMPLO (só no modo de demonstração). */
  exemplo: boolean;
};

/** Cor do pontinho de cada tipo (cores das pétalas da logo). */
export const COR_EVENTO: Record<TipoEvento, string> = {
  taxa: "bg-petala-laranja",
  salao: "bg-petala-rosa",
  piscina: "bg-petala-azul",
  manutencao: "bg-petala-azul",
  assembleia: "bg-petala-roxo",
  votacao: "bg-petala-roxo",
};

/** Legenda do calendário (uma linha por cor). */
export const LEGENDA_AGENDA: { cor: string; texto: string }[] = [
  { cor: "bg-petala-laranja", texto: "Vencimento da taxa" },
  { cor: "bg-petala-rosa", texto: "Reserva do salão" },
  { cor: "bg-petala-azul", texto: "Piscina e manutenção" },
  { cor: "bg-petala-roxo", texto: "Assembleia e votação" },
];

const DIAS_CURTOS = ["Dom.", "Seg.", "Ter.", "Qua.", "Qui.", "Sex.", "Sáb."];
const MESES_CURTOS = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];

/** Monta "AAAA-MM-DD". */
export function dataISO(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Dia da semana de uma data (0 = domingo). Usa UTC só para contar, sem fuso. */
export function diaDaSemana(ano: number, mes: number, dia: number): number {
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

/** Quantos dias tem o mês (mes de 1 a 12). */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** "2026-11-10" → "Ter., 10/11" */
export function dataCurta(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return `${DIAS_CURTOS[diaDaSemana(ano, mes, dia)]}, ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
}

/** "2026-11-10" → "nov." */
export function mesCurto(iso: string): string {
  return MESES_CURTOS[Number(iso.slice(5, 7)) - 1];
}
