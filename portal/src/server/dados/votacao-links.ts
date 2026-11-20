import "server-only";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { adminDb, usaEmuladores } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import { registrarAuditoria } from "../auditoria";
import { consumirTentativa, janelaDoLimite, limiteEstourado, refLimite } from "../rate-limit";
import { ErroDeNegocio } from "../acoes/resultado";
import {
  acaoEleicao,
  apuracaoLiberada,
  base,
  comprovanteDaCasa,
  fotosDaEleicao,
  contarVotantes,
  data,
  eleicoesDe,
  gravarVotoDaCasa,
  lerApuracao,
  paraEleicao,
  semNascimento,
  texto,
} from "./eleicoes";
import {
  situacaoEleicao,
  type Candidato,
  type ModoEleicao,
  type ResultadoApuracao,
  type SituacaoEleicao,
} from "@/lib/eleicoes";
import { numeroDaCasa, type ContatoLido } from "@/lib/contatos-votacao";
import { FUSO_PADRAO } from "@/lib/formato";

/**
 * LINK DE VOTO POR CASA (sem login) e CONTATOS para o WhatsApp.
 *
 * - Cada casa recebe um CÓDIGO único por eleição (10 letras/números, sem os que se confundem).
 *   O link é /votar/{código}. Quem tem o link vota PELA CASA, sem entrar no portal.
 * - O código é procurado pelo seu hash em `votoCodigos/{hash}` (fora do condomínio, para achar
 *   rápido). O código em si fica em `elections/{id}/links/{unitId}`, só para a comissão reenviar.
 *   O navegador não lê nada disso (firestore.rules nega tudo).
 * - Junto com o link vai uma SENHA de 6 números (na mesma mensagem, com o passo a passo).
 *   O link sozinho não abre a cédula: a pessoa digita a senha; errou 5 vezes, o link
 *   trava por 15 minutos. Acertou, fica um cookie (só deste link, por 6 horas) com um
 *   "lembrete" ASSINADO pelo servidor (tokenDoLink): quem tem só o link não consegue
 *   montar esse cookie para testar senhas sem passar pelos limites.
 *   No índice fica só o hash da senha; a senha em si fica em links/{unitId} para reenviar.
 * - O voto pelo link usa a MESMA gravação do voto pelo portal (gravarVotoDaCasa): uma casa,
 *   um voto, na mesma transação. Se outra pessoa abrir o link depois, vê "voto já realizado".
 * - Contatos: `contatosVotacao/{unitId}` com nome e telefones (55DDNNNNNNNNN). Só a comissão vê.
 */

const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // sem 0/O, 1/I/L
export const TAMANHO_CODIGO = 10;
export const REGEX_CODIGO = new RegExp(`^[${ALFABETO}]{${TAMANHO_CODIGO}}$`);

export function novoCodigo(): string {
  let c = "";
  for (let i = 0; i < TAMANHO_CODIGO; i++)
    c += ALFABETO[randomInt(ALFABETO.length)];
  return c;
}

/** Normaliza o que a pessoa digitou ou o que veio no link (maiúsculas, sem espaços/traços). */
export function limparCodigo(bruto: string): string | null {
  const c = bruto.toUpperCase().replace(/[\s-]/g, "");
  return REGEX_CODIGO.test(c) ? c : null;
}

export function novaSenha(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export const hashSenha = (codigo: string, senha: string) =>
  createHash("sha256").update(`senha:${codigo}:${senha}`).digest("hex");

/** Compara dois hashes sem vazar tempo. */
export function mesmoHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Nome do cookie que lembra que a senha deste link foi digitada certa. */
export const cookieDoLink = (codigo: string) => `voto_${codigo}`;

/**
 * Segredo do servidor que assina o cookie do link. Ordem: VOTO_COOKIE_SEGREDO (se
 * configurado, 32+ caracteres); senão, derivado da chave privada do Firebase, que
 * sempre existe no servidor de produção (nunca sai do servidor); no simulador e no
 * computador de desenvolvimento, um valor fixo de teste.
 */
function segredoDoCookie(): string {
  const proprio = process.env.VOTO_COOKIE_SEGREDO;
  if (proprio && proprio.length >= 32) return proprio;
  const chave = process.env.FIREBASE_PRIVATE_KEY;
  if (chave && chave.length >= 64) return createHash("sha256").update(`voto-cookie:${chave}`).digest("hex");
  if (usaEmuladores() || process.env.NODE_ENV !== "production") return "desenvolvimento:cookie-do-link-de-voto:nao-usar";
  throw new Error("Configure VOTO_COOKIE_SEGREDO (pelo menos 32 caracteres) nas variáveis do servidor.");
}

/**
 * Valor do cookie do link depois da senha certa: uma ASSINATURA do servidor (HMAC) do
 * código + hash da senha. Sem o segredo, ninguém consegue montar este valor, então o
 * cookie não serve para testar senhas. "Trocar link" muda o hash da senha e invalida
 * os cookies antigos na hora.
 */
export const tokenDoLink = (codigo: string, senhaHash: string) =>
  createHmac("sha256", segredoDoCookie()).update(`voto-link:${codigo}:${senhaHash}`).digest("hex");

export const hashCodigo = (codigo: string) =>
  createHash("sha256").update(`voto:${codigo}`).digest("hex");

const codigosCol = (db: Firestore) => db.collection("votoCodigos");
const linksDe = (
  ctx: Pick<Contexto, "condominioId">,
  id: string,
  db: Firestore,
) => eleicoesDe(ctx, db).doc(id).collection("links");
const contatosDe = (ctx: Pick<Contexto, "condominioId">, db: Firestore) =>
  base(ctx, db).collection("contatosVotacao");

function auditar(
  db: Firestore,
  tx: FirebaseFirestore.Transaction | FirebaseFirestore.WriteBatch,
  ctx: Contexto,
  acao: "eleicao.links" | "eleicao.contatos",
  alvo: string,
  detalhes: Record<string, string | number | boolean | null>,
) {
  registrarAuditoria(db, tx as FirebaseFirestore.Transaction, {
    condominioId: ctx.condominioId,
    uid: ctx.uid,
    nome: ctx.nome,
    papel: ctx.papel,
    acao: acaoEleicao(acao),
    alvo,
    detalhes,
  });
}

// ---------- Comissão: gerar e trocar links ----------

/** Cria o link das casas ativas que ainda não têm (não mexe nos que já existem). */
export async function gerarLinksFaltantes(
  db: Firestore,
  ctx: Contexto,
  id: string,
): Promise<{ gerados: number; total: number }> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const ref = eleicoesDe(ctx, db).doc(id);
  const [doc, unidades, links] = await Promise.all([
    ref.get(),
    base(ctx, db).collection("units").select("status").get(),
    linksDe(ctx, id, db).select().get(),
  ]);
  if (!doc.exists)
    throw new ErroDeNegocio("Eleição não encontrada. Atualize a página.");
  const e = paraEleicao(doc.id, doc.data());
  if (situacaoEleicao(e, new Date()) === "encerrada")
    throw new ErroDeNegocio("A votação já encerrou.");
  const tem = new Set(links.docs.map((d) => d.id));
  const faltam = unidades.docs
    .filter((u) => u.get("status") !== "inativa" && !tem.has(u.id))
    .map((u) => u.id);
  // Lotes de até 200 casas (2 gravações cada + auditoria, abaixo do limite de 500 por lote).
  for (let i = 0; i < faltam.length; i += 200) {
    const lote = db.batch();
    for (const unitId of faltam.slice(i, i + 200)) {
      const codigo = novoCodigo();
      const senha = novaSenha();
      const hash = hashCodigo(codigo);
      lote.create(codigosCol(db).doc(hash), {
        condominioId: ctx.condominioId,
        eleicaoId: id,
        unitId,
        senhaHash: hashSenha(codigo, senha),
        criadoEm: FieldValue.serverTimestamp(),
      });
      lote.create(linksDe(ctx, id, db).doc(unitId), {
        codigo,
        senha,
        hash,
        criadoEm: FieldValue.serverTimestamp(),
        criadoPor: ctx.uid,
      });
    }
    if (i === 0)
      auditar(db, lote, ctx, "eleicao.links", `elections/${id}`, {
        titulo: e.titulo,
        gerados: faltam.length,
      });
    await lote.commit();
  }
  return { gerados: faltam.length, total: tem.size + faltam.length };
}

/** Troca o link e a senha de UMA casa (ex.: vazou). O link antigo para de funcionar na hora. */
export async function trocarLink(
  db: Firestore,
  ctx: Contexto,
  id: string,
  unitId: string,
): Promise<void> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const ref = eleicoesDe(ctx, db).doc(id);
  const linkRef = linksDe(ctx, id, db).doc(unitId);
  const casaRef = base(ctx, db).collection("units").doc(unitId);
  await db.runTransaction(async (tx) => {
    const [doc, link, casa] = await Promise.all([
      tx.get(ref),
      tx.get(linkRef),
      tx.get(casaRef),
    ]);
    if (!doc.exists)
      throw new ErroDeNegocio("Eleição não encontrada. Atualize a página.");
    if (!casa.exists) throw new ErroDeNegocio("Casa não encontrada.");
    const e = paraEleicao(doc.id, doc.data());
    if (situacaoEleicao(e, new Date()) === "encerrada")
      throw new ErroDeNegocio("A votação já encerrou.");
    const antigo = link.get("hash");
    if (typeof antigo === "string") tx.delete(codigosCol(db).doc(antigo));
    const codigo = novoCodigo();
    const senha = novaSenha();
    const hash = hashCodigo(codigo);
    tx.create(codigosCol(db).doc(hash), {
      condominioId: ctx.condominioId,
      eleicaoId: id,
      unitId,
      senhaHash: hashSenha(codigo, senha),
      criadoEm: FieldValue.serverTimestamp(),
    });
    tx.set(linkRef, {
      codigo,
      senha,
      hash,
      criadoEm: FieldValue.serverTimestamp(),
      criadoPor: ctx.uid,
    });
    auditar(db, tx, ctx, "eleicao.links", `elections/${id}`, {
      titulo: e.titulo,
      trocou: texto(casa.get("rotulo"), unitId),
    });
  });
}

/** Marca que o link foi enviado pelo WhatsApp (só para a comissão acompanhar). */
export async function marcarEnviado(
  db: Firestore,
  ctx: Contexto,
  id: string,
  unitId: string,
): Promise<void> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const linkRef = linksDe(ctx, id, db).doc(unitId);
  await db.runTransaction(async (tx) => {
    const link = await tx.get(linkRef);
    if (!link.exists)
      throw new ErroDeNegocio(
        "Esta casa ainda não tem link. Gere os links primeiro.",
      );
    tx.update(linkRef, {
      enviadoEm: FieldValue.serverTimestamp(),
      enviadoPor: ctx.uid,
      envios: FieldValue.increment(1),
    });
  });
}

// ---------- Comissão: lista para enviar ----------

export type LinhaEnvio = {
  unitId: string;
  rotulo: string;
  numero: number | null;
  ativa: boolean;
  nome: string;
  telefones: string[];
  codigo: string | null;
  senha: string | null;
  enviadoEm: Date | null;
  votou: boolean;
  bloqueada: boolean;
};

export async function listarEnvios(
  ctx: Contexto,
  id: string,
  db: Firestore = adminDb(),
): Promise<LinhaEnvio[]> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const ref = eleicoesDe(ctx, db).doc(id);
  const [doc, unidades, links, contatos, votantes] = await Promise.all([
    ref.get(),
    base(ctx, db)
      .collection("units")
      .select("rotulo", "status", "numero")
      .get(),
    linksDe(ctx, id, db).get(),
    contatosDe(ctx, db).get(),
    ref.collection("votantes").select().get(),
  ]);
  const e = paraEleicao(id, doc.data());
  const bloqueadas = new Set(e.casasBloqueadas);
  const linkDe = new Map(links.docs.map((d) => [d.id, d]));
  const contatoDe = new Map(contatos.docs.map((d) => [d.id, d]));
  const votaram = new Set(votantes.docs.map((d) => d.id));
  return unidades.docs
    .map((u) => {
      const l = linkDe.get(u.id);
      const c = contatoDe.get(u.id);
      const rotulo = texto(u.get("rotulo"), u.id);
      return {
        unitId: u.id,
        rotulo,
        numero: numeroDaCasa({ id: u.id, numero: u.get("numero"), rotulo }),
        ativa: u.get("status") !== "inativa",
        nome: texto(c?.get("nome")),
        telefones: Array.isArray(c?.get("telefones"))
          ? (c!.get("telefones") as unknown[]).filter(
              (t): t is string =>
                typeof t === "string" && /^55\d{10,11}$/.test(t),
            )
          : [],
        codigo:
          typeof l?.get("codigo") === "string"
            ? (l!.get("codigo") as string)
            : null,
        senha:
          typeof l?.get("senha") === "string"
            ? (l!.get("senha") as string)
            : null,
        enviadoEm: data(l?.get("enviadoEm")),
        votou: votaram.has(u.id),
        bloqueada: bloqueadas.has(u.id),
      };
    })
    .sort(
      (a, b) =>
        (a.numero ?? 99999) - (b.numero ?? 99999) ||
        a.rotulo.localeCompare(b.rotulo, "pt-BR", { numeric: true }),
    );
}

// ---------- Comissão: contatos ----------

/**
 * Grava os contatos lidos da lista do Word. Casa encontrada pelo NÚMERO (cadastro de casas).
 * Substitui o contato das casas que vieram na lista; as outras ficam como estavam.
 */
export async function importarContatos(
  db: Firestore,
  ctx: Contexto,
  lidos: ContatoLido[],
): Promise<{
  gravados: number;
  semCadastro: number[];
  ambiguas: number[];
  semTelefone: number[];
}> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const unidades = await base(ctx, db)
    .collection("units")
    .select("rotulo", "numero")
    .get();
  const porNumero = new Map<number, { id: string; rotulo: string }>();
  const repetidos = new Set<number>();
  for (const u of unidades.docs) {
    const rotulo = texto(u.get("rotulo"), u.id);
    const n = numeroDaCasa({ id: u.id, numero: u.get("numero"), rotulo });
    if (n === null) continue;
    if (porNumero.has(n)) repetidos.add(n);
    else porNumero.set(n, { id: u.id, rotulo });
  }
  const semCadastro: number[] = [];
  const gravar: { id: string; rotulo: string; c: ContatoLido }[] = [];
  const ambiguas: number[] = [];
  const semTelefone: number[] = [];
  for (const c of lidos) {
    const u = porNumero.get(c.numeroCasa);
    // Dois cadastros com o mesmo número: não adivinha (o link iria para a casa errada).
    if (repetidos.has(c.numeroCasa)) ambiguas.push(c.numeroCasa);
    else if (!u) semCadastro.push(c.numeroCasa);
    // Sem telefone na lista: mantém o que já estava gravado.
    else if (!c.telefones.length) semTelefone.push(c.numeroCasa);
    else gravar.push({ ...u, c });
  }
  for (let i = 0; i < gravar.length; i += 400) {
    const lote = db.batch();
    for (const g of gravar.slice(i, i + 400)) {
      lote.set(contatosDe(ctx, db).doc(g.id), {
        casa: g.rotulo,
        nome: g.c.nome,
        telefones: g.c.telefones,
        atualizadoEm: FieldValue.serverTimestamp(),
        atualizadoPor: ctx.uid,
      });
    }
    if (i === 0)
      auditar(db, lote, ctx, "eleicao.contatos", "contatosVotacao", {
        gravados: gravar.length,
        semCadastro: semCadastro.length,
      });
    await lote.commit();
  }
  return { gravados: gravar.length, semCadastro, ambiguas, semTelefone };
}

// ---------- Público: página do link ----------

export type VotacaoPorLink = {
  codigo: string;
  condominioNome: string;
  fuso: string;
  eleicaoId: string;
  titulo: string;
  cargo: string;
  modo: ModoEleicao;
  escolhasPorCasa: number;
  permiteBranco: boolean;
  vagas: number;
  abreEm: Date;
  fechaEm: Date;
  situacao: SituacaoEleicao;
  candidatos: Candidato[];
  casaRotulo: string;
  casaVotou: boolean;
  casaVotouEm: Date | null;
  casaBloqueada: boolean;
  /** Fotos dos integrantes (id do candidato → imagem). */
  fotos: Record<string, string>;
  resultado: {
    apuracao: ResultadoApuracao;
    votaram: number;
    casasAptas: number;
  } | null;
  /** A senha deste link já foi digitada certa (cookie). */
  senhaOk: boolean;
};

type Alvo = {
  condominioId: string;
  eleicaoId: string;
  unitId: string;
  senhaHash: string;
};

/** Acha a casa e a eleição do código (null se o código não existe ou foi trocado). */
export async function resolverCodigo(
  db: Firestore,
  codigo: string,
): Promise<Alvo | null> {
  const doc = await codigosCol(db).doc(hashCodigo(codigo)).get();
  if (!doc.exists) return null;
  const condominioId = texto(doc.get("condominioId"));
  const eleicaoId = texto(doc.get("eleicaoId"));
  const unitId = texto(doc.get("unitId"));
  const senhaHash = texto(doc.get("senhaHash"));
  // Link sem senha (formato antigo) não vale: a comissão troca o link.
  return condominioId && eleicaoId && unitId && senhaHash
    ? { condominioId, eleicaoId, unitId, senhaHash }
    : null;
}

/** Tudo que a página do link mostra. Rascunho não aparece (como para o morador). */
export async function votacaoPorCodigo(
  codigo: string,
  /** token = valor do cookie do link (tokenDoLink), se a senha já foi digitada certa. */
  opcoes: { agora?: Date; db?: Firestore; token?: string | null } = {},
): Promise<VotacaoPorLink | null> {
  const agora = opcoes.agora ?? new Date();
  const db = opcoes.db ?? adminDb();
  const alvo = await resolverCodigo(db, codigo);
  if (!alvo) return null;
  const ctx = { condominioId: alvo.condominioId };
  const eleicaoRef = eleicoesDe(ctx, db).doc(alvo.eleicaoId);
  const [cond, doc, casa, votante] = await Promise.all([
    db.collection("condominiums").doc(alvo.condominioId).get(),
    eleicaoRef.get(),
    base(ctx, db).collection("units").doc(alvo.unitId).get(),
    eleicaoRef.collection("votantes").doc(alvo.unitId).get(),
  ]);
  if (
    !cond.exists ||
    cond.get("status") === "suspenso" ||
    !doc.exists ||
    doc.get("status") !== "publicada"
  )
    return null;
  const e = paraEleicao(doc.id, doc.data());
  const situacao = situacaoEleicao(e, agora);
  const resultado = apuracaoLiberada(e, agora)
    ? await Promise.all([
        lerApuracao(ctx, e, agora),
        contarVotantes(ctx, e.id),
      ]).then(([apuracao, votaram]) => ({
        apuracao: semNascimento(apuracao),
        votaram,
        casasAptas: e.casasAptas ?? votaram,
      }))
    : null;
  return {
    codigo,
    condominioNome: texto(cond.get("nome"), "Condomínio"),
    fuso: texto(cond.get("fuso"), FUSO_PADRAO),
    eleicaoId: e.id,
    titulo: e.titulo,
    cargo: e.cargo,
    modo: e.modo,
    escolhasPorCasa: e.escolhasPorCasa,
    permiteBranco: e.permiteBranco,
    vagas: e.vagas,
    abreEm: e.abreEm,
    fechaEm: e.fechaEm,
    situacao,
    candidatos: e.candidatos.map((c) => ({ ...c, nascimento: null })),
    casaRotulo: texto(casa.get("rotulo"), "Sua casa"),
    casaVotou: votante.exists,
    casaVotouEm: votante.exists ? data(votante.get("votouEm")) : null,
    casaBloqueada: e.casasBloqueadas.includes(alvo.unitId),
    fotos: await fotosDaEleicao(alvo.condominioId, e.id, db),
    resultado,
    senhaOk: tokenConfere(codigo, opcoes.token, alvo),
  };
}

/** O cookie do link confere com a senha ATUAL deste link? (assinatura do servidor) */
function tokenConfere(codigo: string, token: string | null | undefined, alvo: Alvo): boolean {
  return !!token && mesmoHash(token, tokenDoLink(codigo, alvo.senhaHash));
}

/**
 * LIMITES POR ENDEREÇO DE INTERNET (IP). Só as tentativas ERRADAS contam e só barram o que
 * está errado (link que não existe, senha errada, cookie que não confere): no dia da eleição,
 * muitas casas votam atrás do MESMO endereço (operadoras de celular dividem um endereço entre
 * muitos aparelhos; o Wi-Fi do condomínio também). Link certo + senha certa nunca são
 * barrados por endereço, nem gastam tentativas. Cada senha é protegida pelos limites POR LINK
 * (5 erros por aparelho a cada 15 min, 30 por hora no total), conferidos numa transação.
 */
export const LIMITE_IP = {
  /** Abrir links que não existem (página do link). */
  linkInvalido: { acao: "voto.link.invalido", limite: 60, janelaSegundos: 10 * 60 },
  /** Senha errada ou link inválido ao digitar a senha. */
  senhaErrada: { acao: "voto.senha.ip.erros", limite: 60, janelaSegundos: 15 * 60 },
  /** Tentar votar com link inválido ou sem a senha certa. */
  votoInvalido: { acao: "voto.link.erros", limite: 30, janelaSegundos: 10 * 60 },
} as const;

type LimiteIp = (typeof LIMITE_IP)[keyof typeof LIMITE_IP];

export const ipEstourado = (db: Firestore, l: LimiteIp, ip: string) =>
  limiteEstourado(db, l.acao, ip, l.limite, l.janelaSegundos);

export const contarErroDoIp = (db: Firestore, l: LimiteIp, ip: string) =>
  consumirTentativa(db, l.acao, ip, l.limite, l.janelaSegundos);

/** Recusa uma tentativa errada vinda de `ip`: conta no limite do endereço e explica. */
async function recusarDoIp(db: Firestore, l: LimiteIp, ip: string | undefined, mensagem: string): Promise<never> {
  if (ip) {
    if (await ipEstourado(db, l, ip))
      throw new ErroDeNegocio("Muitas tentativas seguidas. Espere alguns minutos e tente de novo.");
    await contarErroDoIp(db, l, ip);
  }
  throw new ErroDeNegocio(mensagem);
}

/** Voto pelo link: a casa e a eleição vêm do CÓDIGO (nunca do formulário). */
export async function votarPorCodigo(
  codigo: string,
  /** Valor do cookie do link (tokenDoLink), gravado quando a senha foi digitada certa. */
  token: string | null,
  enviados: string[],
  db: Firestore = adminDb(),
  /** Endereço de quem vota (só para o limite de tentativas ERRADAS). */
  ip?: string,
): Promise<{ titulo: string; comprovante: string; condominioId: string }> {
  const alvo = await resolverCodigo(db, codigo);
  if (!alvo)
    return recusarDoIp(db, LIMITE_IP.votoInvalido, ip, "Este link de voto não vale mais. Peça um link novo à comissão.");
  if (!tokenConfere(codigo, token, alvo))
    return recusarDoIp(db, LIMITE_IP.votoInvalido, ip, "Digite a senha da sua casa de novo para votar.");
  const casa = await base({ condominioId: alvo.condominioId }, db)
    .collection("units")
    .doc(alvo.unitId)
    .get();
  const rotulo = texto(casa.get("rotulo"), alvo.unitId);
  return gravarVotoDaCasa(
    db,
    {
      condominioId: alvo.condominioId,
      unitId: alvo.unitId,
      uid: `link:${alvo.unitId}`,
      nome: `Link de voto · ${rotulo}`,
      papel: "morador",
      via: "link",
    },
    alvo.eleicaoId,
    enviados,
  );
}

/** Limites POR LINK da senha: por aparelho (link + endereço) e no total do link. */
const LIMITE_SENHA_APARELHO = { acao: "voto.senha.ip", limite: 5, janelaSegundos: 15 * 60 } as const;
const LIMITE_SENHA_LINK = { acao: "voto.senha.link", limite: 30, janelaSegundos: 60 * 60 } as const;

/**
 * Confere a senha do link. Contra quem tem só o link e tenta travar a casa:
 * - contam só as tentativas ERRADAS (acertar não gasta);
 * - limite por link E por endereço (5 a cada 15 min): quem erra de outro aparelho não trava a casa;
 * - teto por link (30 erros por hora), venha de onde vier, contra quem troca de endereço;
 * - os dois limites do link são conferidos e somados NUMA transação junto com a comparação
 *   da senha: tentativas ao mesmo tempo no mesmo link entram em fila (nenhuma rajada passa);
 * - o limite do ENDEREÇO só vale para links que não existem (contra quem tenta vários links);
 * - só vale com a votação aberta (ou, depois, para baixar o comprovante de quem já votou).
 * Devolve o token do cookie (tokenDoLink) se acertou.
 */
export async function conferirSenha(
  codigo: string,
  senha: string,
  ip: string,
  db: Firestore = adminDb(),
  agora = new Date(),
): Promise<{ ok: true; token: string } | { ok: false; erro: string }> {
  const travado = {
    ok: false as const,
    erro: "Senha errada muitas vezes. Espere 15 minutos e tente de novo.",
  };
  const alvo = await resolverCodigo(db, codigo);
  if (!alvo) {
    if (await ipEstourado(db, LIMITE_IP.senhaErrada, ip))
      return { ok: false, erro: "Muitas tentativas seguidas. Espere alguns minutos e tente de novo." };
    await contarErroDoIp(db, LIMITE_IP.senhaErrada, ip);
    return {
      ok: false,
      erro: "Senha errada ou link inválido. Confira a mensagem que você recebeu.",
    };
  }
  const ref = eleicoesDe({ condominioId: alvo.condominioId }, db).doc(
    alvo.eleicaoId,
  );
  const [doc, votante] = await Promise.all([
    ref.get(),
    ref.collection("votantes").doc(alvo.unitId).get(),
  ]);
  if (!doc.exists || doc.get("status") !== "publicada")
    return { ok: false, erro: "Esta votação não está disponível." };
  const situacao = situacaoEleicao(paraEleicao(doc.id, doc.data()), agora);
  if (!votante.exists && situacao === "agendada")
    return {
      ok: false,
      erro: "A votação ainda não abriu. Volte no dia e horário da votação.",
    };
  if (!votante.exists && situacao === "encerrada")
    return { ok: false, erro: "A votação já encerrou." };
  const tentativa = hashSenha(codigo, senha);
  const refAparelho = refLimite(db, LIMITE_SENHA_APARELHO.acao, `${codigo}:${ip}`);
  const refLink = refLimite(db, LIMITE_SENHA_LINK.acao, codigo);
  const r = await db.runTransaction(async (tx) => {
    const agoraMs = Date.now();
    const [dAparelho, dLink] = await tx.getAll(refAparelho, refLink);
    const aparelho = janelaDoLimite(dAparelho.data(), agoraMs, LIMITE_SENHA_APARELHO.janelaSegundos);
    const link = janelaDoLimite(dLink.data(), agoraMs, LIMITE_SENHA_LINK.janelaSegundos);
    if (aparelho.contagem >= LIMITE_SENHA_APARELHO.limite || link.contagem >= LIMITE_SENHA_LINK.limite)
      return { certo: false as const, restantes: 0 };
    // Senha certa: não grava nada (acertar não gasta tentativas).
    if (mesmoHash(tentativa, alvo.senhaHash)) return { certo: true as const, restantes: 0 };
    for (const [ref, l, j] of [
      [refAparelho, LIMITE_SENHA_APARELHO, aparelho],
      [refLink, LIMITE_SENHA_LINK, link],
    ] as const) {
      tx.set(ref, {
        acao: l.acao,
        inicio: j.inicio,
        contagem: j.contagem + 1,
        expiraEm: Timestamp.fromMillis(j.inicio + l.janelaSegundos * 1000),
      });
    }
    return {
      certo: false as const,
      restantes: Math.min(LIMITE_SENHA_APARELHO.limite - aparelho.contagem - 1, LIMITE_SENHA_LINK.limite - link.contagem - 1),
    };
  });
  if (r.certo) return { ok: true, token: tokenDoLink(codigo, alvo.senhaHash) };
  return r.restantes > 0
    ? {
        ok: false,
        erro: `Senha errada. Confira a senha de 6 números na mensagem (${r.restantes} ${r.restantes === 1 ? "tentativa" : "tentativas"}).`,
      }
    : travado;
}

/** Comprovante pelo link: só com a senha certa (cookie assinado). */
export async function comprovantePorCodigo(
  codigo: string,
  token: string | null,
  db: Firestore = adminDb(),
) {
  const alvo = await resolverCodigo(db, codigo);
  if (!alvo || !tokenConfere(codigo, token, alvo)) return null;
  return comprovanteDaCasa(alvo.condominioId, alvo.eleicaoId, alvo.unitId, db);
}
