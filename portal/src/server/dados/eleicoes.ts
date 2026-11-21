import "server-only";
import { randomInt } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";
import { after } from "next/server";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import { enviarPush } from "../push";
import { PAPEIS } from "@/lib/permissoes";
import { registrarAuditoria, type AcaoAuditada } from "../auditoria";
import { ErroDeNegocio } from "../acoes/resultado";
import {
  MODOS_ELEICAO,
  REGRAS_DESEMPATE,
  STATUS_ELEICAO,
  apurar,
  apurarChapa,
  ehVotacaoDeTeste,
  porcentagemParticipacao,
  resultadoParaPainel,
  resumoNumerosResultado,
  situacaoEleicao,
  somarUrna,
  tituloResultado,
  validarEscolha,
  type Candidato,
  type ModoEleicao,
  type PainelEleicao,
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
 * - a auditoria registra só que a CASA votou e por onde (portal ou link) — nunca em quem, nem
 *   a pessoa que votou (uid fixo "voto:casa"). E só a comissão vê qual casa (veja
 *   ultimosRegistrosDeAuditoria em src/server/dados/gestao.ts).
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
  | "eleicao.foto"
  | "eleicao.resultado";
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
  /**
   * LISTA CONGELADA das casas aptas (ids), gravada ao publicar e ao mudar o bloqueio antes de
   * abrir. Com ela, inativar/reativar uma casa no cadastro durante a votação não muda quem pode
   * votar (decisão de 21/11/2026). null = eleição antiga, sem a lista (vale o cadastro atual).
   */
  casasAptasIds: string[] | null;
  /** Casas que a comissão bloqueou de votar nesta eleição (ids das unidades). */
  casasBloqueadas: string[];
  criadoPorNome: string;
  criadoEm: Date | null;
  publicadaEm: Date | null;
  /** Quando o resultado foi divulgado a todos (aviso no celular e no sino). null = ainda não. */
  resultadoDivulgadoEm: Date | null;
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
    casasAptasIds: Array.isArray(d?.casasAptasIds)
      ? (d.casasAptasIds as unknown[]).filter((x): x is string => typeof x === "string")
      : null,
    casasBloqueadas: Array.isArray(d?.casasBloqueadas)
      ? (d.casasBloqueadas as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : [],
    criadoPorNome: texto(d?.criadoPorNome),
    criadoEm: data(d?.criadoEm),
    publicadaEm: data(d?.publicadaEm),
    resultadoDivulgadoEm: data(d?.resultadoDivulgadoEm),
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
  // Nulos = casas aptas que não votaram (contarNulos). Eleição antiga sem casasAptas: sem nulos.
  if (e.modo === "chapa")
    return apurarChapa({ sim: total.sim, nao: total.nao, cedulas: total.cedulas }, e.casasAptas);
  return apurar(e, { votos: total.votos, brancos: total.brancos, cedulas: total.cedulas }, e.casasAptas);
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
  /** Quando o resultado foi divulgado a todos (aviso no celular e no sino). */
  resultadoDivulgadoEm: Date | null;
  /** Quando a comissão publicou (linha do tempo da ata). null = rascunho ou eleição antiga. */
  publicadaEm: Date | null;
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
    resultadoDivulgadoEm: e.resultadoDivulgadoEm,
    publicadaEm: e.publicadaEm,
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
  let e = paraEleicao(doc.id, doc.data());
  // Eleição publicada antes de existir a lista congelada: a comissão abriu a tela antes de
  // abrir a votação → grava a lista agora (uma vez só; as próximas aberturas já a encontram).
  if (precisaCongelarLista(e, new Date())) {
    try {
      e = (await congelarListaSeFaltar(adminDb(), ctx.condominioId, e.id)) ?? e;
    } catch (erro) {
      // A tela abre do mesmo jeito; a próxima abertura tenta de novo.
      console.error("Votação: não foi possível gravar a lista de casas aptas", erro);
    }
  }
  garantirFinalizacao(ctx.condominioId, e);
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

/** Publicada, ainda AGENDADA e sem a lista congelada de casas aptas (eleição publicada antes dela existir). */
export function precisaCongelarLista(
  e: Pick<EleicaoInterna, "status" | "abreEm" | "fechaEm" | "casasAptasIds">,
  agora: Date,
): boolean {
  return e.status === "publicada" && e.casasAptasIds === null && situacaoEleicao(e, agora) === "agendada";
}

/**
 * LISTA CONGELADA QUE FALTAVA (a eleição real foi publicada antes de a lista existir).
 * Grava a lista de casas aptas (ativas − bloqueadas) e casasAptas, numa transação que confere
 * DE NOVO que a eleição ainda está agendada e ainda sem lista (duas telas ao mesmo tempo:
 * só a primeira grava). Depois de aberta, nunca grava: aí vale o cadastro, que fica travado
 * com a votação aberta (conferirVotacaoAbertaAntesDoCadastro).
 * Devolve a eleição já com a lista, ou null se não precisou (ou não pôde) gravar.
 */
export async function congelarListaSeFaltar(
  db: Firestore,
  condominioId: string,
  id: string,
  agoraFixo?: Date,
): Promise<EleicaoInterna | null> {
  const ctx = { condominioId };
  const ref = eleicoesDe(ctx, db).doc(id);
  const unidades = base(ctx, db).collection("units").select("status");
  return db.runTransaction(async (tx) => {
    // A hora é lida a cada tentativa da transação.
    const agora = agoraFixo ?? new Date();
    const doc = await tx.get(ref);
    if (!doc.exists) return null;
    const e = paraEleicao(doc.id, doc.data());
    if (!precisaCongelarLista(e, agora)) return null;
    const bloqueadas = new Set(e.casasBloqueadas);
    const aptasIds = (await tx.get(unidades)).docs
      .filter((d) => d.get("status") !== "inativa" && !bloqueadas.has(d.id))
      .map((d) => d.id)
      .sort();
    // Sem nenhuma casa ativa, não grava lista vazia (ninguém poderia votar): deixa como está.
    if (aptasIds.length === 0) return null;
    tx.update(ref, { casasAptas: aptasIds.length, casasAptasIds: aptasIds });
    registrarAuditoria(db, tx, {
      condominioId,
      uid: "sistema:lista-aptas",
      nome: "Lista de casas aptas (automática)",
      acao: acaoEleicao("eleicao.bloqueio"),
      alvo: `elections/${id}`,
      detalhes: {
        titulo: e.titulo,
        casasAptas: aptasIds.length,
        motivo: "Lista de casas aptas guardada antes de a votação abrir (casas ativas menos as bloqueadas).",
      },
      // Quem abriu a tela já recebe os números novos; as outras telas não precisam recarregar.
      marcarSinal: false,
    });
    return { ...e, casasAptas: aptasIds.length, casasAptasIds: aptasIds };
  });
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
    const aptasIds = ativas.filter((u) => !bloqueadas.has(u)).sort();
    const aptas = aptasIds.length;
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
        casasAptasIds: aptasIds,
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
        casasAptasIds: FieldValue.delete(),
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
  garantirFinalizacao(ctx.condominioId, e);
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
    condominioNome: texto(cond.get("nome"), "Residencial Jardins do Lago"),
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
  // Só a casa e a via: quem é a pessoa não vai para lugar nenhum (nem para a auditoria).
  return gravarVotoDaCasa(
    db,
    { condominioId: ctx.condominioId, unitId: ctx.unitId, via: "portal" },
    id,
    enviados,
    agoraFixo,
  );
}

/** Quem está votando: a CASA e por onde. Nunca vem do formulário. */
export type VotanteCasa = {
  condominioId: string;
  unitId: string;
  /**
   * Quem chamou (link, script). NÃO é gravado em lugar nenhum — nem na auditoria —, para o
   * registro do voto não dizer quem da casa votou. Fica no tipo só para quem já passa.
   */
  uid?: string;
  nome?: string;
  papel?: Contexto["papel"];
  /** "portal" (morador logado) ou "link" (link de voto da casa, sem login). */
  via: "portal" | "link";
};

/** Como o voto aparece na auditoria: nunca a pessoa, só "Voto da casa". */
export const AUDITORIA_DO_VOTO = { uid: "voto:casa", nome: "Voto da casa" } as const;

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
    if (!casa.exists) {
      throw new ErroDeNegocio(
        "Sua casa não está ativa no cadastro. Fale com a administração.",
      );
    }
    // Lista congelada (eleições novas): vale quem era apto ao abrir, não o cadastro de agora.
    if (e.casasAptasIds ? !e.casasAptasIds.includes(unitId) : casa.get("status") === "inativa") {
      throw new ErroDeNegocio(
        e.casasAptasIds
          ? "Sua casa não estava apta quando a votação foi publicada. Fale com a comissão."
          : "Sua casa não está ativa no cadastro. Fale com a administração.",
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
    // 3) auditoria: a casa votou — de propósito SEM a escolha e SEM a pessoa (nem nome, nem
    // uid, nem papel): só a casa e a via. A casa só aparece para a comissão (gestao.ts).
    // O "sinal" para as telas da comissão vai DEPOIS, fora da transação: quem chama (a ação
    // da página) usa marcarMudancaDepois com after(). O documento de sinais é um só para o
    // condomínio inteiro e não deve ser disputado por cada voto.
    registrarAuditoria(db, tx, {
      condominioId: quem.condominioId,
      uid: AUDITORIA_DO_VOTO.uid,
      nome: AUDITORIA_DO_VOTO.nome,
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
 * uma da outra. Só pode mudar ANTES de a votação abrir (rascunho ou agendada): aberta ou
 * encerrada, a lista fica congelada. Uma casa que JÁ VOTOU nunca pode ser bloqueada
 * (o voto é secreto e não pode ser retirado; bloquear deixaria a ata com números errados).
 */
export function bloqueioPodeMudar(e: { status: StatusEleicao; abreEm: Date; fechaEm: Date }, agora = new Date()): boolean {
  const s = situacaoEleicao(e, agora);
  return s === "rascunho" || s === "agendada";
}

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
    // Decisão de 21/11/2026: bloquear e desbloquear só ANTES de abrir. Com a votação em
    // andamento, a lista de casas aptas fica congelada (ninguém muda as regras no meio).
    const situacao = situacaoEleicao(e, agora);
    if (situacao === "encerrada")
      throw new ErroDeNegocio(
        "A votação já encerrou: o bloqueio não muda mais.",
      );
    if (situacao === "aberta")
      throw new ErroDeNegocio(
        "A votação está aberta: não dá para bloquear nem desbloquear casas até o encerramento.",
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
    const aptasIds = todas.docs
      .filter((d) => d.get("status") !== "inativa" && !atuais.has(d.id))
      .map((d) => d.id)
      .sort();
    const aptas = aptasIds.length;
    tx.update(ref, {
      casasBloqueadas: lista,
      ...(e.status === "publicada" ? { casasAptas: aptas, casasAptasIds: aptasIds } : {}),
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

// ---------- Painel público: a eleição em destaque no Início de TODOS ----------

/**
 * A eleição que aparece no topo do Início (moradores e equipe): a aberta; senão a próxima
 * agendada; senão uma encerrada há até 7 dias. Rascunho nunca aparece.
 */
export async function eleicaoEmDestaque(
  condominioId: string,
  agora = new Date(),
  db: Firestore = adminDb(),
): Promise<EleicaoInterna | null> {
  const snap = await eleicoesDe({ condominioId }, db).where("status", "==", "publicada").get();
  const lista = snap.docs.map((d) => paraEleicao(d.id, d.data()));
  const semana = 7 * 24 * 60 * 60 * 1000;
  const doisDias = 48 * 60 * 60 * 1000;
  const encerradas = lista
    .filter((e) => situacaoEleicao(e, agora) === "encerrada")
    .sort((a, b) => b.fechaEm.getTime() - a.fechaEm.getTime());
  return (
    lista
      .filter((e) => situacaoEleicao(e, agora) === "aberta")
      .sort((a, b) => a.fechaEm.getTime() - b.fechaEm.getTime())[0] ??
    // Resultado que acabou de sair (até 2 dias) vem antes de uma próxima eleição agendada.
    encerradas.find((e) => agora.getTime() - e.fechaEm.getTime() < doisDias) ??
    lista
      .filter((e) => situacaoEleicao(e, agora) === "agendada")
      .sort((a, b) => a.abreEm.getTime() - b.abreEm.getTime())[0] ??
    lista
      .filter((e) => situacaoEleicao(e, agora) === "encerrada" && agora.getTime() - e.fechaEm.getTime() < semana)
      .sort((a, b) => b.fechaEm.getTime() - a.fechaEm.getTime())[0] ??
    null
  );
}

/**
 * Monta o PAINEL PÚBLICO de uma eleição (veja PainelEleicao em src/lib/eleicoes.ts).
 * SIGILO: só totais do condomínio inteiro (quantas casas votaram e quantas faltam) e, depois
 * do encerramento, a soma dos votos. Nunca QUAIS casas votaram, nunca parcial de votos.
 */
export async function montarPainel(
  condominioId: string,
  e: EleicaoInterna,
  agora = new Date(),
  db: Firestore = adminDb(),
): Promise<PainelEleicao> {
  const situacao = situacaoEleicao(e, agora);
  const liberada = apuracaoLiberada(e, agora);
  garantirFinalizacao(condominioId, e);
  const [votaram, apuracao] = await Promise.all([
    situacao === "agendada" ? Promise.resolve(0) : contarVotantes({ condominioId }, e.id, db),
    liberada ? lerApuracao({ condominioId }, e, agora, db) : Promise.resolve(null),
  ]);
  const casasAptas = e.casasAptas ?? 0;
  return {
    id: e.id,
    titulo: e.titulo,
    cargo: e.cargo,
    modo: e.modo,
    fase: situacao === "agendada" ? "agendada" : situacao === "aberta" ? "aberta" : liberada ? "resultado" : "apurando",
    abreEm: e.abreEm.getTime(),
    fechaEm: e.fechaEm.getTime(),
    resultadoEm: e.fechaEm.getTime() + CARENCIA_APURACAO_MS,
    casasAptas,
    votaram,
    faltam: Math.max(0, casasAptas - votaram),
    participacao: porcentagemParticipacao(votaram, casasAptas),
    integrantes: e.candidatos.map((c) => ({ nome: c.nome, funcao: c.funcao })),
    resultado: apuracao ? resultadoParaPainel(apuracao) : null,
    geradoEm: agora.getTime(),
  };
}

/** Painel da eleição em destaque do condomínio (null = nenhuma eleição para mostrar). */
export async function painelEmDestaque(
  condominioId: string,
  agora = new Date(),
  db: Firestore = adminDb(),
): Promise<{ painel: PainelEleicao; eleicao: EleicaoInterna } | null> {
  const e = await eleicaoEmDestaque(condominioId, agora, db);
  return e ? { painel: await montarPainel(condominioId, e, agora, db), eleicao: e } : null;
}

/**
 * O mesmo painel, guardado por alguns segundos em cada servidor: no dia da eleição muitas
 * telas perguntam ao mesmo tempo, e o número de casas que votaram não precisa ser relido
 * a cada pergunta. Ao virar de fase (abriu, encerrou, saiu o resultado), relê na hora.
 */
const VALIDADE_PAINEL_MS = 4000;
type PainelComEleicao = Awaited<ReturnType<typeof painelEmDestaque>>;
const painelGuardado = new Map<string, { ate: number; valor: PainelComEleicao }>();

async function guardarPainel(chave: string, ler: (agora: Date) => Promise<PainelComEleicao>): Promise<PainelComEleicao> {
  const agora = Date.now();
  const g = painelGuardado.get(chave);
  const p = g?.valor?.painel;
  const virouFase =
    !!p &&
    ((p.fase === "agendada" && agora >= p.abreEm) ||
      (p.fase === "aberta" && agora >= p.fechaEm) ||
      (p.fase === "apurando" && agora >= p.resultadoEm));
  if (g && g.ate > agora && !virouFase) return g.valor;
  const valor = await ler(new Date(agora));
  if (painelGuardado.size > 500) painelGuardado.clear();
  painelGuardado.set(chave, { ate: agora + VALIDADE_PAINEL_MS, valor });
  return valor;
}

export function painelEmDestaqueGuardado(condominioId: string): Promise<PainelComEleicao> {
  return guardarPainel(`destaque:${condominioId}`, (agora) => painelEmDestaque(condominioId, agora));
}

/**
 * Painel de UMA eleição (a do link de voto), guardado por alguns segundos como o do Início.
 * Rascunho ou eleição que não existe → null.
 */
export function painelDaEleicaoGuardado(condominioId: string, eleicaoId: string, db: Firestore = adminDb()): Promise<PainelComEleicao> {
  return guardarPainel(`eleicao:${condominioId}:${eleicaoId}`, async (agora) => {
    const doc = await eleicoesDe({ condominioId }, db).doc(eleicaoId).get();
    if (!doc.exists || doc.get("status") !== "publicada") return null;
    const eleicao = paraEleicao(doc.id, doc.data());
    return { painel: await montarPainel(condominioId, eleicao, agora, db), eleicao };
  });
}

/** Situação da PRÓPRIA casa (nunca o voto). null = a pessoa não é de uma casa. */
export async function situacaoDaCasa(
  ctx: Pick<Contexto, "condominioId" | "unitId">,
  e: Pick<EleicaoInterna, "id" | "casasBloqueadas">,
  db: Firestore = adminDb(),
): Promise<{ votou: boolean; bloqueada: boolean } | null> {
  if (!ctx.unitId) return null;
  const v = await eleicoesDe(ctx, db).doc(e.id).collection("votantes").doc(ctx.unitId).get();
  return { votou: v.exists, bloqueada: e.casasBloqueadas.includes(ctx.unitId) };
}

// ---------- Resultado: divulgação automática para TODOS ----------

/**
 * DIVULGA O RESULTADO (uma vez só por eleição): depois do encerramento + carência, grava o
 * resumo do resultado na eleição, registra na auditoria (o que faz as telas abertas se
 * atualizarem) e manda o aviso no celular para TODAS as pessoas ativas do condomínio.
 * - Quem chama primeiro faz; as outras chamadas ao mesmo tempo não repetem (a transação confere
 *   "resultadoDivulgadoEm" de novo antes de gravar).
 * - Quem dispara: qualquer tela que leia a eleição depois do horário (garantirFinalizacao) e,
 *   como reserva, a rotina diária /api/eleicoes/finalizar.
 */
export async function finalizarEleicao(
  db: Firestore,
  condominioId: string,
  id: string,
  agora = new Date(),
): Promise<{ divulgou: boolean; apuracao: ResultadoApuracao | null }> {
  const ref = eleicoesDe({ condominioId }, db).doc(id);
  const doc = await ref.get();
  if (!doc.exists) return { divulgou: false, apuracao: null };
  const e = paraEleicao(doc.id, doc.data());
  if (e.status !== "publicada" || e.resultadoDivulgadoEm || !apuracaoLiberada(e, agora))
    return { divulgou: false, apuracao: null };
  const apuracao = await lerApuracao({ condominioId }, e, agora, db);
  const titulo = tituloResultado(apuracao);
  const numeros = resumoNumerosResultado(apuracao);
  // Eleição que encerrou há mais de 2 dias (ex.: antiga, de antes desta função existir):
  // marca como divulgada SEM aviso no celular e sem entrar no sino — ninguém recebe aviso velho.
  const semAviso = agora.getTime() - e.fechaEm.getTime() > AVISO_ATE_MS;
  const divulgou = await db.runTransaction(async (tx) => {
    const atual = await tx.get(ref);
    if (!atual.exists || atual.get("resultadoDivulgadoEm")) return false;
    tx.update(ref, {
      resultadoDivulgadoEm: FieldValue.serverTimestamp(),
      resultadoFinal: {
        modo: apuracao.modo,
        titulo,
        numeros,
        cedulas: apuracao.cedulas,
        casasAptas: apuracao.casasAptas,
        nulos: apuracao.nulos,
        semAviso,
        ...(apuracao.modo === "chapa"
          ? { sim: apuracao.sim, nao: apuracao.nao, minimo: apuracao.minimo, eleita: apuracao.eleita }
          : { brancos: apuracao.brancos, eleitos: apuracao.eleitos }),
      },
    });
    registrarAuditoria(db, tx, {
      condominioId,
      uid: "sistema:apuracao",
      nome: "Apuração automática",
      acao: acaoEleicao("eleicao.resultado"),
      alvo: `elections/${id}`,
      detalhes: { titulo: e.titulo, resultado: titulo, numeros, aviso: !semAviso },
    });
    return true;
  });
  if (divulgou && !semAviso) {
    // Todo mundo do condomínio. Ao tocar, abre a tela onde o resultado aparece no topo com a
    // animação: moradores → Início; administração, conselho e reservas → Painel. A portaria
    // não tem o painel na tela dela: o próprio aviso já traz o resultado.
    const comum = { titulo: `Resultado da votação: ${titulo}`, tag: `resultado-${id}` };
    const texto = `${e.titulo} — ${numeros}.`;
    // Votação de TESTE: só a comissão recebe o aviso (os moradores não são incomodados).
    if (ehVotacaoDeTeste(e.titulo)) {
      await enviarPush(condominioId, { permissao: "eleicoes.gerenciar" }, { ...comum, texto: `${texto} (votação de teste)`, url: `/admin/votacao/${id}` });
      return { divulgou, apuracao };
    }
    await Promise.all([
      enviarPush(condominioId, { papeis: ["morador"] }, { ...comum, texto: `${texto} Toque para ver.`, url: "/inicio" }),
      enviarPush(
        condominioId,
        { papeis: PAPEIS.filter((p) => p !== "morador" && p !== "portaria") },
        { ...comum, texto: `${texto} Toque para ver.`, url: "/admin" },
      ),
      enviarPush(condominioId, { papeis: ["portaria"] }, { ...comum, texto, url: "/" }),
    ]);
  }
  return { divulgou, apuracao };
}

/** Até quanto tempo depois do encerramento a divulgação ainda manda aviso no celular. */
export const AVISO_ATE_MS = 48 * 60 * 60 * 1000;

/**
 * Cadastro de casas x votação (decisão de 21/11/2026): com a votação ABERTA, criar, ativar ou
 * inativar casa não é permitido (seria mudar quem vota no meio da votação). Chame ANTES de gravar.
 */
export async function conferirVotacaoAbertaAntesDoCadastro(condominioId: string, db: Firestore = adminDb(), agora = new Date()): Promise<void> {
  const snap = await eleicoesDe({ condominioId }, db).where("status", "==", "publicada").get();
  const aberta = snap.docs.map((d) => paraEleicao(d.id, d.data())).find((e) => situacaoEleicao(e, agora) === "aberta");
  if (aberta)
    throw new ErroDeNegocio(
      `A votação "${aberta.titulo}" está aberta: não dá para cadastrar, ativar nem inativar casas até o encerramento (as casas aptas ficaram congeladas quando ela abriu).`,
    );
}

/**
 * Antes de abrir, a lista congelada de casas aptas das eleições AGENDADAS acompanha o cadastro:
 * chame DEPOIS de ativar, inativar ou criar casas.
 */
export async function recalcularAptasDasAgendadas(condominioId: string, db: Firestore = adminDb()): Promise<void> {
  const snap = await eleicoesDe({ condominioId }, db).where("status", "==", "publicada").get();
  const agendadas = snap.docs.filter((d) => situacaoEleicao(paraEleicao(d.id, d.data()), new Date()) === "agendada");
  if (!agendadas.length) return;
  const unidades = await base({ condominioId }, db).collection("units").select("status").get();
  const ativas = unidades.docs.filter((u) => u.get("status") !== "inativa").map((u) => u.id);
  for (const d of agendadas) {
    await db.runTransaction(async (tx) => {
      const atual = await tx.get(d.ref);
      const e = paraEleicao(atual.id, atual.data());
      if (e.status !== "publicada" || situacaoEleicao(e, new Date()) !== "agendada") return;
      const bloqueadas = new Set(e.casasBloqueadas);
      const aptasIds = ativas.filter((u) => !bloqueadas.has(u)).sort();
      tx.update(d.ref, { casasAptas: aptasIds.length, casasAptasIds: aptasIds });
    });
  }
}

/**
 * Se o resultado já pode sair e ainda não foi divulgado, divulga DEPOIS de responder a
 * quem abriu a tela (after): a tela não espera. Usa sempre a hora REAL (nunca uma hora
 * simulada de quem chamou).
 */
export function garantirFinalizacao(condominioId: string, e: EleicaoInterna): void {
  if (e.status !== "publicada" || e.resultadoDivulgadoEm || !apuracaoLiberada(e, new Date())) return;
  const rodar = async () => {
    try {
      await finalizarEleicao(adminDb(), condominioId, e.id);
    } catch (erro) {
      console.error("Votação: não foi possível divulgar o resultado", erro);
    }
  };
  try {
    after(rodar);
  } catch {
    // Fora de um pedido (ex.: script): divulga na hora.
    void rodar();
  }
}

/** Rotina de reserva: divulga o resultado das eleições encerradas de TODOS os condomínios. */
export async function finalizarPendentes(db: Firestore = adminDb(), agora = new Date()): Promise<number> {
  const conds = await db.collection("condominiums").select().get();
  let divulgadas = 0;
  for (const c of conds.docs) {
    const snap = await eleicoesDe({ condominioId: c.id }, db).where("status", "==", "publicada").get();
    for (const d of snap.docs) {
      const e = paraEleicao(d.id, d.data());
      if (e.resultadoDivulgadoEm || !apuracaoLiberada(e, agora)) continue;
      try {
        if ((await finalizarEleicao(db, c.id, e.id, agora)).divulgou) divulgadas++;
      } catch (erro) {
        console.error("Votação: rotina não conseguiu divulgar", c.id, e.id, erro);
      }
    }
  }
  return divulgadas;
}
