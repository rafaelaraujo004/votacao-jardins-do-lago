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

/** Área de lazer (salão, churrasqueira...) ou equipamento emprestado (roçadeira, carrinho de mão...). */
export const TIPOS_AREA = ["area", "equipamento"] as const;
export type TipoArea = (typeof TIPOS_AREA)[number];

/** Horário de uso livre (sem reserva). Só aparece na agenda como informação. */
export type FaixaLivre = { rotulo: string; inicio: string; fim: string };

/** Configuração de uma área de lazer ou equipamento (documento amenities/{id}). */
export type ConfigArea = {
  id: string;
  /** "area" (salão, quadra...) ou "equipamento" (roçadeira, carrinho de mão...). */
  tipo: TipoArea;
  nome: string;
  regras: string;
  capacidade: number;
  exigeAprovacao: boolean;
  /** Com quantas HORAS de antecedência, no mínimo, dá para pedir (0 = até o horário começar). */
  antecedenciaMinimaHoras: number;
  /** Até quantos dias à frente dá para pedir. */
  antecedenciaMaxDias: number;
  /**
   * Prazo de desistência em horas: se o morador cancelar uma reserva CONFIRMADA
   * faltando menos que isso para começar, fica registrado "fora do prazo"
   * (sujeito a multa conforme o regimento). 0 = sem prazo.
   */
  prazoDesistenciaHoras: number;
  /** Máximo de reservas por casa, por mês, nesta área (0 = sem limite). */
  limitePorMes: number;
  /** Máximo de reservas por casa no MESMO DIA nesta área (null = sem limite). */
  limitePorCasaPorDia: number | null;
  /** Pode passar do limite do dia quando NENHUMA outra casa reservou a área naquele dia. */
  permitirExtraSeDiaLivre: boolean;
  /** Regras que o morador precisa aceitar ("Li e concordo") antes de pedir. */
  exigencias: string[];
  /** Avisos que aparecem em destaque na tela da área. */
  avisos: string[];
  /** Horários de uso livre, sem reserva (só informativo; não são reserváveis). */
  faixasLivres: FaixaLivre[];
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

/** Problemas comuns de uma lista de horários (nome, formato, fim depois do início, sobreposição). */
function problemaNaLista(faixas: Pick<Faixa, "rotulo" | "inicio" | "fim">[], nome: string): string | null {
  for (const f of faixas) {
    if (!f.rotulo.trim()) return `Dê um nome a cada ${nome} (ex.: Manhã).`;
    if (!REGEX_HORA.test(f.inicio) || !REGEX_HORA.test(f.fim)) return `Horário inválido na ${nome} "${f.rotulo}". Use HH:MM.`;
    if (horaParaMinutos(f.fim) <= horaParaMinutos(f.inicio)) {
      return `Na ${nome} "${f.rotulo}" o fim precisa ser depois do início.`;
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

/**
 * Confere a lista de faixas de uma área. Retorna a mensagem do primeiro
 * problema, ou null se estiver tudo certo.
 */
export function validarFaixas(faixas: Pick<Faixa, "rotulo" | "inicio" | "fim">[]): string | null {
  if (faixas.length === 0) return "Cadastre pelo menos uma faixa de horário.";
  if (faixas.length > MAX_FAIXAS) return `No máximo ${MAX_FAIXAS} faixas por área.`;
  return problemaNaLista(faixas, "faixa");
}

export const MAX_FAIXAS_LIVRES = 12;

/**
 * Confere as faixas de USO LIVRE: não podem se sobrepor entre si nem com as
 * faixas reserváveis (senão o morador não saberia se precisa reservar).
 */
export function validarFaixasLivres(
  livres: FaixaLivre[],
  faixas: Pick<Faixa, "rotulo" | "inicio" | "fim">[],
): string | null {
  if (livres.length > MAX_FAIXAS_LIVRES) return `No máximo ${MAX_FAIXAS_LIVRES} faixas de uso livre.`;
  const problema = problemaNaLista(livres, "faixa de uso livre");
  if (problema) return problema;
  for (const l of livres) {
    const choque = faixas.find((f) => sobrepoe(f, l));
    if (choque) return `O uso livre "${l.rotulo}" coincide com a faixa reservável "${choque.rotulo}". Ajuste os horários.`;
  }
  return null;
}

/** Ordena as faixas de uso livre pelo início. */
export function normalizarFaixasLivres(livres: FaixaLivre[]): FaixaLivre[] {
  return livres
    .map((f) => ({ rotulo: f.rotulo.trim(), inicio: f.inicio, fim: f.fim }))
    .sort((a, b) => horaParaMinutos(a.inicio) - horaParaMinutos(b.inicio));
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

/** Minutos que faltam de AGORA até o início de um horário (negativo se já começou). */
export function minutosAteInicio(r: { data: string; inicio: string }, hoje: string, agoraMinutos: number): number {
  return diferencaDias(hoje, r.data) * 1440 + horaParaMinutos(r.inicio) - agoraMinutos;
}

/** "1 hora", "12 horas", "48 horas (2 dias)". */
export function textoHoras(horas: number): string {
  if (horas === 1) return "1 hora";
  if (horas >= 24 && horas % 24 === 0) {
    const dias = horas / 24;
    return `${horas} horas (${dias} ${dias === 1 ? "dia" : "dias"})`;
  }
  return `${horas} horas`;
}

/**
 * Antecedência mínima em horas, aceitando o campo ANTIGO em dias
 * (áreas gravadas antes da mudança: antecedenciaMinDias × 24).
 */
export function antecedenciaEmHoras(d: { antecedenciaMinimaHoras?: unknown; antecedenciaMinDias?: unknown } | undefined): number {
  const horas = d?.antecedenciaMinimaHoras;
  if (typeof horas === "number" && Number.isFinite(horas) && horas >= 0) return horas;
  const dias = d?.antecedenciaMinDias;
  if (typeof dias === "number" && Number.isFinite(dias) && dias >= 0) return dias * 24;
  return 24;
}

export type PedidoParaConferir = {
  area: Pick<
    ConfigArea,
    "ativa" | "antecedenciaMinimaHoras" | "antecedenciaMaxDias" | "limitePorMes" | "limitePorCasaPorDia" | "permitirExtraSeDiaLivre"
  >;
  data: string;
  faixa: Pick<Faixa, "inicio">;
  /** Hoje no fuso do condomínio. */
  hoje: string;
  /** Minutos desde a meia-noite agora, no fuso do condomínio. */
  agoraMinutos: number;
  /** Quantas reservas ATIVAS a casa já tem nesta área, no mês da data pedida. */
  reservasDaCasaNoMes: number;
  /** Quantas reservas ATIVAS (pendentes/confirmadas) a casa já tem nesta área, no dia pedido. */
  reservasDaCasaNoDia?: number;
  /** Quantas reservas ATIVAS (pendentes/confirmadas) de OUTRAS casas existem nesta área, no dia pedido. */
  outrasCasasNoDia?: number;
  /**
   * true quando quem reserva é a administração: ela pode reservar fora da
   * antecedência e acima dos limites (mas nunca no passado nem em área inativa).
   */
  peloAdmin?: boolean;
};

/** Confere as regras de um pedido. Retorna a explicação do problema, ou null se pode reservar. */
export function conferirPedido(p: PedidoParaConferir): string | null {
  if (!p.area.ativa) return "Esta área não está recebendo reservas no momento.";
  if (!dataValida(p.data)) return "Data inválida.";
  const dias = diferencaDias(p.hoje, p.data);
  if (dias < 0) return "Não é possível reservar uma data que já passou.";
  const faltam = minutosAteInicio({ data: p.data, inicio: p.faixa.inicio }, p.hoje, p.agoraMinutos);
  if (faltam <= 0) return "Esse horário já começou. Escolha outro.";
  if (p.peloAdmin) return null;
  if (faltam < p.area.antecedenciaMinimaHoras * 60) {
    return `Esta área precisa ser reservada com pelo menos ${textoHoras(p.area.antecedenciaMinimaHoras)} de antecedência.`;
  }
  if (dias > p.area.antecedenciaMaxDias) {
    return `Só é possível reservar até ${p.area.antecedenciaMaxDias} dias à frente.`;
  }
  if (p.area.limitePorMes > 0 && p.reservasDaCasaNoMes >= p.area.limitePorMes) {
    return p.area.limitePorMes === 1
      ? "Sua casa já tem 1 reserva nesta área neste mês (o limite é 1)."
      : `Sua casa já tem ${p.reservasDaCasaNoMes} reservas nesta área neste mês (o limite é ${p.area.limitePorMes}).`;
  }
  return problemaDoLimiteDoDia(p.area, p.reservasDaCasaNoDia ?? 0, p.outrasCasasNoDia ?? 0);
}

/**
 * Limite por casa no mesmo dia. Com "permitirExtraSeDiaLivre", a casa pode
 * passar do limite quando NENHUMA outra casa tem reserva na área naquele dia.
 */
export function problemaDoLimiteDoDia(
  area: Pick<ConfigArea, "limitePorCasaPorDia" | "permitirExtraSeDiaLivre">,
  reservasDaCasaNoDia: number,
  outrasCasasNoDia: number,
): string | null {
  const limite = area.limitePorCasaPorDia;
  if (limite === null || limite <= 0 || reservasDaCasaNoDia < limite) return null;
  if (area.permitirExtraSeDiaLivre && outrasCasasNoDia === 0) return null;
  const base =
    limite === 1
      ? "Sua casa já tem 1 reserva nesta área neste dia (o limite é 1 por dia)."
      : `Sua casa já tem ${reservasDaCasaNoDia} reservas nesta área neste dia (o limite é ${limite} por dia).`;
  return area.permitirExtraSeDiaLivre
    ? `${base} Outra casa já reservou este dia, então não dá para passar do limite.`
    : base;
}

/** Primeiro e último dia que o MORADOR pode escolher numa área. */
export function janelaDoMorador(
  area: Pick<ConfigArea, "antecedenciaMinimaHoras" | "antecedenciaMaxDias">,
  hoje: string,
  agoraMinutos = 0,
) {
  const primeiroMinuto = agoraMinutos + area.antecedenciaMinimaHoras * 60;
  return { primeiro: somarDias(hoje, Math.floor(primeiroMinuto / 1440)), ultimo: somarDias(hoje, area.antecedenciaMaxDias) };
}

/** O morador ainda pode cancelar? Só reservas ativas (não bloqueios) que ainda não começaram. */
export function podeCancelarMorador(
  r: { status: StatusReserva; data: string; inicio: string },
  hoje: string,
  agoraMinutos: number,
): boolean {
  if (r.status !== "pendente" && r.status !== "confirmada") return false;
  return minutosAteInicio(r, hoje, agoraMinutos) > 0;
}

/**
 * A desistência do morador fica FORA DO PRAZO? Só vale para reserva CONFIRMADA
 * (pedido ainda pendente pode ser retirado sem multa) e quando a área tem prazo.
 */
export function desistenciaForaDoPrazo(
  r: { status: StatusReserva; data: string; inicio: string },
  prazoHoras: number,
  hoje: string,
  agoraMinutos: number,
): boolean {
  if (r.status !== "confirmada" || prazoHoras <= 0) return false;
  return minutosAteInicio(r, hoje, agoraMinutos) < prazoHoras * 60;
}

/** Texto da confirmação da desistência fora do prazo. */
export function avisoDesistenciaTardia(prazoHoras: number): string {
  return `Desistência fora do prazo de ${textoHoras(prazoHoras)}: sujeita a multa conforme o regimento.`;
}

/** Contas do dia para o limite por casa: reservas ATIVAS da casa e das outras casas (bloqueios não contam). */
export function contarNoDia(reservas: { status: StatusReserva; minha: boolean }[]): { daCasa: number; outrasCasas: number } {
  const ativas = reservas.filter((r) => r.status === "pendente" || r.status === "confirmada");
  return { daCasa: ativas.filter((r) => r.minha).length, outrasCasas: ativas.filter((r) => !r.minha).length };
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

/** Etiqueta do síndico para desistência fora do prazo. */
export const ROTULO_CANCELADA_TARDE = "Cancelada fora do prazo";

/** Rótulo de uso livre na agenda. */
export const ROTULO_USO_LIVRE = "Uso livre (sem reserva)";

export const ROTULO_TIPO: Record<TipoArea, string> = { area: "Área de lazer", equipamento: "Equipamento" };

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
 * O condomínio real é configurado pelo script do integrador; isto é só um ponto de partida.
 */
export const AREAS_SUGERIDAS: ConfigArea[] = [
  {
    id: "salao-de-festas",
    tipo: "area",
    nome: "Salão de festas",
    regras:
      "Uso das 10h às 23h. Som baixo depois das 22h. Devolver limpo e organizado. O responsável pela reserva responde por danos.",
    capacidade: 80,
    exigeAprovacao: true,
    antecedenciaMinimaHoras: 72,
    antecedenciaMaxDias: 90,
    prazoDesistenciaHoras: 72,
    limitePorMes: 1,
    limitePorCasaPorDia: 1,
    permitirExtraSeDiaLivre: false,
    exigencias: [
      "Devolver o salão limpo e organizado até as 10h do dia seguinte.",
      "O responsável pela reserva responde por danos causados pelos convidados.",
    ],
    avisos: [],
    faixasLivres: [],
    ativa: true,
    faixas: [faixa("Dia inteiro", "10:00", "23:00")],
    ordem: 1,
  },
  {
    id: "churrasqueira",
    tipo: "area",
    nome: "Churrasqueira",
    regras: "Levar o próprio carvão e utensílios. Deixar a grelha e a bancada limpas. Som baixo depois das 22h.",
    capacidade: 30,
    exigeAprovacao: true,
    antecedenciaMinimaHoras: 24,
    antecedenciaMaxDias: 60,
    prazoDesistenciaHoras: 24,
    limitePorMes: 2,
    limitePorCasaPorDia: 1,
    permitirExtraSeDiaLivre: true,
    exigencias: [],
    avisos: [],
    faixasLivres: [],
    ativa: true,
    faixas: [faixa("Almoço", "10:00", "16:00"), faixa("Noite", "17:00", "23:00")],
    ordem: 2,
  },
  {
    id: "quadra-poliesportiva",
    tipo: "area",
    nome: "Quadra poliesportiva",
    regras: "Reserva de 1 hora. Usar calçado adequado. Crianças menores de 12 anos acompanhadas de um adulto.",
    capacidade: 20,
    exigeAprovacao: false,
    antecedenciaMinimaHoras: 0,
    antecedenciaMaxDias: 14,
    prazoDesistenciaHoras: 0,
    limitePorMes: 8,
    limitePorCasaPorDia: 2,
    permitirExtraSeDiaLivre: true,
    exigencias: [],
    avisos: [],
    faixasLivres: [],
    ativa: true,
    faixas: faixasDeUmaHora(7, 22),
    ordem: 3,
  },
  {
    id: "rocadeira",
    tipo: "equipamento",
    nome: "Roçadeira",
    regras: "Retirar e devolver na portaria, no mesmo dia. Devolver limpa.",
    capacidade: 1,
    exigeAprovacao: true,
    antecedenciaMinimaHoras: 24,
    antecedenciaMaxDias: 30,
    prazoDesistenciaHoras: 0,
    limitePorMes: 0,
    limitePorCasaPorDia: 1,
    permitirExtraSeDiaLivre: false,
    exigencias: ["Usar óculos de proteção, calça comprida e calçado fechado.", "Devolver no mesmo dia, limpa e sem danos."],
    avisos: ["Combustível por conta de quem reserva."],
    faixasLivres: [],
    ativa: true,
    faixas: [faixa("Dia inteiro", "07:00", "18:00")],
    ordem: 10,
  },
];
