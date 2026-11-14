/**
 * Regras das reservas das áreas de lazer (código "puro": roda no servidor,
 * na tela e nos testes, sem banco).
 *
 * Datas sempre "AAAA-MM-DD" e horários "HH:MM", já no fuso do condomínio.
 */
import { FUSO_PADRAO } from "./formato";

// ---------- Tipos ----------

/** Faixa de horário fixa de uma área (ex.: "Manhã", 08:00 às 12:00). */
export type Faixa = { id: string; rotulo: string; inicio: string; fim: string };

/** Situação gravada em cada reserva. "bloqueada" = horário fechado pela administração. */
export const STATUS_RESERVA = ["pendente", "confirmada", "bloqueada", "recusada", "cancelada"] as const;
export type StatusReserva = (typeof STATUS_RESERVA)[number];

/** Situações que OCUPAM o horário (as outras liberam). */
export const STATUS_ATIVOS: readonly StatusReserva[] = ["pendente", "confirmada", "bloqueada"];

export function ocupaHorario(status: StatusReserva): boolean {
  return STATUS_ATIVOS.includes(status);
}

/** Como a faixa aparece no dia: livre ou ocupada por algum motivo. */
export type EstadoFaixa = "livre" | "pendente" | "confirmada" | "bloqueada";

/** Configuração de uma área de lazer (documento amenities/{id}). */
export type ConfigArea = {
  id: string;
  nome: string;
  regras: string;
  capacidade: number;
  exigeAprovacao: boolean;
  /** Com quantos dias de antecedência, no mínimo, dá para pedir (0 = pode ser no mesmo dia). */
  antecedenciaMinDias: number;
  /** Até quantos dias à frente dá para pedir. */
  antecedenciaMaxDias: number;
  /** Máximo de reservas por casa, por mês, nesta área (0 = sem limite). */
  limitePorMes: number;
  ativa: boolean;
  faixas: Faixa[];
  ordem: number;
};

// ---------- Horários ----------

export const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
export const REGEX_DATA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const REGEX_MES_RESERVA = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "08:30" → 510 (minutos desde a meia-noite). */
export function horaParaMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/** "08:00" → "08h"; "08:30" → "08h30". */
export function horaCurta(hora: string): string {
  const [h, m] = hora.split(":");
  return m === "00" ? `${h}h` : `${h}h${m}`;
}

/** "Manhã · 08h às 12h" */
export function descreverFaixa(f: Pick<Faixa, "rotulo" | "inicio" | "fim">): string {
  return `${f.rotulo} · ${horaCurta(f.inicio)} às ${horaCurta(f.fim)}`;
}

/** Identificador estável da faixa a partir do horário: "08:00–12:00" → "0800-1200". */
export function idDaFaixa(inicio: string, fim: string): string {
  return `${inicio.replace(":", "")}-${fim.replace(":", "")}`;
}

/** Duas faixas se sobrepõem? (encostar não conta: 12:00–13:00 e 13:00–14:00 podem.) */
export function sobrepoe(a: Pick<Faixa, "inicio" | "fim">, b: Pick<Faixa, "inicio" | "fim">): boolean {
  return horaParaMinutos(a.inicio) < horaParaMinutos(b.fim) && horaParaMinutos(b.inicio) < horaParaMinutos(a.fim);
}

export const MAX_FAIXAS = 24;

/**
 * Confere a lista de faixas de uma área. Retorna a mensagem do primeiro
 * problema, ou null se estiver tudo certo.
 */
export function validarFaixas(faixas: Pick<Faixa, "rotulo" | "inicio" | "fim">[]): string | null {
  if (faixas.length === 0) return "Cadastre pelo menos uma faixa de horário.";
  if (faixas.length > MAX_FAIXAS) return `No máximo ${MAX_FAIXAS} faixas por área.`;
  for (const f of faixas) {
    if (!f.rotulo.trim()) return "Dê um nome a cada faixa (ex.: Manhã).";
    if (!REGEX_HORA.test(f.inicio) || !REGEX_HORA.test(f.fim)) return `Horário inválido na faixa "${f.rotulo}". Use HH:MM.`;
    if (horaParaMinutos(f.fim) <= horaParaMinutos(f.inicio)) {
      return `Na faixa "${f.rotulo}" o fim precisa ser depois do início.`;
    }
  }
  for (let i = 0; i < faixas.length; i++) {
    for (let j = i + 1; j < faixas.length; j++) {
      if (sobrepoe(faixas[i], faixas[j])) {
        return `As faixas "${faixas[i].rotulo}" e "${faixas[j].rotulo}" têm horários sobrepostos.`;
      }
      if (faixas[i].inicio === faixas[j].inicio && faixas[i].fim === faixas[j].fim) {
        return `A faixa "${faixas[j].rotulo}" repete o horário de "${faixas[i].rotulo}".`;
      }
    }
  }
  return null;
}

/** Ordena pelo início e dá a cada faixa o id calculado do horário. */
export function normalizarFaixas(faixas: Pick<Faixa, "rotulo" | "inicio" | "fim">[]): Faixa[] {
  return faixas
    .map((f) => ({ rotulo: f.rotulo.trim(), inicio: f.inicio, fim: f.fim, id: idDaFaixa(f.inicio, f.fim) }))
    .sort((a, b) => horaParaMinutos(a.inicio) - horaParaMinutos(b.inicio));
}

// ---------- Datas ----------

function paraUTC(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

/** "2026-11-30" + 1 → "2026-12-01". Conta em UTC só para somar dias (sem fuso). */
export function somarDias(iso: string, dias: number): string {
  return new Date(paraUTC(iso) + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Quantos dias de `de` até `ate` (negativo se `ate` for antes). */
export function diferencaDias(de: string, ate: string): number {
  return Math.round((paraUTC(ate) - paraUTC(de)) / 86_400_000);
}

/** A data existe de verdade? (ex.: 2026-02-30 não existe) */
export function dataValida(iso: string): boolean {
  return REGEX_DATA.test(iso) && somarDias(iso, 0) === iso;
}

/** Minutos desde a meia-noite AGORA, no fuso do condomínio. */
export function minutosAgora(agora = new Date(), fuso = FUSO_PADRAO): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: fuso, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(agora)
      .map((x) => [x.type, x.value]),
  );
  return Number(p.hour) * 60 + Number(p.minute);
}

/** "2026-11" → "2026-12" */
export function proximoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

/** "2026-11" → "2026-10" */
export function mesAnteriorDe(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

// ---------- Regras do pedido ----------

export type PedidoParaConferir = {
  area: Pick<ConfigArea, "ativa" | "antecedenciaMinDias" | "antecedenciaMaxDias" | "limitePorMes">;
  data: string;
  faixa: Pick<Faixa, "inicio">;
  /** Hoje no fuso do condomínio. */
  hoje: string;
  /** Minutos desde a meia-noite agora, no fuso do condomínio. */
  agoraMinutos: number;
  /** Quantas reservas ATIVAS a casa já tem nesta área, no mês da data pedida. */
  reservasDaCasaNoMes: number;
  /**
   * true quando quem reserva é a administração: ela pode reservar fora da
   * antecedência e acima do limite mensal (mas nunca no passado nem em área inativa).
   */
  peloAdmin?: boolean;
};

/** Confere as regras de um pedido. Retorna a explicação do problema, ou null se pode reservar. */
export function conferirPedido(p: PedidoParaConferir): string | null {
  if (!p.area.ativa) return "Esta área não está recebendo reservas no momento.";
  if (!dataValida(p.data)) return "Data inválida.";
  const dias = diferencaDias(p.hoje, p.data);
  if (dias < 0) return "Não é possível reservar uma data que já passou.";
  if (dias === 0 && horaParaMinutos(p.faixa.inicio) <= p.agoraMinutos) {
    return "Esse horário já começou. Escolha outro.";
  }
  if (p.peloAdmin) return null;
  if (dias < p.area.antecedenciaMinDias) {
    return p.area.antecedenciaMinDias === 1
      ? "Esta área precisa ser reservada com pelo menos 1 dia de antecedência."
      : `Esta área precisa ser reservada com pelo menos ${p.area.antecedenciaMinDias} dias de antecedência.`;
  }
  if (dias > p.area.antecedenciaMaxDias) {
    return `Só é possível reservar até ${p.area.antecedenciaMaxDias} dias à frente.`;
  }
  if (p.area.limitePorMes > 0 && p.reservasDaCasaNoMes >= p.area.limitePorMes) {
    return p.area.limitePorMes === 1
      ? "Sua casa já tem 1 reserva nesta área neste mês (o limite é 1)."
      : `Sua casa já tem ${p.reservasDaCasaNoMes} reservas nesta área neste mês (o limite é ${p.area.limitePorMes}).`;
  }
  return null;
}

/** Primeiro e último dia que o MORADOR pode escolher numa área. */
export function janelaDoMorador(area: Pick<ConfigArea, "antecedenciaMinDias" | "antecedenciaMaxDias">, hoje: string) {
  return { primeiro: somarDias(hoje, area.antecedenciaMinDias), ultimo: somarDias(hoje, area.antecedenciaMaxDias) };
}

/** O morador ainda pode cancelar? Só reservas ativas (não bloqueios) que ainda não começaram. */
export function podeCancelarMorador(
  r: { status: StatusReserva; data: string; inicio: string },
  hoje: string,
  agoraMinutos: number,
): boolean {
  if (r.status !== "pendente" && r.status !== "confirmada") return false;
  if (r.data > hoje) return true;
  return r.data === hoje && horaParaMinutos(r.inicio) > agoraMinutos;
}

// ---------- Trava (reservationLocks) ----------

/**
 * ID fixo da trava de um horário: "{area}_{data}_{faixa}".
 * Duas pessoas pedindo o mesmo horário ao mesmo tempo: só uma transação
 * consegue criar este documento.
 */
export function idDaTrava(areaId: string, data: string, faixaId: string): string {
  return `${areaId}_${data}_${faixaId}`;
}

// ---------- Situação das faixas num dia ----------

/** O mínimo de uma reserva que a tela precisa para montar o dia. */
export type ReservaNoDia = {
  id: string;
  faixaId: string;
  inicio: string;
  fim: string;
  status: StatusReserva;
};

/**
 * Para cada faixa da área, diz se está livre ou ocupada (e por qual reserva).
 * Uma reserva ocupa qualquer faixa com horário sobreposto (protege quando a
 * administração muda as faixas e já existem reservas no horário antigo).
 */
export function situacaoDasFaixas<R extends ReservaNoDia>(
  faixas: Faixa[],
  reservasDoDia: R[],
): { faixa: Faixa; estado: EstadoFaixa; reserva: R | null }[] {
  const ativas = reservasDoDia.filter((r) => ocupaHorario(r.status));
  return faixas.map((faixa) => {
    const reserva =
      ativas.find((r) => r.faixaId === faixa.id) ?? ativas.find((r) => sobrepoe(r, faixa)) ?? null;
    return { faixa, estado: reserva ? (reserva.status as EstadoFaixa) : "livre", reserva };
  });
}

/** Reservas ativas do dia que não batem com nenhuma faixa atual (faixa antiga, alterada depois). */
export function reservasForaDasFaixas<R extends ReservaNoDia>(faixas: Faixa[], reservasDoDia: R[]): R[] {
  return reservasDoDia.filter((r) => ocupaHorario(r.status) && !faixas.some((f) => f.id === r.faixaId || sobrepoe(r, f)));
}

/** Quantas faixas livres sobram num dia. */
export function faixasLivres(faixas: Faixa[], reservasDoDia: ReservaNoDia[]): number {
  return situacaoDasFaixas(faixas, reservasDoDia).filter((s) => s.estado === "livre").length;
}

// ---------- Textos ----------

export const ROTULO_STATUS: Record<StatusReserva | "livre", string> = {
  livre: "Livre",
  pendente: "Aguardando aprovação",
  confirmada: "Confirmada",
  bloqueada: "Bloqueada",
  recusada: "Recusada",
  cancelada: "Cancelada",
};

// ---------- Áreas sugeridas ----------

/** Faixas de 1 hora entre duas horas cheias (ex.: 7 a 22 → 07h–08h ... 21h–22h). */
export function faixasDeUmaHora(de: number, ate: number): Faixa[] {
  const lista: Faixa[] = [];
  for (let h = de; h < ate; h++) {
    const inicio = `${String(h).padStart(2, "0")}:00`;
    const fim = `${String(h + 1).padStart(2, "0")}:00`;
    lista.push({ id: idDaFaixa(inicio, fim), rotulo: `${horaCurta(inicio)} às ${horaCurta(fim)}`, inicio, fim });
  }
  return lista;
}

function faixa(rotulo: string, inicio: string, fim: string): Faixa {
  return { id: idDaFaixa(inicio, fim), rotulo, inicio, fim };
}

/**
 * Sugestão inicial (botão "Criar áreas sugeridas"). Sem taxas: valores, se
 * houver, são decididos em assembleia e entram depois.
 *
 * A PISCINA ficou de fora: é de uso livre, sem reserva. Manutenções da piscina
 * entram na agenda geral do condomínio, não aqui.
 */
export const AREAS_SUGERIDAS: ConfigArea[] = [
  {
    id: "salao-de-festas",
    nome: "Salão de festas",
    regras:
      "Uso das 10h às 23h. Som baixo depois das 22h. Devolver limpo e organizado. O responsável pela reserva responde por danos.",
    capacidade: 80,
    exigeAprovacao: true,
    antecedenciaMinDias: 3,
    antecedenciaMaxDias: 90,
    limitePorMes: 1,
    ativa: true,
    faixas: [faixa("Dia inteiro", "10:00", "23:00")],
    ordem: 1,
  },
  {
    id: "churrasqueira",
    nome: "Churrasqueira",
    regras: "Levar o próprio carvão e utensílios. Deixar a grelha e a bancada limpas. Som baixo depois das 22h.",
    capacidade: 30,
    exigeAprovacao: true,
    antecedenciaMinDias: 1,
    antecedenciaMaxDias: 60,
    limitePorMes: 2,
    ativa: true,
    faixas: [faixa("Almoço", "10:00", "16:00"), faixa("Noite", "17:00", "23:00")],
    ordem: 2,
  },
  {
    id: "quadra-poliesportiva",
    nome: "Quadra poliesportiva",
    regras: "Reserva de 1 hora. Usar calçado adequado. Crianças menores de 12 anos acompanhadas de um adulto.",
    capacidade: 20,
    exigeAprovacao: false,
    antecedenciaMinDias: 0,
    antecedenciaMaxDias: 14,
    limitePorMes: 8,
    ativa: true,
    faixas: faixasDeUmaHora(7, 22),
    ordem: 3,
  },
];
