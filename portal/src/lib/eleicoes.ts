/**
 * Regras da VOTAÇÃO OFICIAL (eleição) — sem banco. Testadas em tests/unit/eleicoes.test.ts.
 *
 * Decisões (as mesmas do sistema de votação separado, definidas pelo síndico):
 * - 1 voto por CASA; quem da casa votar primeiro decide;
 * - cada casa escolhe até `escolhasPorCasa` candidatos (padrão 1) ou vota em branco;
 * - padrão: 3 vagas, das 7h às 17h;
 * - regras e candidatos NÃO mudam depois de publicada;
 * - ninguém vê parcial: o resultado só existe depois do encerramento;
 * - desempate na última vaga: o mais velho (se todos os empatados tiverem a data
 *   de nascimento e ela separar quem fica de quem sai); senão, a comissão decide
 *   e registra na ata. O sistema nunca escolhe por um critério que não seja a regra.
 *
 * DOIS MODOS:
 * - "chapa" (padrão do Jardins do Lago, decidido em 19/11/2026): UMA chapa (síndico, vice,
 *   tesoureira, fiscais...). Cada casa responde SIM ou NÃO para a chapa inteira; votando na
 *   chapa, todos os integrantes são eleitos juntos. Eleita com METADE MAIS 1 dos votos
 *   (Sim > metade dos votos dados). Empate ou menos = não eleita.
 * - "candidatos": cada casa escolhe até N candidatos para as vagas (eleição disputada).
 *
 * SIGILO: nenhuma cédula individual é guardada. O voto só soma +1 nos contadores
 * (veja src/server/dados/eleicoes.ts).
 */

export const MODOS_ELEICAO = ["chapa", "candidatos"] as const;
export type ModoEleicao = (typeof MODOS_ELEICAO)[number];

export const STATUS_ELEICAO = ["rascunho", "publicada"] as const;
export type StatusEleicao = (typeof STATUS_ELEICAO)[number];

export const REGRAS_DESEMPATE = ["idade", "comissao"] as const;
export type RegraDesempate = (typeof REGRAS_DESEMPATE)[number];

export const ROTULO_DESEMPATE: Record<RegraDesempate, string> = {
  idade: "O candidato mais velho fica com a vaga",
  comissao: "A comissão decide e registra na ata",
};

export const MAX_VAGAS = 9;
export const MAX_ESCOLHAS = 3;
export const MAX_CANDIDATOS = 30;
/** Valor do formulário para o voto em branco. */
export const BRANCO = "branco";
export const MAX_FUNCAO = 40;

export type Candidato = {
  /** "c1", "c2"... (estável enquanto é rascunho). */
  id: string;
  /** Número na cédula: 1, 2, 3... */
  numero: number;
  nome: string;
  /** Cargo que aparece embaixo do nome (ex.: "Síndico", "Fiscal"). Opcional. */
  funcao: string;
  /** Casa do candidato (ex.: "Casa 12"). Opcional. */
  casa: string;
  /** Apresentação curta (opcional). */
  apresentacao: string;
  /** "AAAA-MM-DD" ou null. Só serve para o desempate por idade. */
  nascimento: string | null;
};

/**
 * Situação que a pessoa vê, juntando o status gravado com o horário:
 * - "rascunho": só a comissão vê; dá para alterar;
 * - "agendada": publicada, ainda não abriu (não dá mais para alterar);
 * - "aberta": dá para votar agora;
 * - "encerrada": o horário acabou; o resultado pode ser visto.
 */
export type SituacaoEleicao = "rascunho" | "agendada" | "aberta" | "encerrada";

export const ROTULO_SITUACAO_ELEICAO: Record<SituacaoEleicao, string> = {
  rascunho: "Rascunho",
  agendada: "Ainda não abriu",
  aberta: "Votação aberta",
  encerrada: "Encerrada",
};

export function situacaoEleicao(
  e: { status: StatusEleicao; abreEm: Date; fechaEm: Date },
  agora = new Date(),
): SituacaoEleicao {
  if (e.status !== "publicada") return "rascunho";
  if (agora.getTime() >= e.fechaEm.getTime()) return "encerrada";
  if (agora.getTime() < e.abreEm.getTime()) return "agendada";
  return "aberta";
}

// ---------- Candidatos ----------

export type LinhaCandidato = {
  nome: string;
  funcao?: string;
  casa: string;
  apresentacao: string;
  nascimento: string;
};

const REGEX_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "AAAA-MM-DD" válido (e no passado)? */
export function dataNascimentoValida(
  texto: string,
  hoje = new Date(),
): boolean {
  const m = REGEX_DATA.exec(texto);
  if (!m) return false;
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(Date.UTC(a, me - 1, d));
  if (
    data.getUTCFullYear() !== a ||
    data.getUTCMonth() !== me - 1 ||
    data.getUTCDate() !== d
  )
    return false;
  return a >= 1900 && data.getTime() < hoje.getTime();
}

/**
 * Limpa as linhas digitadas, numera (1, 2, 3...) e dá ids estáveis (c1, c2...).
 * Linhas totalmente vazias são ignoradas. Devolve texto com o erro, se houver.
 */
export function montarCandidatos(
  linhas: LinhaCandidato[],
  hoje = new Date(),
): Candidato[] | string {
  const limpas = linhas
    .map((l) => ({
      nome: l.nome.trim().replace(/\s+/g, " "),
      funcao: (l.funcao ?? "").trim().replace(/\s+/g, " "),
      casa: l.casa.trim().replace(/\s+/g, " "),
      apresentacao: l.apresentacao.trim().replace(/\s+/g, " "),
      nascimento: l.nascimento.trim(),
    }))
    .filter(
      (l) => l.nome || l.funcao || l.casa || l.apresentacao || l.nascimento,
    );
  if (limpas.length === 0) return "Cadastre pelo menos 1 candidato.";
  if (limpas.length > MAX_CANDIDATOS)
    return `Use no máximo ${MAX_CANDIDATOS} candidatos.`;
  const vistos = new Set<string>();
  for (const [i, l] of limpas.entries()) {
    if (l.nome.length < 3)
      return `Escreva o nome do candidato ${i + 1} (pelo menos 3 letras).`;
    if (l.nome.length > 80)
      return `O nome do candidato ${i + 1} é muito longo (máximo 80 caracteres).`;
    if (l.funcao.length > MAX_FUNCAO)
      return `O cargo de ${l.nome} é muito longo (máximo ${MAX_FUNCAO} caracteres).`;
    if (l.casa.length > 20)
      return `A casa do candidato ${i + 1} é muito longa (máximo 20 caracteres).`;
    if (l.apresentacao.length > 280)
      return `A apresentação de ${l.nome} é muito longa (máximo 280 caracteres).`;
    if (l.nascimento && !dataNascimentoValida(l.nascimento, hoje))
      return `A data de nascimento de ${l.nome} não é válida.`;
    const chave = l.nome.toLocaleLowerCase("pt-BR");
    if (vistos.has(chave)) return `O candidato "${l.nome}" está repetido.`;
    vistos.add(chave);
  }
  return limpas.map((l, i) => ({
    id: `c${i + 1}`,
    numero: i + 1,
    nome: l.nome,
    funcao: l.funcao,
    casa: l.casa,
    apresentacao: l.apresentacao,
    nascimento: l.nascimento || null,
  }));
}

// ---------- Cédula ----------

export const VOTOS_CHAPA = ["sim", "nao"] as const;
export type VotoChapa = (typeof VOTOS_CHAPA)[number];
export type Escolha =
  | { tipo: "branco" }
  | { tipo: "candidatos"; ids: string[] }
  | { tipo: "chapa"; voto: VotoChapa };

/**
 * Confere a cédula enviada pelo navegador. Devolve a escolha limpa ou o texto do erro.
 * Regras: em branco (se permitido) OU de 1 até `escolhasPorCasa` candidatos diferentes e válidos.
 */
export function validarEscolha(
  enviados: readonly string[],
  e: {
    candidatos: readonly Candidato[];
    escolhasPorCasa: number;
    permiteBranco: boolean;
    modo?: ModoEleicao;
  },
): Escolha | string {
  const valores = enviados.map((v) => v.trim()).filter(Boolean);
  if (e.modo === "chapa") {
    if (
      valores.length !== 1 ||
      !(VOTOS_CHAPA as readonly string[]).includes(valores[0])
    )
      return "Responda Sim ou Não para a chapa.";
    return { tipo: "chapa", voto: valores[0] as VotoChapa };
  }
  if (valores.length === 0)
    return e.permiteBranco
      ? "Escolha um candidato ou o voto em branco."
      : "Escolha um candidato.";
  if (valores.includes(BRANCO)) {
    if (!e.permiteBranco) return "Esta eleição não aceita voto em branco.";
    if (valores.length > 1)
      return "O voto em branco não pode ser junto com candidatos.";
    return { tipo: "branco" };
  }
  const unicos = [...new Set(valores)];
  if (unicos.length !== valores.length)
    return "Cada candidato só pode ser escolhido uma vez.";
  if (unicos.length > e.escolhasPorCasa) {
    return e.escolhasPorCasa === 1
      ? "Escolha só 1 candidato."
      : `Escolha no máximo ${e.escolhasPorCasa} candidatos.`;
  }
  const validos = new Set(e.candidatos.map((c) => c.id));
  if (!unicos.every((id) => validos.has(id)))
    return "Um dos candidatos escolhidos não existe. Atualize a página.";
  return { tipo: "candidatos", ids: unicos };
}

// ---------- Apuração ----------

export type LinhaApuracao = {
  candidato: Candidato;
  votos: number;
  posicao: number;
  porcentagem: number;
};

export type Apuracao = {
  modo: "candidatos";
  ranking: LinhaApuracao[];
  /** Ids dos eleitos (pode faltar alguém se houver empate que a comissão precisa decidir). */
  eleitos: string[];
  brancos: number;
  /** Cédulas contadas (cada casa que votou = 1 cédula). */
  cedulas: number;
  /** Empate na última vaga: quem empatou e se a regra decidiu. */
  empate: {
    ids: string[];
    votos: number;
    vaga: number;
    decididos: string[] | null;
  } | null;
};

/** Porcentagem (inteira, arredondada) de cada candidato sobre o total de cédulas. */
function porcentagens(valores: number[], total: number): number[] {
  if (total <= 0) return valores.map(() => 0);
  const exatas = valores.map((n) => (n * 100) / total);
  return exatas.map((x) => Math.round(x));
}

/** Desempate por idade: só decide se todos têm data e ela separa quem fica de quem sai. */
function desempatarPorIdade(
  grupo: Candidato[],
  restantes: number,
): string[] | null {
  if (grupo.some((c) => !c.nascimento)) return null;
  const ordem = [...grupo].sort(
    (a, b) => a.nascimento!.localeCompare(b.nascimento!) || a.numero - b.numero,
  );
  if (restantes <= 0 || restantes >= ordem.length) return null;
  if (ordem[restantes - 1].nascimento === ordem[restantes].nascimento)
    return null;
  return ordem.slice(0, restantes).map((c) => c.id);
}

export function apurar(
  e: {
    candidatos: readonly Candidato[];
    vagas: number;
    regraDesempate: RegraDesempate;
  },
  contagem: { votos: Record<string, number>; brancos: number; cedulas: number },
): Apuracao {
  const n = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  const votos = new Map(
    e.candidatos.map((c) => [c.id, n(contagem.votos[c.id])]),
  );
  const ordenados = [...e.candidatos].sort(
    (a, b) => votos.get(b.id)! - votos.get(a.id)! || a.numero - b.numero,
  );
  const cedulas = n(contagem.cedulas);
  const pct = porcentagens(
    ordenados.map((c) => votos.get(c.id)!),
    cedulas,
  );
  const ranking: LinhaApuracao[] = ordenados.map((c, i) => ({
    candidato: c,
    votos: votos.get(c.id)!,
    posicao:
      1 + ordenados.filter((o) => votos.get(o.id)! > votos.get(c.id)!).length,
    porcentagem: pct[i],
  }));

  const vagas = Math.max(1, e.vagas);
  let eleitos = ranking.slice(0, vagas).map((l) => l.candidato.id);
  let empate: Apuracao["empate"] = null;
  // Empate na última vaga (inclusive com 0 votos): nunca decide pelo número da cédula.
  if (
    ranking.length > vagas &&
    ranking[vagas - 1].votos === ranking[vagas].votos
  ) {
    const v = ranking[vagas - 1].votos;
    const grupo = ranking.filter((l) => l.votos === v).map((l) => l.candidato);
    const acima = ranking.filter((l) => l.votos > v).map((l) => l.candidato.id);
    const restantes = vagas - acima.length;
    const decididos =
      e.regraDesempate === "idade"
        ? desempatarPorIdade(grupo, restantes)
        : null;
    empate = {
      ids: grupo.map((c) => c.id),
      votos: v,
      vaga: acima.length + 1,
      decididos,
    };
    eleitos = [...acima, ...(decididos ?? [])];
  }
  return {
    modo: "candidatos",
    ranking,
    eleitos,
    brancos: n(contagem.brancos),
    cedulas,
    empate,
  };
}

export type ApuracaoChapa = {
  modo: "chapa";
  sim: number;
  nao: number;
  /** Casas que votaram (Sim + Não). */
  cedulas: number;
  /** Votos de Sim necessários: metade mais 1 dos votos dados. */
  minimo: number;
  porcentagemSim: number;
  eleita: boolean;
};
export type ResultadoApuracao = Apuracao | ApuracaoChapa;

/** Votos necessários para eleger a chapa: metade mais 1 dos votos dados (ex.: 10 → 6, 9 → 5). */
export function minimoParaEleger(votos: number): number {
  return Math.floor(votos / 2) + 1;
}

/** Chapa: eleita com Sim em pelo menos metade mais 1 dos votos. Sem votos, não é eleita. */
export function apurarChapa(contagem: {
  sim: number;
  nao: number;
  cedulas: number;
}): ApuracaoChapa {
  const n = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  const sim = n(contagem.sim);
  const nao = n(contagem.nao);
  const total = sim + nao;
  const minimo = minimoParaEleger(total);
  return {
    modo: "chapa",
    sim,
    nao,
    cedulas: n(contagem.cedulas),
    minimo,
    porcentagemSim: total ? Math.round((sim * 100) / total) : 0,
    eleita: total > 0 && sim >= minimo,
  };
}

// ---------- Textos ----------

/** "Escolha 1 candidato" / "Escolha até 3 candidatos". */
export function textoEscolhas(escolhasPorCasa: number): string {
  return escolhasPorCasa === 1
    ? "Escolha 1 candidato"
    : `Escolha até ${escolhasPorCasa} candidatos`;
}

export function vagasTexto(vagas: number): string {
  return vagas === 1 ? "1 vaga" : `${vagas} vagas`;
}

/** Resumo da regra para cabeçalhos: "Sim ou Não para a chapa" / "3 vagas". */
export function regraTexto(e: { modo: ModoEleicao; vagas: number }): string {
  return e.modo === "chapa" ? "Sim ou Não para a chapa" : vagasTexto(e.vagas);
}
