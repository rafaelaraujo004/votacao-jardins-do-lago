import "server-only";
import type { Contexto } from "../contexto";
import { reservasDoMesParaAgenda } from "./reservas";
import { dataCurta, dataISO, diasNoMes, type EventoAgenda, type TipoEvento } from "@/lib/agenda";

/**
 * Eventos da agenda de um mês (mes de 1 a 12).
 * - Dados REAIS: reservas das áreas de lazer (sem mostrar a casa dos outros).
 * - Eventos de EXEMPLO só no modo de demonstração (sempre marcados como exemplo).
 *   Se já houver reservas reais, os exemplos de reserva/piscina somem e ficam só
 *   os de taxa e assembleia (que ainda não têm cadastro no portal).
 * - No uso real, nunca inventamos eventos.
 */
export async function eventosDoMes(ctx: Contexto, ano: number, mes: number): Promise<EventoAgenda[]> {
  let reais: EventoAgenda[] = [];
  try {
    reais = await reservasDoMesParaAgenda(ctx, ano, mes);
  } catch (erro) {
    // Se as reservas falharem, o Início continua abrindo.
    console.error("Agenda: não foi possível carregar as reservas", erro);
  }
  if (!ctx.demo) return reais;

  const modelos: { dia: number; tipo: TipoEvento; titulo: string; extra: string }[] = [
    { dia: 10, tipo: "taxa", titulo: "Vencimento da taxa condominial", extra: "boleto do mês" },
    { dia: 15, tipo: "salao", titulo: "Reserva do salão de festas", extra: "14h às 22h" },
    { dia: 19, tipo: "piscina", titulo: "Manutenção da piscina", extra: "fechada das 8h às 12h" },
    { dia: 22, tipo: "salao", titulo: "Reserva do salão de festas", extra: "12h às 18h" },
    { dia: 28, tipo: "assembleia", titulo: "Assembleia e votação", extra: "9h, no salão" },
  ];
  const ultimoDia = diasNoMes(ano, mes);
  const exemplos = modelos
    .filter((m) => m.dia <= ultimoDia)
    .filter((m) => !reais.length || m.tipo === "taxa" || m.tipo === "assembleia")
    .map((m): EventoAgenda => {
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

  // Junta tudo em ordem de data.
  return [...reais, ...exemplos].sort((a, b) => a.data.localeCompare(b.data));
}
