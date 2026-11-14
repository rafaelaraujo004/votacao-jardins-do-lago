import "server-only";
import type { Contexto } from "../contexto";
import { dataCurta, dataISO, diasNoMes, type EventoAgenda, type TipoEvento } from "@/lib/agenda";

/**
 * Eventos da agenda de um mês (mes de 1 a 12).
 *
 * Ainda NÃO existe cadastro de agenda no portal. Por isso:
 * - no modo de demonstração (ctx.demo), devolve eventos de EXEMPLO, marcados como exemplo;
 * - no uso real, devolve lista vazia (nunca inventamos eventos como se fossem reais).
 */
export async function eventosDoMes(ctx: Contexto, ano: number, mes: number): Promise<EventoAgenda[]> {
  if (!ctx.demo) return [];

  const modelos: { dia: number; tipo: TipoEvento; titulo: string; extra: string }[] = [
    { dia: 10, tipo: "taxa", titulo: "Vencimento da taxa condominial", extra: "boleto do mês" },
    { dia: 15, tipo: "salao", titulo: "Reserva do salão de festas", extra: "14h às 22h" },
    { dia: 19, tipo: "piscina", titulo: "Manutenção da piscina", extra: "fechada das 8h às 12h" },
    { dia: 22, tipo: "salao", titulo: "Reserva do salão de festas", extra: "12h às 18h" },
    { dia: 28, tipo: "assembleia", titulo: "Assembleia e votação", extra: "9h, no salão" },
  ];

  const ultimoDia = diasNoMes(ano, mes);
  return modelos
    .filter((m) => m.dia <= ultimoDia)
    .map((m) => {
      const data = dataISO(ano, mes, m.dia);
      return {
        id: `exemplo-${data}-${m.tipo}`,
        data,
        tipo: m.tipo,
        titulo: m.titulo,
        detalhe: `${dataCurta(data)} · ${m.extra}`,
        exemplo: true,
      };
    });
}
