/**
 * Relatórios do síndico: contas e somas SEM banco (fáceis de testar).
 *
 * Regra de privacidade: os relatórios mostram só TOTAIS. Nenhuma função
 * daqui recebe ou devolve nome de pessoa ou número de casa.
 */
import { hojeISO } from "./formato";
import { ROTULO_CATEGORIA as ROTULO_CATEGORIA_SOLICITACAO } from "./solicitacoes";

// ---------- Assuntos e ano ----------

export const ASSUNTOS_RELATORIO = ["financeiro", "reservas", "portaria", "solicitacoes"] as const;
export type AssuntoRelatorio = (typeof ASSUNTOS_RELATORIO)[number];

export const NOME_ASSUNTO: Record<AssuntoRelatorio, string> = {
  financeiro: "Financeiro",
  reservas: "Reservas",
  portaria: "Portaria",
  solicitacoes: "Solicitações",
};

export function ehAssunto(v: unknown): v is AssuntoRelatorio {
  return typeof v === "string" && (ASSUNTOS_RELATORIO as readonly string[]).includes(v);
}

/** Quantos anos para trás o seletor oferece (além do ano atual). */
export const ANOS_PARA_TRAS = 4;

/** Ano pedido na tela/link: só vale entre (ano atual − 4) e o ano atual; senão, o ano atual. */
export function anoValido(bruto: unknown, anoAtual: number): number {
  const n = typeof bruto === "string" && /^\d{4}$/.test(bruto) ? Number(bruto) : NaN;
  if (!Number.isInteger(n) || n > anoAtual || n < anoAtual - ANOS_PARA_TRAS) return anoAtual;
  return n;
}

/** Anos do seletor, do mais novo para o mais antigo. */
export function anosDoSeletor(anoAtual: number): number[] {
  return Array.from({ length: ANOS_PARA_TRAS + 1 }, (_, i) => anoAtual - i);
}

/** 2026 → ["2026-01", ..., "2026-12"] */
export function mesesDoAno(ano: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
}

export const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-11" → "nov" */
export function mesCurto(mes: string): string {
  return MESES_CURTOS[Number(mes.slice(5, 7)) - 1] ?? mes;
}

export const DIAS_DA_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "2026-11-14" → 6 (sábado). Conta pelo calendário, sem depender de fuso. */
export function diaDaSemana(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay();
}

/**
 * Instante em que um dia ("AAAA-MM-DD") começa no fuso do condomínio.
 * Ex.: 2026-01-01 em America/Belem (UTC−3) → 2026-01-01T03:00:00Z.
 */
export function inicioDoDia(iso: string, fuso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  const palpite = Date.UTC(a, m - 1, d);
  // Que horas são no fuso quando em UTC é meia-noite? A diferença é o deslocamento.
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: fuso,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(palpite))
      .map((x) => [x.type, x.value]),
  );
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return new Date(palpite - (local - palpite));
}

/** Limites do ano para as consultas: datas "AAAA-MM-DD", meses "AAAA-MM" e instantes (fim exclusivo). */
export function limitesDoAno(ano: number, fuso: string) {
  return {
    dataInicio: `${ano}-01-01`,
    dataFim: `${ano}-12-31`,
    mesInicio: `${ano}-01`,
    mesFim: `${ano}-12`,
    instanteInicio: inicioDoDia(`${ano}-01-01`, fuso),
    instanteFim: inicioDoDia(`${ano + 1}-01-01`, fuso),
  };
}

/** Mês ("AAAA-MM") de um instante, no fuso do condomínio. */
export function mesNoFuso(data: Date, fuso: string): string {
  return hojeISO(data, fuso).slice(0, 7);
}

/** Média em horas (null se a lista estiver vazia). */
export function mediaHoras(duracoesMs: number[]): number | null {
  const validas = duracoesMs.filter((n) => Number.isFinite(n) && n >= 0);
  if (!validas.length) return null;
  return validas.reduce((s, n) => s + n, 0) / validas.length / 3_600_000;
}

/** 0.5 → "30 min"; 5 → "5 h"; 50 → "2 dias e 2 h"; null → "—". */
export function descreverDuracao(horas: number | null): string {
  if (horas === null || !Number.isFinite(horas)) return "—";
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  const totalH = Math.round(horas);
  if (totalH < 24) return `${totalH} h`;
  const dias = Math.floor(totalH / 24);
  const resto = totalH % 24;
  const parteDias = `${dias} ${dias === 1 ? "dia" : "dias"}`;
  return resto ? `${parteDias} e ${resto} h` : parteDias;
}

// ---------- Financeiro ----------

/** O mínimo de cada mês que o relatório usa (vem de mesesComSaldo). */
export type MesFinanceiro = {
  mes: string;
  receitasCentavos: number;
  despesasCentavos: number;
  saldoFinalCentavos: number;
  publicado: boolean;
};

export type LinhaFinanceira = {
  mes: string;
  receitasCentavos: number;
  despesasCentavos: number;
  resultadoCentavos: number;
  /** null quando o mês ainda não tem nenhum lançamento. */
  saldoFinalCentavos: number | null;
  publicado: boolean;
};

export type RelatorioFinanceiro = {
  ano: number;
  linhas: LinhaFinanceira[];
  totais: { receitasCentavos: number; despesasCentavos: number; resultadoCentavos: number };
  /** Saldo no fim do último mês do ano que tem lançamentos (null se nenhum). */
  saldoFinalCentavos: number | null;
  categorias: { nome: string; tipo: "receita" | "despesa"; totalCentavos: number }[];
};

/** Monta as 12 linhas do ano (meses sem lançamento aparecem zerados). */
export function montarFinanceiro(
  ano: number,
  meses: MesFinanceiro[],
  categorias: RelatorioFinanceiro["categorias"] = [],
): RelatorioFinanceiro {
  const porMes = new Map(meses.map((m) => [m.mes, m]));
  const linhas = mesesDoAno(ano).map((mes): LinhaFinanceira => {
    const m = porMes.get(mes);
    return {
      mes,
      receitasCentavos: m?.receitasCentavos ?? 0,
      despesasCentavos: m?.despesasCentavos ?? 0,
      resultadoCentavos: (m?.receitasCentavos ?? 0) - (m?.despesasCentavos ?? 0),
      saldoFinalCentavos: m ? m.saldoFinalCentavos : null,
      publicado: m?.publicado ?? false,
    };
  });
  const receitas = linhas.reduce((s, l) => s + l.receitasCentavos, 0);
  const despesas = linhas.reduce((s, l) => s + l.despesasCentavos, 0);
  const ultimo = [...linhas].reverse().find((l) => l.saldoFinalCentavos !== null);
  return {
    ano,
    linhas,
    totais: { receitasCentavos: receitas, despesasCentavos: despesas, resultadoCentavos: receitas - despesas },
    saldoFinalCentavos: ultimo?.saldoFinalCentavos ?? null,
    categorias: [...categorias].sort((a, b) => (a.tipo === b.tipo ? b.totalCentavos - a.totalCentavos : a.tipo === "receita" ? -1 : 1)),
  };
}

/** Junta os totais por categoria de vários meses (mesma categoria = mesmo nome e tipo). */
export function somarCategorias(listas: { nome: string; tipo: "receita" | "despesa"; totalCentavos: number }[][]) {
  const mapa = new Map<string, { nome: string; tipo: "receita" | "despesa"; totalCentavos: number }>();
  for (const lista of listas) {
    for (const c of lista) {
      const chave = `${c.tipo}|${c.nome}`;
      const atual = mapa.get(chave) ?? { nome: c.nome, tipo: c.tipo, totalCentavos: 0 };
      atual.totalCentavos += c.totalCentavos;
      mapa.set(chave, atual);
    }
  }
  return [...mapa.values()].filter((c) => c.totalCentavos !== 0);
}

// ---------- Reservas ----------

/** O mínimo de cada reserva que o relatório usa (sem casa, sem nome). */
export type ReservaParaRelatorio = {
  areaNome: string;
  mes: string;
  status: string;
  /** Ausente em reservas antigas: conta como false. */
  cancelamentoTardio?: unknown;
};

export type ContagemReservas = { confirmadas: number; canceladas: number; tardias: number; outras: number; total: number };

export type RelatorioReservas = {
  ano: number;
  porMes: ({ mes: string } & ContagemReservas)[];
  porArea: ({ area: string } & ContagemReservas)[];
  totais: ContagemReservas;
};

const contagemVazia = (): ContagemReservas => ({ confirmadas: 0, canceladas: 0, tardias: 0, outras: 0, total: 0 });

function contarReserva(c: ContagemReservas, r: ReservaParaRelatorio) {
  c.total += 1;
  if (r.status === "confirmada") c.confirmadas += 1;
  else if (r.status === "cancelada") {
    c.canceladas += 1;
    if (r.cancelamentoTardio === true) c.tardias += 1;
  } else c.outras += 1; // pendentes e recusadas
}

/**
 * Soma as reservas do ano por mês e por área.
 * Bloqueios da administração NÃO contam (não são reservas de moradores).
 */
export function agregarReservas(ano: number, reservas: ReservaParaRelatorio[]): RelatorioReservas {
  const meses = mesesDoAno(ano);
  const porMes = new Map(meses.map((m) => [m, contagemVazia()]));
  const porArea = new Map<string, ContagemReservas>();
  const totais = contagemVazia();
  for (const r of reservas) {
    if (r.status === "bloqueada") continue;
    const doMes = porMes.get(r.mes);
    if (!doMes) continue; // fora do ano
    const area = r.areaNome.trim() || "Área sem nome";
    if (!porArea.has(area)) porArea.set(area, contagemVazia());
    contarReserva(doMes, r);
    contarReserva(porArea.get(area)!, r);
    contarReserva(totais, r);
  }
  return {
    ano,
    porMes: meses.map((mes) => ({ mes, ...porMes.get(mes)! })),
    porArea: [...porArea.entries()]
      .map(([area, c]) => ({ area, ...c }))
      .sort((a, b) => b.total - a.total || a.area.localeCompare(b.area, "pt-BR")),
    totais,
  };
}

// ---------- Portaria ----------

export type EncomendaParaRelatorio = {
  dataRecebimento: string;
  status: string;
  recebidoEm: Date | null;
  entregueEm: Date | null;
};

export type RelatorioPortaria = {
  ano: number;
  entradas: {
    total: number;
    /** 7 posições: domingo (0) a sábado (6). */
    porDiaSemana: number[];
    porMes: { mes: string; total: number }[];
  };
  encomendas: {
    recebidas: number;
    entregues: number;
    aguardando: number;
    tempoMedioHoras: number | null;
    porMes: { mes: string; recebidas: number; entregues: number }[];
  };
};

/** `datasEntradas`: a data ("AAAA-MM-DD") de cada ENTRADA registrada no ano. */
export function agregarPortaria(ano: number, datasEntradas: string[], encomendas: EncomendaParaRelatorio[]): RelatorioPortaria {
  const meses = mesesDoAno(ano);
  const prefixo = `${ano}-`;
  const porDiaSemana = [0, 0, 0, 0, 0, 0, 0];
  const entradasMes = new Map(meses.map((m) => [m, 0]));
  let totalEntradas = 0;
  for (const data of datasEntradas) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !data.startsWith(prefixo)) continue;
    totalEntradas += 1;
    porDiaSemana[diaDaSemana(data)] += 1;
    const mes = data.slice(0, 7);
    entradasMes.set(mes, (entradasMes.get(mes) ?? 0) + 1);
  }

  const encMes = new Map(meses.map((m) => [m, { recebidas: 0, entregues: 0 }]));
  let recebidas = 0;
  let entregues = 0;
  const tempos: number[] = [];
  for (const e of encomendas) {
    const linha = encMes.get(e.dataRecebimento.slice(0, 7));
    if (!linha || !e.dataRecebimento.startsWith(prefixo)) continue;
    recebidas += 1;
    linha.recebidas += 1;
    if (e.status === "entregue") {
      entregues += 1;
      linha.entregues += 1;
      if (e.recebidoEm && e.entregueEm) tempos.push(e.entregueEm.getTime() - e.recebidoEm.getTime());
    }
  }

  return {
    ano,
    entradas: { total: totalEntradas, porDiaSemana, porMes: meses.map((mes) => ({ mes, total: entradasMes.get(mes) ?? 0 })) },
    encomendas: {
      recebidas,
      entregues,
      aguardando: recebidas - entregues,
      tempoMedioHoras: mediaHoras(tempos),
      porMes: meses.map((mes) => ({ mes, ...encMes.get(mes)! })),
    },
  };
}

// ---------- Solicitações ----------

export type SolicitacaoParaRelatorio = {
  categoria: string;
  status: string;
  criadoEm: Date | null;
  resolvidoEm: Date | null;
};

export type RelatorioSolicitacoes = {
  ano: number;
  porMes: { mes: string; abertas: number; resolvidas: number }[];
  porCategoria: { categoria: string; abertas: number; resolvidas: number }[];
  totais: { abertas: number; resolvidas: number; emAndamento: number; canceladas: number };
  tempoMedioHoras: number | null;
};

/** Nome bonito de uma categoria guardada como código (ex.: "areas_comuns" → "Áreas comuns"). */
export function nomeCategoria(codigo: string): string {
  const conhecidas: Record<string, string> = {
    // As categorias do formulário de solicitações (mesmo nome que o morador vê).
    ...ROTULO_CATEGORIA_SOLICITACAO,
    // Códigos antigos ou de outros formulários.
    jardinagem: "Jardinagem",
    agua: "Água",
    energia: "Energia",
    portaria: "Portaria",
    barulho: "Barulho",
    areas_comuns: "Áreas comuns",
    reclamacao: "Reclamação",
    outros: "Outros",
  };
  const c = codigo.trim();
  if (!c) return "Sem categoria";
  if (conhecidas[c]) return conhecidas[c];
  const t = c.replace(/[_-]+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Abertas por mês = criadas naquele mês; resolvidas por mês = resolvidas naquele mês.
 * Uma solicitação aberta em dezembro e resolvida em janeiro conta em cada ano no seu lugar.
 */
export function agregarSolicitacoes(ano: number, lista: SolicitacaoParaRelatorio[], fuso: string): RelatorioSolicitacoes {
  const meses = mesesDoAno(ano);
  const porMes = new Map(meses.map((m) => [m, { abertas: 0, resolvidas: 0 }]));
  const porCategoria = new Map<string, { abertas: number; resolvidas: number }>();
  const totais = { abertas: 0, resolvidas: 0, emAndamento: 0, canceladas: 0 };
  const tempos: number[] = [];

  for (const s of lista) {
    const categoria = nomeCategoria(s.categoria);
    const mesCriacao = s.criadoEm ? mesNoFuso(s.criadoEm, fuso) : null;
    const resolvida = s.status === "resolvida" && s.resolvidoEm;
    const mesResolucao = resolvida ? mesNoFuso(s.resolvidoEm!, fuso) : null;

    const linhaCriacao = mesCriacao ? porMes.get(mesCriacao) : undefined;
    const linhaResolucao = mesResolucao ? porMes.get(mesResolucao) : undefined;
    if (!linhaCriacao && !linhaResolucao) continue; // nada a ver com este ano

    if (!porCategoria.has(categoria)) porCategoria.set(categoria, { abertas: 0, resolvidas: 0 });
    const cat = porCategoria.get(categoria)!;

    if (linhaCriacao) {
      linhaCriacao.abertas += 1;
      cat.abertas += 1;
      totais.abertas += 1;
      if (s.status === "em_andamento" || s.status === "aberta") totais.emAndamento += 1;
      if (s.status === "cancelada") totais.canceladas += 1;
    }
    if (linhaResolucao) {
      linhaResolucao.resolvidas += 1;
      cat.resolvidas += 1;
      totais.resolvidas += 1;
      if (s.criadoEm) tempos.push(s.resolvidoEm!.getTime() - s.criadoEm.getTime());
    }
  }

  return {
    ano,
    porMes: meses.map((mes) => ({ mes, ...porMes.get(mes)! })),
    porCategoria: [...porCategoria.entries()]
      .map(([categoria, c]) => ({ categoria, ...c }))
      .sort((a, b) => b.abertas - a.abertas || a.categoria.localeCompare(b.categoria, "pt-BR")),
    totais,
    tempoMedioHoras: mediaHoras(tempos),
  };
}

// ---------- CSV (abre no Excel em português) ----------

/** Célula segura: aspas escapadas e sem fórmulas (proteção contra "CSV injection"). */
export function celulaCsv(valor: string | number): string {
  const texto = String(valor);
  // Número negativo ("-1.234,56") continua número; o resto que começa com = + - @ vira texto.
  const ehNumero = /^-?\d[\d.]*(,\d+)?$/.test(texto);
  const seguro = !ehNumero && /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replace(/"/g, '""')}"`;
}

/** BOM + ";" + quebras CRLF: o Excel em português abre com acentos e colunas certas. */
export function montarCsv(linhas: (string | number)[][]): string {
  return "﻿" + linhas.map((l) => l.map(celulaCsv).join(";")).join("\r\n");
}

const numeroBR = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 123456 → "1.234,56" (sem "R$", para o Excel somar). */
export const reaisCsv = (centavos: number) => numeroBR.format(centavos / 100);

const horasCsv = (h: number | null) => (h === null ? "" : h.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

export function csvFinanceiro(nomeCondominio: string, r: RelatorioFinanceiro): string {
  return montarCsv([
    [nomeCondominio],
    [`Relatório financeiro — ${r.ano}`],
    [],
    ["Mês", "Receitas (R$)", "Despesas (R$)", "Resultado (R$)", "Saldo no fim do mês (R$)", "Situação"],
    ...r.linhas.map((l) => [
      `${mesCurto(l.mes)}/${r.ano}`,
      reaisCsv(l.receitasCentavos),
      reaisCsv(l.despesasCentavos),
      reaisCsv(l.resultadoCentavos),
      l.saldoFinalCentavos === null ? "" : reaisCsv(l.saldoFinalCentavos),
      l.saldoFinalCentavos === null ? "Sem lançamentos" : l.publicado ? "Publicado" : "Não publicado",
    ]),
    ["Total do ano", reaisCsv(r.totais.receitasCentavos), reaisCsv(r.totais.despesasCentavos), reaisCsv(r.totais.resultadoCentavos), r.saldoFinalCentavos === null ? "" : reaisCsv(r.saldoFinalCentavos), ""],
    [],
    ["Categoria", "Tipo", "Total no ano (R$)"],
    ...r.categorias.map((c) => [c.nome, c.tipo === "receita" ? "Receita" : "Despesa", reaisCsv(c.totalCentavos)]),
  ]);
}

export function csvReservas(nomeCondominio: string, r: RelatorioReservas): string {
  const cab = ["Confirmadas", "Canceladas", "Canceladas fora do prazo", "Pendentes ou recusadas", "Total"];
  const nums = (c: ContagemReservas) => [c.confirmadas, c.canceladas, c.tardias, c.outras, c.total];
  return montarCsv([
    [nomeCondominio],
    [`Relatório de reservas — ${r.ano}`],
    [],
    ["Mês", ...cab],
    ...r.porMes.map((m) => [`${mesCurto(m.mes)}/${r.ano}`, ...nums(m)]),
    ["Total do ano", ...nums(r.totais)],
    [],
    ["Área", ...cab],
    ...r.porArea.map((a) => [a.area, ...nums(a)]),
  ]);
}

export function csvPortaria(nomeCondominio: string, r: RelatorioPortaria): string {
  return montarCsv([
    [nomeCondominio],
    [`Relatório da portaria — ${r.ano}`],
    [],
    ["Dia da semana", "Entradas"],
    ...DIAS_DA_SEMANA.map((d, i) => [d, r.entradas.porDiaSemana[i]]),
    [],
    ["Mês", "Entradas", "Encomendas recebidas", "Encomendas entregues"],
    ...r.entradas.porMes.map((m, i) => [`${mesCurto(m.mes)}/${r.ano}`, m.total, r.encomendas.porMes[i].recebidas, r.encomendas.porMes[i].entregues]),
    ["Total do ano", r.entradas.total, r.encomendas.recebidas, r.encomendas.entregues],
    [],
    ["Encomendas aguardando retirada", r.encomendas.aguardando],
    ["Tempo médio até a retirada (horas)", horasCsv(r.encomendas.tempoMedioHoras)],
  ]);
}

export function csvSolicitacoes(nomeCondominio: string, r: RelatorioSolicitacoes): string {
  return montarCsv([
    [nomeCondominio],
    [`Relatório de solicitações — ${r.ano}`],
    [],
    ["Mês", "Abertas", "Resolvidas"],
    ...r.porMes.map((m) => [`${mesCurto(m.mes)}/${r.ano}`, m.abertas, m.resolvidas]),
    ["Total do ano", r.totais.abertas, r.totais.resolvidas],
    [],
    ["Categoria", "Abertas", "Resolvidas"],
    ...r.porCategoria.map((c) => [c.categoria, c.abertas, c.resolvidas]),
    [],
    ["Ainda sem solução (abertas no ano)", r.totais.emAndamento],
    ["Canceladas (abertas no ano)", r.totais.canceladas],
    ["Tempo médio de resolução (horas)", horasCsv(r.tempoMedioHoras)],
  ]);
}
