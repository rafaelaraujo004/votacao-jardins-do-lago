import "server-only";
import { randomInt } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import { registrarAuditoria, type AcaoAuditada } from "../auditoria";
import { ErroDeNegocio } from "../acoes/resultado";
import {
  MODOS_ELEICAO,
  REGRAS_DESEMPATE,
  STATUS_ELEICAO,
  apurar,
  apurarChapa,
  situacaoEleicao,
  somarUrna,
  validarEscolha,
  type Candidato,
  type ModoEleicao,
  type ResultadoApuracao,
  type RegraDesempate,
  type SituacaoEleicao,
  type StatusEleicao,
} from "@/lib/eleicoes";
import { numeroDaCasa } from "@/lib/contatos-votacao";

/**
 * Dados da VOTAÇÃO OFICIAL (eleição).
 *
 * Coleções (dentro de condominiums/{c}):
 * - elections/{id}: a eleição (regras e candidatos). Nunca é apagada.
 * - elections/{id}/votantes/{unitId}: QUEM votou (a casa e quando). O id é a casa:
 *   não existe segundo voto (a transação usa "create", que falha se já existir).
 *   NUNCA guarda a escolha nem a pessoa.
 * - elections/{id}/urna/contagem: a URNA. Só contadores: cedulas e, conforme o modo,
 *   sim e nao (chapa) ou votos.{candidato} e brancos (candidatos). NÃO existe cédula individual guardada.
 *
 * SIGILO (por que é seguro):
 * - marcar "a casa votou" e somar +1 nos contadores acontece na MESMA transação, então
 *   não há como ter um sem o outro (nem voto duplo);
 * - como só existem totais, depois de gravado não sobra nenhum dado que ligue a casa ao
 *   candidato (nem o horário: os contadores guardam só o número atual);
 * - a urna só é lida depois do encerramento (lerApuracao confere a situação) e o navegador
 *   não lê nada da eleição (firestore.rules nega tudo em elections/**);
 * - a auditoria registra que a casa votou, nunca em quem.
 * O único jeito de descobrir um voto seria alguém com a chave mestra do Firebase vigiar o
 * banco ao vivo durante a votação — a mesma confiança que qualquer votação online exige
 * de quem opera o servidor. Ninguém do portal (síndico, comissão, morador) consegue.
 */

export const base = (
  ctx: Pick<Contexto, "condominioId">,
  db: Firestore = adminDb(),
) => db.collection("condominiums").doc(ctx.condominioId);

export const eleicoesDe = (
  ctx: Pick<Contexto, "condominioId">,
  db: Firestore = adminDb(),
) => base(ctx, db).collection("elections");

/** Ações de auditoria da votação (todas estão em ACOES_AUDITADAS). */
export type AcaoEleicao =
  | "eleicao.criar"
  | "eleicao.editar"
  | "eleicao.publicar"
  | "eleicao.rascunho"
  | "eleicao.votar"
  | "eleicao.bloqueio"
  | "eleicao.links"
  | "eleicao.contatos"
  | "eleicao.foto";
export function acaoEleicao(a: AcaoEleicao): AcaoAuditada {
  return a;
}

// ---------- Conversão dos documentos ----------

export const texto = (v: unknown, padrao = "") =>
  typeof v === "string" ? v : padrao;
export const data = (v: unknown): Date | null =>
  v instanceof Timestamp ? v.toDate() : null;
const inteiro = (v: unknown, padrao: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0
    ? Math.floor(v)
    : padrao;

function paraCandidatos(v: unknown): Candidato[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (c): c is Record<string, unknown> =>
        !!c &&
        typeof c === "object" &&
        typeof c.id === "string" &&
        typeof c.nome === "string",
    )
    .map((c, i) => ({
      id: c.id as string,
      numero: inteiro(c.numero, i + 1),
      nome: c.nome as string,
      funcao: texto(c.funcao),
      casa: texto(c.casa),
      apresentacao: texto(c.apresentacao),
      nascimento: typeof c.nascimento === "string" ? c.nascimento : null,
    }))
    .sort((a, b) => a.numero - b.numero);
}

export type EleicaoInterna = {
  id: string;
  titulo: string;
  cargo: string;
  modo: ModoEleicao;
  vagas: number;
  escolhasPorCasa: number;
  permiteBranco: boolean;
  regraDesempate: RegraDesempate;
  abreEm: Date;
  fechaEm: Date;
  status: StatusEleicao;
  candidatos: Candidato[];
  casasAptas: number | null;
  /** Casas que a comissão bloqueou de votar nesta eleição (ids das unidades). */
  casasBloqueadas: string[];
  criadoPorNome: string;
  criadoEm: Date | null;
  publicadaEm: Date | null;
};

export function paraEleicao(
  id: string,
  d: DocumentData | undefined,
): EleicaoInterna {
  const status = (STATUS_ELEICAO as readonly unknown[]).includes(d?.status)
    ? (d?.status as StatusEleicao)
    : "rascunho";
  const regra = (REGRAS_DESEMPATE as readonly unknown[]).includes(
    d?.regraDesempate,
  )
    ? (d?.regraDesempate as RegraDesempate)
    : "comissao";
  const abreEm = data(d?.abreEm) ?? new Date(0);
  const vagas = Math.max(1, inteiro(d?.vagas, 3));
  return {
    id,
    titulo: texto(d?.titulo, "Eleição"),
    cargo: texto(d?.cargo, "Comissão"),
    // Eleições antigas (sem o campo) eram de candidatos.
    modo: (MODOS_ELEICAO as readonly unknown[]).includes(d?.modo)
      ? (d?.modo as ModoEleicao)
      : "candidatos",
    vagas,
    escolhasPorCasa: Math.min(
      vagas,
      Math.max(1, inteiro(d?.escolhasPorCasa, 1)),
    ),
    permiteBranco: d?.permiteBranco !== false,
    regraDesempate: regra,
    abreEm,
    fechaEm: data(d?.fechaEm) ?? abreEm,
    status,
    candidatos: paraCandidatos(d?.candidatos),
    casasAptas:
      typeof d?.casasAptas === "number" ? inteiro(d.casasAptas, 0) : null,
    casasBloqueadas: Array.isArray(d?.casasBloqueadas)
      ? (d.casasBloqueadas as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : [],
    criadoPorNome: texto(d?.criadoPorNome),
    criadoEm: data(d?.criadoEm),
    publicadaEm: data(d?.publicadaEm),
  };
}

const maisRecentes = (a: EleicaoInterna, b: EleicaoInterna) =>
  b.abreEm.getTime() - a.abreEm.getTime() ||
  (b.criadoEm?.getTime() ?? 0) - (a.criadoEm?.getTime() ?? 0);

/** Casas que podem votar (cadastradas, não inativas e não bloqueadas nesta eleição). */
async function contarCasasAptas(
  ctx: Contexto,
  db: Firestore = adminDb(),
  bloqueadas: readonly string[] = [],
): Promise<number> {
  const snap = await base(ctx, db).collection("units").select("status").get();
  const fora = new Set(bloqueadas);
  return snap.docs.filter(
    (d) => d.get("status") !== "inativa" && !fora.has(d.id),
  ).length;
}

/** Quantas casas já votaram (contagem feita pelo banco, sem ler os documentos). */
export async function contarVotantes(
  ctx: Pick<Contexto, "condominioId">,
  id: string,
  db: Firestore = adminDb(),
): Promise<number> {
  const snap = await eleicoesDe(ctx, db)
    .doc(id)
    .collection("votantes")
    .count()
    .get();
  return snap.data().count;
}

/**
 * Carência depois do encerramento antes de abrir a urna: garante que nenhum voto
 * que começou antes das 17h ainda esteja sendo gravado quando a soma é lida.
 */
export const CARENCIA_APURACAO_MS = 2 * 60 * 1000;

export function apuracaoLiberada(
  e: { status: StatusEleicao; abreEm: Date; fechaEm: Date },
  agora: Date,
): boolean {
  return (
    situacaoEleicao(e, agora) === "encerrada" &&
    agora.getTime() >= e.fechaEm.getTime() + CARENCIA_APURACAO_MS
  );
}

/**
 * Lê a URNA e faz a apuração. SÓ depois do encerramento: antes disso, ninguém
 * (nem a comissão) vê parcial. É a única função que lê os contadores.
 */
export async function lerApuracao(
  ctx: Pick<Contexto, "condominioId">,
  e: EleicaoInterna,
  agora: Date,
  db: Firestore = adminDb(),
): Promise<ResultadoApuracao> {
  if (!apuracaoLiberada(e, agora)) {
    throw new ErroDeNegocio(
      "O resultado só existe depois do encerramento da votação.",
    );
  }
  // Urna em documento único, de propósito (veja o comentário em src/lib/eleicoes.ts).
  const snap = await eleicoesDe(ctx, db).doc(e.id).collection("urna").doc("contagem").get();
  const total = somarUrna([snap.data()]);
  if (e.modo === "chapa")
    return apurarChapa({ sim: total.sim, nao: total.nao, cedulas: total.cedulas });
  return apurar(e, { votos: total.votos, brancos: total.brancos, cedulas: total.cedulas });
}

// ---------- Comissão (eleicoes.gerenciar) ----------

export type EleicaoGestao = {
  id: string;
  titulo: string;
  cargo: string;
  modo: ModoEleicao;
  vagas: number;
  escolhasPorCasa: number;
  permiteBranco: boolean;
  regraDesempate: RegraDesempate;
  abreEm: Date;
  fechaEm: Date;
  status: StatusEleicao;
  situacao: SituacaoEleicao;
  candidatos: Candidato[];
  casasAptas: number;
  votaram: number;
  casasBloqueadas: string[];
  /** Fotos dos integrantes (id do candidato → imagem). */
  fotos: Record<string, string>;
  criadoPorNome: string;
  /** Só depois do encerramento. */
  apuracao: ResultadoApuracao | null;
};

export async function listarEleicoesGestao(
  ctx: Contexto,
  agora = new Date(),
): Promise<EleicaoGestao[]> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const [snap, aptasAgora] = await Promise.all([
    eleicoesDe(ctx).get(),
    contarCasasAptas(ctx),
  ]);
  const eleicoes = snap.docs
    .map((d) => paraEleicao(d.id, d.data()))
    .sort(maisRecentes);
  return Promise.all(
    eleicoes.map(async (e) => ({
      ...resumoGestao(e, agora),
      casasAptas: e.casasAptas ?? aptasAgora,
      votaram: e.status === "publicada" ? await contarVotantes(ctx, e.id) : 0,
      fotos: {},
      apuracao: null,
    })),
  );
}

function resumoGestao(e: EleicaoInterna, agora: Date) {
  return {
    id: e.id,
    titulo: e.titulo,
    cargo: e.cargo,
    modo: e.modo,
    vagas: e.vagas,
    escolhasPorCasa: e.escolhasPorCasa,
    permiteBranco: e.permiteBranco,
    regraDesempate: e.regraDesempate,
    abreEm: e.abreEm,
    fechaEm: e.fechaEm,
    status: e.status,
    situacao: situacaoEleicao(e, agora),
    candidatos: e.candidatos,
    casasBloqueadas: e.casasBloqueadas,
    criadoPorNome: e.criadoPorNome,
  };
}

export async function obterEleicaoGestao(
  ctx: Contexto,
  id: string,
  agora = new Date(),
): Promise<EleicaoGestao | null> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const doc = await eleicoesDe(ctx).doc(id).get();
  if (!doc.exists) return null;
  const e = paraEleicao(doc.id, doc.data());
  const [aptasAgora, votaram, apuracao, fotos] = await Promise.all([
    e.casasAptas === null
      ? contarCasasAptas(ctx, adminDb(), e.casasBloqueadas)
      : Promise.resolve(e.casasAptas),
    e.status === "publicada" ? contarVotantes(ctx, e.id) : Promise.resolve(0),
    apuracaoLiberada(e, agora)
      ? lerApuracao(ctx, e, agora)
      : Promise.resolve(null),
    fotosDaEleicao(ctx.condominioId, e.id),
  ]);
  return {
    ...resumoGestao(e, agora),
    casasAptas: aptasAgora,
    votaram,
    fotos,
    apuracao,
  };
}

/**
 * Casas que já votaram (só o nome da casa, em ordem de NÚMERO, nunca de horário).
 * Serve para a comissão lembrar quem falta. Nunca mostra o voto.
 */
export async function casasQueVotaram(
  ctx: Contexto,
  id: string,
): Promise<string[]> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const snap = await eleicoesDe(ctx)
    .doc(id)
    .collection("votantes")
    .select("unidadeRotulo")
    .get();
  return snap.docs
    .map((d) => texto(d.get("unidadeRotulo"), "Casa"))
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

/** Cria (id vazio) ou altera um RASCUNHO. Depois de publicada, nada muda. */
export async function gravarEleicao(
  db: Firestore,
  ctx: Contexto,
  v: {
    id: string | null;
    titulo: string;
    cargo: string;
    modo: ModoEleicao;
    vagas: number;
    escolhasPorCasa: number;
    permiteBranco: boolean;
    regraDesempate: RegraDesempate;
    abreEm: Date;
    fechaEm: Date;
    candidatos: Candidato[];
  },
): Promise<string> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const col = eleicoesDe(ctx, db);
  const ref = v.id ? col.doc(v.id) : col.doc();
  const campos = {
    titulo: v.titulo,
    cargo: v.cargo,
    modo: v.modo,
    vagas: v.vagas,
    escolhasPorCasa: v.escolhasPorCasa,
    permiteBranco: v.permiteBranco,
    regraDesempate: v.regraDesempate,
    abreEm: Timestamp.fromDate(v.abreEm),
    fechaEm: Timestamp.fromDate(v.fechaEm),
    candidatos: v.candidatos,
    atualizadoEm: FieldValue.serverTimestamp(),
    atualizadoPor: ctx.uid,
  };
  await db.runTransaction(async (tx) => {
    if (v.id) {
      const atual = await tx.get(ref);
      if (!atual.exists)
        throw new ErroDeNegocio("Eleição não encontrada. Atualize a página.");
      if (atual.get("status") !== "rascunho") {
        throw new ErroDeNegocio(
          "Esta eleição já foi publicada: regras e candidatos não mudam mais.",
        );
      }
      // As fotos acompanham a PESSOA (pelo nome): se a ordem mudou, a foto muda de id;
      // se a pessoa saiu da chapa, a foto sai junto.
      const fotos = await tx.get(ref.collection("fotos"));
      const antigos = new Map(paraEleicao(atual.id, atual.data()).candidatos.map((c) => [c.id, c.nome.toLocaleLowerCase("pt-BR")]));
      const novoId = new Map(v.candidatos.map((c) => [c.nome.toLocaleLowerCase("pt-BR"), c.id]));
      const destinos = new Map<string, FirebaseFirestore.DocumentData>();
      for (const f of fotos.docs) {
        const nome = antigos.get(f.id);
        const destino = nome ? novoId.get(nome) : undefined;
        if (destino) destinos.set(destino, f.data());
      }
      for (const f of fotos.docs) if (!destinos.has(f.id)) tx.delete(f.ref);
      for (const [destino, dados] of destinos) tx.set(ref.collection("fotos").doc(destino), dados);
      tx.update(ref, campos);
    } else {
      tx.create(ref, {
        ...campos,
        status: "rascunho",
        criadoPor: ctx.uid,
        criadoPorNome: ctx.nome,
        criadoEm: FieldValue.serverTimestamp(),
      });
    }
    registrarAuditoria(db, tx, {
      condominioId: ctx.condominioId,
      uid: ctx.uid,
      nome: ctx.nome,
      papel: ctx.papel,
      acao: acaoEleicao(v.id ? "eleicao.editar" : "eleicao.criar"),
      alvo: `elections/${ref.id}`,
      detalhes: {
        titulo: v.titulo,
        candidatos: v.candidatos.length,
        vagas: v.vagas,
      },
    });
  });
  return ref.id;
}

/**
 * Publica (rascunho → publicada) ou volta para rascunho (só antes de abrir).
 * Ao publicar, guarda quantas casas podem votar (para a ata).
 */
export async function mudarStatusEleicao(
  db: Firestore,
  ctx: Contexto,
  id: string,
  acao: "publicar" | "rascunho",
  agoraFixo?: Date,
): Promise<EleicaoInterna> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const ref = eleicoesDe(ctx, db).doc(id);
  // Casas ativas lidas antes; o bloqueio é aplicado DENTRO da transação (lista sempre atual).
  const ativas =
    acao === "publicar"
      ? (await base(ctx, db).collection("units").select("status").get()).docs
          .filter((d) => d.get("status") !== "inativa")
          .map((d) => d.id)
      : [];
  const urnaRef = ref.collection("urna").doc("contagem");
  return db.runTransaction(async (tx) => {
    // A hora é lida a cada tentativa da transação (nunca uma hora "velha").
    const agora = agoraFixo ?? new Date();
    const [doc, urna] = await Promise.all([tx.get(ref), tx.get(urnaRef)]);
    if (!doc.exists)
      throw new ErroDeNegocio("Eleição não encontrada. Atualize a página.");
    const e = paraEleicao(doc.id, doc.data());
    const bloqueadas = new Set(e.casasBloqueadas);
    const aptas = ativas.filter((u) => !bloqueadas.has(u)).length;
    // Se já existe qualquer voto, a eleição nunca mais muda (nem volta a rascunho).
    if (urna.exists)
      throw new ErroDeNegocio(
        "Esta eleição já recebeu votos: não pode mais ser alterada.",
      );
    if (acao === "publicar") {
      if (e.status !== "rascunho")
        throw new ErroDeNegocio("Esta eleição já foi publicada.");
      if (e.candidatos.length === 0)
        throw new ErroDeNegocio(
          "Cadastre pelo menos 1 candidato antes de publicar.",
        );
      if (e.fechaEm.getTime() <= agora.getTime())
        throw new ErroDeNegocio(
          "O horário de encerramento já passou. Ajuste as datas antes de publicar.",
        );
      if (aptas === 0)
        throw new ErroDeNegocio("Não há casas ativas no cadastro para votar.");
      tx.update(ref, {
        status: "publicada",
        casasAptas: aptas,
        publicadaEm: FieldValue.serverTimestamp(),
        publicadaPor: ctx.uid,
      });
    } else {
      if (e.status !== "publicada")
        throw new ErroDeNegocio("Esta eleição já é um rascunho.");
      if (agora.getTime() >= e.abreEm.getTime()) {
        throw new ErroDeNegocio(
          "A votação já abriu: não dá mais para voltar para rascunho.",
        );
      }
      tx.update(ref, {
        status: "rascunho",
        casasAptas: FieldValue.delete(),
        publicadaEm: FieldValue.delete(),
      });
    }
    registrarAuditoria(db, tx, {
      condominioId: ctx.condominioId,
      uid: ctx.uid,
      nome: ctx.nome,
      papel: ctx.papel,
      acao: acaoEleicao(
        acao === "publicar" ? "eleicao.publicar" : "eleicao.rascunho",
      ),
      alvo: `elections/${id}`,
      detalhes: {
        titulo: e.titulo,
        ...(acao === "publicar" ? { casasAptas: aptas } : {}),
      },
    });
    return e;
  });
}

// ---------- Morador (eleicoes.votar) ----------

export type EleicaoMorador = {
  id: string;
  titulo: string;
  cargo: string;
  modo: ModoEleicao;
  vagas: number;
  escolhasPorCasa: number;
  permiteBranco: boolean;
  regraDesempate: RegraDesempate;
  abreEm: Date;
  fechaEm: Date;
  situacao: SituacaoEleicao;
  candidatos: Candidato[];
  /** Quando a PRÓPRIA casa votou (nunca em quem). null se ainda não votou. */
  casaVotouEm: Date | null;
  casaVotou: boolean;
  /** A comissão bloqueou esta casa de votar nesta eleição. */
  casaBloqueada: boolean;
  /** Fotos dos integrantes (id do candidato → imagem). */
  fotos: Record<string, string>;
  /** Participação e resultado: só depois do encerramento. */
  resultado: {
    apuracao: ResultadoApuracao;
    votaram: number;
    casasAptas: number;
  } | null;
};

async function casaVotou(
  ctx: Contexto,
  id: string,
): Promise<{ votou: boolean; em: Date | null }> {
  if (!ctx.unitId) return { votou: false, em: null };
  const v = await eleicoesDe(ctx)
    .doc(id)
    .collection("votantes")
    .doc(ctx.unitId)
    .get();
  return { votou: v.exists, em: v.exists ? data(v.get("votouEm")) : null };
}

/** Tira a data de nascimento (privada) antes de mandar o resultado ao morador. */
export function semNascimento(a: ResultadoApuracao): ResultadoApuracao {
  const limpar = <T extends { candidato: Candidato }>(l: T): T => ({
    ...l,
    candidato: { ...l.candidato, nascimento: null },
  });
  return a.modo === "chapa" ? a : { ...a, ranking: a.ranking.map(limpar) };
}

async function paraMorador(
  ctx: Contexto,
  e: EleicaoInterna,
  agora: Date,
): Promise<EleicaoMorador> {
  const situacao = situacaoEleicao(e, agora);
  const [votoCasa, resultado, fotos] = await Promise.all([
    casaVotou(ctx, e.id),
    apuracaoLiberada(e, agora)
      ? Promise.all([
          lerApuracao(ctx, e, agora),
          contarVotantes(ctx, e.id),
        ]).then(([apuracao, votaram]) => ({
          apuracao: semNascimento(apuracao),
          votaram,
          casasAptas: e.casasAptas ?? votaram,
        }))
      : Promise.resolve(null),
    fotosDaEleicao(ctx.condominioId, e.id),
  ]);
  return {
    id: e.id,
    titulo: e.titulo,
    cargo: e.cargo,
    modo: e.modo,
    vagas: e.vagas,
    escolhasPorCasa: e.escolhasPorCasa,
    permiteBranco: e.permiteBranco,
    regraDesempate: e.regraDesempate,
    abreEm: e.abreEm,
    fechaEm: e.fechaEm,
    situacao,
    // A data de nascimento só serve para o desempate: não vai para o morador (nem para o navegador).
    candidatos: e.candidatos.map((c) => ({ ...c, nascimento: null })),
    casaVotouEm: votoCasa.em,
    casaVotou: votoCasa.votou,
    casaBloqueada: !!ctx.unitId && e.casasBloqueadas.includes(ctx.unitId),
    fotos,
    resultado,
  };
}

/** Eleições publicadas (as abertas primeiro). Rascunhos nunca aparecem para o morador. */
export async function listarEleicoesMorador(
  ctx: Contexto,
  agora = new Date(),
): Promise<EleicaoMorador[]> {
  garantirPermissao(ctx, "eleicoes.votar");
  const snap = await eleicoesDe(ctx).where("status", "==", "publicada").get();
  const ordem: Record<SituacaoEleicao, number> = {
    aberta: 0,
    agendada: 1,
    encerrada: 2,
    rascunho: 3,
  };
  const lista = snap.docs.map((d) => paraEleicao(d.id, d.data()));
  const prontas = await Promise.all(
    lista.map((e) => paraMorador(ctx, e, agora)),
  );
  return prontas.sort(
    (a, b) =>
      ordem[a.situacao] - ordem[b.situacao] ||
      b.abreEm.getTime() - a.abreEm.getTime(),
  );
}

export async function obterEleicaoMorador(
  ctx: Contexto,
  id: string,
  agora = new Date(),
): Promise<EleicaoMorador | null> {
  garantirPermissao(ctx, "eleicoes.votar");
  const doc = await eleicoesDe(ctx).doc(id).get();
  if (!doc.exists || doc.get("status") !== "publicada") return null;
  return paraMorador(ctx, paraEleicao(doc.id, doc.data()), agora);
}

/** Para o cartão do Início: a aberta, senão a próxima agendada, senão uma encerrada há até 7 dias. */
export async function eleicaoDoInicio(
  ctx: Contexto,
  agora = new Date(),
): Promise<EleicaoMorador | null> {
  if (!ctx.permissoes.has("eleicoes.votar")) return null;
  const lista = await listarEleicoesMorador(ctx, agora);
  const semana = 7 * 24 * 60 * 60 * 1000;
  return (
    lista.find((e) => e.situacao === "aberta") ??
    lista
      .filter((e) => e.situacao === "agendada")
      .sort((a, b) => a.abreEm.getTime() - b.abreEm.getTime())[0] ??
    lista.find(
      (e) =>
        e.situacao === "encerrada" &&
        agora.getTime() - e.fechaEm.getTime() < semana,
    ) ??
    null
  );
}

/**
 * VOTO DA CASA. A casa vem do cadastro de quem vota (ctx.unitId), nunca do formulário.
 * Na MESMA transação: confere tudo, marca a casa como "votou" (create: falha se já
 * existir) e soma +1 nos contadores. Nenhuma cédula individual é gravada.
 */
/** Código do comprovante (8 letras/números, sem os que se confundem). */
export function codigoComprovante(): string {
  const a = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let c = "";
  for (let i = 0; i < 8; i++) c += a[randomInt(a.length)];
  return c;
}

/** Dados do comprovante de UMA casa (só se ela votou). Nunca mostra o voto. */
export async function comprovanteDaCasa(
  condominioId: string,
  eleicaoId: string,
  unitId: string,
  db: Firestore = adminDb(),
): Promise<{
  condominioNome: string;
  fuso: string;
  titulo: string;
  cargo: string;
  casa: string;
  votouEm: Date | null;
  codigo: string;
} | null> {
  const ctx = { condominioId };
  const ref = eleicoesDe(ctx, db).doc(eleicaoId);
  const [cond, doc, votante] = await Promise.all([
    db.collection("condominiums").doc(condominioId).get(),
    ref.get(),
    ref.collection("votantes").doc(unitId).get(),
  ]);
  if (!doc.exists || !votante.exists) return null;
  const e = paraEleicao(doc.id, doc.data());
  return {
    condominioNome: texto(cond.get("nome"), "Condomínio"),
    fuso: texto(cond.get("fuso"), "America/Belem"),
    titulo: e.titulo,
    cargo: e.cargo,
    casa: texto(votante.get("unidadeRotulo"), "Casa"),
    votouEm: data(votante.get("votouEm")),
    codigo: texto(votante.get("comprovante"), "—"),
  };
}

export async function registrarVotoEleicao(
  db: Firestore,
  ctx: Contexto,
  id: string,
  enviados: string[],
  agoraFixo?: Date,
): Promise<{ titulo: string; comprovante: string; condominioId: string }> {
  garantirPermissao(ctx, "eleicoes.votar");
  if (!ctx.unitId)
    throw new ErroDeNegocio(
      "Seu cadastro não está ligado a uma casa. Fale com a administração.",
    );
  return gravarVotoDaCasa(
    db,
    {
      condominioId: ctx.condominioId,
      unitId: ctx.unitId,
      uid: ctx.uid,
      nome: ctx.nome,
      papel: ctx.papel,
      via: "portal",
    },
    id,
    enviados,
    agoraFixo,
  );
}

/** Quem está votando: a CASA (e, para a auditoria, quem/como). Nunca vem do formulário. */
export type VotanteCasa = {
  condominioId: string;
  unitId: string;
  uid: string;
  nome: string;
  papel: Contexto["papel"];
  /** "portal" (morador logado) ou "link" (link de voto da casa, sem login). */
  via: "portal" | "link";
};

/**
 * Grava o voto de UMA casa — usado pelo portal e pelo link de voto (mesma regra para os dois).
 * Quem chama já conferiu a permissão (portal) ou o código do link (link).
 */
export async function gravarVotoDaCasa(
  db: Firestore,
  quem: VotanteCasa,
  id: string,
  enviados: string[],
  agoraFixo?: Date,
): Promise<{ titulo: string; comprovante: string; condominioId: string }> {
  const ctx = { condominioId: quem.condominioId };
  const unitId = quem.unitId;
  const ref = eleicoesDe(ctx, db).doc(id);
  const votanteRef = ref.collection("votantes").doc(unitId);
  // Urna em documento único, de propósito (sigilo: veja o comentário em src/lib/eleicoes.ts).
  const urnaRef = ref.collection("urna").doc("contagem");
  const casaRef = base(ctx, db).collection("units").doc(unitId);

  return db.runTransaction(async (tx) => {
    // A hora é lida a cada tentativa: um voto que tenta de novo depois das 17h é recusado.
    const agora = agoraFixo ?? new Date();
    const [doc, votante, casa] = await Promise.all([
      tx.get(ref),
      tx.get(votanteRef),
      tx.get(casaRef),
    ]);
    if (!doc.exists || doc.get("status") !== "publicada")
      throw new ErroDeNegocio("Votação não encontrada. Atualize a página.");
    const e = paraEleicao(doc.id, doc.data());
    const situacao = situacaoEleicao(e, agora);
    if (situacao === "agendada")
      throw new ErroDeNegocio("A votação ainda não abriu.");
    if (situacao === "encerrada")
      throw new ErroDeNegocio(
        "A votação já encerrou. Não é mais possível votar.",
      );
    if (votante.exists)
      throw new ErroDeNegocio(
        "Sua casa já votou nesta eleição. Cada casa vota uma vez.",
      );
    if (e.casasBloqueadas.includes(unitId)) {
      throw new ErroDeNegocio(
        "Sua casa não está liberada para votar nesta eleição. Fale com a comissão.",
      );
    }
    if (!casa.exists || casa.get("status") === "inativa") {
      throw new ErroDeNegocio(
        "Sua casa não está ativa no cadastro. Fale com a administração.",
      );
    }
    const escolha = validarEscolha(enviados, e);
    if (typeof escolha === "string") throw new ErroDeNegocio(escolha);

    // 1) quem votou: só a casa e quando (nunca a escolha nem a pessoa)
    // "comprovante" é um código sorteado para o comprovante da casa — não tem ligação com o voto.
    const comprovante = codigoComprovante();
    tx.create(votanteRef, {
      votouEm: FieldValue.serverTimestamp(),
      unidadeRotulo: texto(casa.get("rotulo"), "Casa"),
      comprovante,
    });
    // 2) urna: só contadores (+1). Nenhuma cédula individual.
    const somas: Record<string, unknown> = { cedulas: FieldValue.increment(1) };
    if (escolha.tipo === "branco") somas.brancos = FieldValue.increment(1);
    else if (escolha.tipo === "candidatos")
      somas.votos = Object.fromEntries(
        escolha.ids.map((c) => [c, FieldValue.increment(1)]),
      );
    else somas[escolha.voto] = FieldValue.increment(1);
    tx.set(urnaRef, somas, { merge: true });
    // 3) auditoria: a casa votou — de propósito SEM a escolha.
    // O "sinal" para as telas da comissão vai DEPOIS, fora da transação: quem chama (a ação
    // da página) usa marcarMudancaDepois com after(). O documento de sinais é um só para o
    // condomínio inteiro e não deve ser disputado por cada voto.
    registrarAuditoria(db, tx, {
      condominioId: quem.condominioId,
      uid: quem.uid,
      nome: quem.nome,
      papel: quem.papel,
      acao: acaoEleicao("eleicao.votar"),
      alvo: `elections/${e.id}`,
      detalhes: { unidade: unitId, via: quem.via },
      marcarSinal: false,
    });
    return { titulo: e.titulo, comprovante, condominioId: quem.condominioId };
  });
}

// ---------- Bloqueio de casas (eleicoes.gerenciar) ----------

export type CasaDaEleicao = {
  id: string;
  rotulo: string;
  numero: number | null;
  ativa: boolean;
  bloqueada: boolean;
  votou: boolean;
};

/** Casas do condomínio para a comissão marcar quem não pode votar (em ordem de número). */
export async function casasParaBloqueio(
  ctx: Contexto,
  id: string,
): Promise<CasaDaEleicao[]> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const ref = eleicoesDe(ctx).doc(id);
  const [doc, unidades, votantes] = await Promise.all([
    ref.get(),
    base(ctx).collection("units").select("rotulo", "status", "numero").get(),
    ref.collection("votantes").select().get(),
  ]);
  const bloqueadas = new Set(paraEleicao(id, doc.data()).casasBloqueadas);
  const votaram = new Set(votantes.docs.map((d) => d.id));
  return unidades.docs
    .map((d) => ({
      id: d.id,
      rotulo: texto(d.get("rotulo"), d.id),
      numero: numeroDaCasa({
        id: d.id,
        numero: d.get("numero"),
        rotulo: d.get("rotulo"),
      }),
      ativa: d.get("status") !== "inativa",
      bloqueada: bloqueadas.has(d.id),
      votou: votaram.has(d.id),
    }))
    .sort((a, b) =>
      a.rotulo.localeCompare(b.rotulo, "pt-BR", { numeric: true }),
    );
}

/**
 * Muda o bloqueio de casas: só o que a pessoa MUDOU (adicionar/remover), aplicado sobre a
 * lista atual dentro da transação — assim duas pessoas da comissão não desfazem o trabalho
 * uma da outra. Pode mudar até o encerramento. Uma casa que JÁ VOTOU não pode ser bloqueada
 * (o voto é secreto e não pode ser retirado; bloquear deixaria a ata com números errados).
 */
export async function salvarBloqueios(
  db: Firestore,
  ctx: Contexto,
  id: string,
  mudancas: { adicionar: string[]; remover: string[] },
  agoraFixo?: Date,
): Promise<{ bloqueadas: number; casasAptas: number }> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const ref = eleicoesDe(ctx, db).doc(id);
  const todas = await base(ctx, db)
    .collection("units")
    .select("rotulo", "status")
    .get();
  const rotulos = new Map(
    todas.docs.map((d) => [d.id, texto(d.get("rotulo"), d.id)]),
  );
  const remover = new Set(mudancas.remover);
  const adicionar = [...new Set(mudancas.adicionar)].filter(
    (u) => rotulos.has(u) && !remover.has(u),
  );
  return db.runTransaction(async (tx) => {
    const agora = agoraFixo ?? new Date();
    const doc = await tx.get(ref);
    if (!doc.exists)
      throw new ErroDeNegocio("Eleição não encontrada. Atualize a página.");
    const e = paraEleicao(doc.id, doc.data());
    if (situacaoEleicao(e, agora) === "encerrada")
      throw new ErroDeNegocio(
        "A votação já encerrou: o bloqueio não muda mais.",
      );
    const atuais = new Set(e.casasBloqueadas);
    const novas = adicionar.filter((u) => !atuais.has(u));
    // Casa que já votou não pode ser bloqueada.
    const votos = await Promise.all(
      novas.map((u) => tx.get(ref.collection("votantes").doc(u))),
    );
    const jaVotou = novas.filter((_, i) => votos[i].exists);
    if (jaVotou.length) {
      const nomes = jaVotou.map((u) => rotulos.get(u)).join(", ");
      throw new ErroDeNegocio(
        `${nomes} já ${jaVotou.length === 1 ? "votou" : "votaram"}: não dá para bloquear depois do voto.`,
      );
    }
    for (const u of novas) atuais.add(u);
    for (const u of remover) atuais.delete(u);
    const lista = [...atuais].sort();
    const aptas = todas.docs.filter(
      (d) => d.get("status") !== "inativa" && !atuais.has(d.id),
    ).length;
    tx.update(ref, {
      casasBloqueadas: lista,
      ...(e.status === "publicada" ? { casasAptas: aptas } : {}),
      atualizadoEm: FieldValue.serverTimestamp(),
      atualizadoPor: ctx.uid,
    });
    registrarAuditoria(db, tx, {
      condominioId: ctx.condominioId,
      uid: ctx.uid,
      nome: ctx.nome,
      papel: ctx.papel,
      acao: acaoEleicao("eleicao.bloqueio"),
      alvo: `elections/${id}`,
      detalhes: {
        titulo: e.titulo,
        bloqueadas: lista.length,
        bloqueou: novas
          .map((u) => rotulos.get(u))
          .join(", ")
          .slice(0, 1500),
        liberou: [...remover]
          .filter((u) => rotulos.has(u))
          .map((u) => rotulos.get(u))
          .join(", ")
          .slice(0, 1500),
      },
    });
    return { bloqueadas: lista.length, casasAptas: aptas };
  });
}

// ---------- Fotos dos integrantes ----------

const REGEX_FOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * Fotos dos integrantes (elections/{id}/fotos/{candidatoId} → { imagem }).
 * Imagem pequena (já reduzida no navegador), guardada como "data URL".
 * A chapa é pública para quem vota, então as fotos aparecem na cédula e no link.
 */
export async function fotosDaEleicao(condominioId: string, id: string, db: Firestore = adminDb()): Promise<Record<string, string>> {
  const snap = await eleicoesDe({ condominioId }, db).doc(id).collection("fotos").get();
  const fotos: Record<string, string> = {};
  for (const d of snap.docs) {
    const img = d.get("imagem");
    if (typeof img === "string" && REGEX_FOTO.test(img)) fotos[d.id] = img;
  }
  return fotos;
}

/** Põe, troca ou tira (imagem vazia) a foto de um integrante. Pode mudar a qualquer momento: é só a foto. */
export async function salvarFotoCandidato(
  db: Firestore,
  ctx: Contexto,
  id: string,
  candidatoId: string,
  imagem: string,
): Promise<{ nome: string }> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  if (imagem && !REGEX_FOTO.test(imagem)) throw new ErroDeNegocio("Arquivo de foto inválido.");
  const ref = eleicoesDe(ctx, db).doc(id);
  const fotoRef = ref.collection("fotos").doc(candidatoId);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new ErroDeNegocio("Eleição não encontrada. Atualize a página.");
    const e = paraEleicao(doc.id, doc.data());
    const c = e.candidatos.find((x) => x.id === candidatoId);
    if (!c) throw new ErroDeNegocio("Integrante não encontrado. Atualize a página.");
    if (imagem) tx.set(fotoRef, { imagem, atualizadoEm: FieldValue.serverTimestamp(), atualizadoPor: ctx.uid });
    else tx.delete(fotoRef);
    registrarAuditoria(db, tx, {
      condominioId: ctx.condominioId,
      uid: ctx.uid,
      nome: ctx.nome,
      papel: ctx.papel,
      acao: acaoEleicao("eleicao.foto"),
      alvo: `elections/${id}`,
      detalhes: { integrante: c.nome, acao: imagem ? "trocou" : "tirou" },
    });
    return { nome: c.nome };
  });
}
