import "server-only";
import type { CondominioPublico } from "../publico";
import { reservasPublicasDoMes } from "./publico";
import { dataCurta, dataISO, diasNoMes, type EventoAgenda, type TipoEvento } from "@/lib/agenda";

/**
 * Eventos da agenda de um mês (mes de 1 a 12).
 * Esta agenda é PÚBLICA (link dos moradores, sem login):
 * - Dados REAIS: reservas confirmadas e horários fechados, mostrados só como
 *   "Salão de festas reservado" — nunca com a casa ou o nome de quem reservou.
 * - Eventos de EXEMPLO só no condomínio de demonstração (sempre marcados como exemplo).
 *   Se já houver qualquer evento real no mês, nenhum exemplo aparece.
 * - No uso real, nunca inventamos eventos.
 */
export async function eventosDoMes(cp: CondominioPublico, ano: number, mes: number): Promise<EventoAgenda[]> {
  let reais: EventoAgenda[] = [];
  try {
    reais = await reservasPublicasDoMes(cp, ano, mes);
  } catch (erro) {
    // Se as reservas falharem, o Início continua abrindo.
    console.error("Agenda: não foi possível carregar as reservas", erro);
  }
  // Exemplos só no condomínio de demonstração E quando ainda não há nada de verdade.
  if (!cp.demo || reais.length) return reais;

  const modelos: { dia: number; tipo: TipoEvento; titulo: string; extra: string }[] = [
    { dia: 10, tipo: "taxa", titulo: "Vencimento da taxa condominial", extra: "boleto do mês" },
    { dia: 15, tipo: "salao", titulo: "Salão de festas reservado", extra: "14h às 22h" },
    { dia: 19, tipo: "piscina", titulo: "Manutenção da piscina", extra: "fechada das 8h às 12h" },
    { dia: 22, tipo: "salao", titulo: "Salão de festas reservado", extra: "12h às 18h" },
    { dia: 28, tipo: "assembleia", titulo: "Assembleia e votação", extra: "9h, no salão" },
  ];
  const ultimoDia = diasNoMes(ano, mes);
  const exemplos = modelos
    .filter((m) => m.dia <= ultimoDia)
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

  return exemplos.sort((a, b) => a.data.localeCompare(b.data));
}
