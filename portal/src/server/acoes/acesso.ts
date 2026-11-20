"use server";

/**
 * ACESSO COM SENHA DA EQUIPE (admin, conselho e portaria).
 *
 * 1. criarAcessoComSenha: o síndico cria (ou refaz) o login de alguém da equipe
 *    com e-mail + SENHA PROVISÓRIA. A senha aparece uma única vez na tela dele
 *    e NUNCA é gravada no banco nem na auditoria.
 * 2. concluirTrocaDeSenha: depois que a própria pessoa troca a senha no
 *    navegador, o servidor confere e tira a obrigação de trocar.
 */
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import type { UserRecord } from "firebase-admin/auth";
import { adminAuth, adminDb } from "../firebase-admin";
import { carregarContexto, garantirPermissao, getContexto } from "../contexto";
import { registrarAuditoria, type AcaoAuditada } from "../auditoria";
import { IDADE_MAXIMA_LOGIN_S, NOME_COOKIE_SESSAO } from "../sessao";
import { ErroDeNegocio, executar, lerFormulario, type Resultado } from "./resultado";
import { idDocumento, pedidoSessao } from "@/lib/validacao";
import { codigoDoErro, esquemaEmail, gerarSenhaProvisoria, mascararEmail } from "@/lib/senha";
import { ehEmailDeMorador, ehUsuarioValido, emailDoMorador, gerarCodigoUsuario, SUFIXO_EMAIL_MORADOR } from "@/lib/usuario-morador";
import { enderecoDoPortal, linkEntrarMorador } from "../dados/acesso";

// Ações da auditoria usadas aqui (todas estão em ACOES_AUDITADAS).
const ACAO_CRIAR = "acesso.criar_senha" satisfies AcaoAuditada;
const ACAO_REDEFINIR = "acesso.redefinir_senha" satisfies AcaoAuditada;
const ACAO_TROCAR = "acesso.trocar_senha" satisfies AcaoAuditada;
const ACAO_CRIAR_MORADOR = "acesso.criar_morador" satisfies AcaoAuditada;
const ACAO_REMOVER_MORADOR = "acesso.remover_morador" satisfies AcaoAuditada;

/** Perfis que entram com e-mail e senha. Morador entra com usuário (código) e senha: veja abaixo. */
const PAPEIS_COM_SENHA = ["admin", "conselheiro", "portaria", "reservas"];

/** Resposta da criação: igual às outras, mais a senha (mostrada UMA vez). */
export type ResultadoAcesso =
  | { ok: true; mensagem: string; vez: number; senha: string; email: string }
  | { ok: false; erro: string; vez: number }
  | null;

const esquemaCriarAcesso = z.object({ uid: idDocumento, email: esquemaEmail });

/** Lê a conta no Firebase Authentication; null se ainda não existir. */
async function contaOuNada(uid: string): Promise<UserRecord | null> {
  try {
    return await adminAuth().getUser(uid);
  } catch (e) {
    if (codigoDoErro(e) === "auth/user-not-found") return null;
    throw e;
  }
}

/**
 * Cria ou refaz o acesso com senha de alguém da equipe.
 * Permissão: equipe.gerenciar.
 */
export async function criarAcessoComSenha(_: ResultadoAcesso, dados: FormData): Promise<ResultadoAcesso> {
  let senha = "";
  let email = "";
  const resultado = await executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "equipe.gerenciar");
    const v = lerFormulario(esquemaCriarAcesso, dados);
    if (ehEmailDeMorador(v.email)) throw new ErroDeNegocio("Use um e-mail de verdade da pessoa.");
    if (v.uid === ctx.uid) {
      throw new ErroDeNegocio("Para trocar a sua própria senha, use “Trocar senha” no menu.");
    }

    const db = adminDb();
    const ref = db.doc(`condominiums/${ctx.condominioId}/members/${v.uid}`);
    const [membro, usuario] = await Promise.all([ref.get(), db.doc(`users/${v.uid}`).get()]);
    if (!membro.exists) throw new ErroDeNegocio("Pessoa não encontrada. Atualize a página.");
    if (!PAPEIS_COM_SENHA.includes(String(membro.get("papel")))) {
      throw new ErroDeNegocio("O acesso com senha é só para a equipe (portaria, conselho e administração).");
    }
    if (membro.get("status") !== "ativo") {
      throw new ErroDeNegocio("O acesso desta pessoa está suspenso. Reative antes de criar a senha.");
    }
    // A conta do Firebase é uma só para todos os condomínios: não mexemos
    // na senha de quem também trabalha em outro condomínio.
    const lista = usuario.get("condominioIds");
    const outros = Array.isArray(lista) ? lista.filter((c) => c !== ctx.condominioId) : [];
    if (outros.length > 0) {
      throw new ErroDeNegocio("Esta pessoa também tem acesso a outro condomínio. A senha dela só pode ser criada pelo suporte do portal.");
    }

    const provisoria = gerarSenhaProvisoria();
    const nome = String(membro.get("nome") ?? "");
    let conta: UserRecord;
    let jaTinhaSenha = false;
    try {
      const atual = await contaOuNada(v.uid);
      jaTinhaSenha = Boolean(atual?.providerData.some((p) => p.providerId === "password"));
      // Trocar a senha pelo Admin SDK já derruba as sessões abertas da pessoa.
      conta = atual
        ? await adminAuth().updateUser(v.uid, { email: v.email, password: provisoria })
        : await adminAuth().createUser({ uid: v.uid, email: v.email, password: provisoria, displayName: nome });
    } catch (e) {
      const codigo = codigoDoErro(e);
      if (codigo === "auth/email-already-exists") throw new ErroDeNegocio("Este e-mail já é usado por outra conta. Use outro e-mail.");
      if (codigo === "auth/invalid-email") throw new ErroDeNegocio("Confira o e-mail: ele parece incompleto.");
      throw e;
    }

    // Marca do momento da senha provisória (relógio do Firebase): a troca só
    // vale se a conta mudar DEPOIS disso.
    const validaDesde = Date.parse(conta.tokensValidAfterTime ?? "") || Date.now();

    // Se esta gravação falhar, a senha nova nunca é mostrada: a conta fica
    // trancada até o síndico gerar outra (falha segura).
    await db.runTransaction(async (tx) => {
      const atual = await tx.get(ref);
      if (!atual.exists) throw new ErroDeNegocio("Pessoa não encontrada. Atualize a página.");
      tx.update(ref, {
        precisaTrocarSenha: true,
        senhaProvisoriaValidaDesde: validaDesde,
        senhaProvisoriaEm: FieldValue.serverTimestamp(),
        senhaProvisoriaPor: ctx.uid,
        atualizadoEm: FieldValue.serverTimestamp(),
      });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: jaTinhaSenha ? ACAO_REDEFINIR : ACAO_CRIAR,
        alvo: `members/${v.uid}`,
        // Nunca a senha. O e-mail vai mascarado.
        detalhes: { nome, email: mascararEmail(v.email) },
      });
    });

    senha = provisoria;
    email = v.email;
    revalidatePath(`/admin/pessoas/${v.uid}`);
    revalidatePath("/admin/pessoas");
    return jaTinhaSenha
      ? `Nova senha provisória gerada para ${nome}. A anterior deixou de funcionar.`
      : `Acesso criado para ${nome}.`;
  });

  if (resultado?.ok) return { ...resultado, senha, email };
  return resultado;
}

// ======================================================================
// ACESSO DO MORADOR: usuário (código de 6 caracteres) + senha provisória
// ======================================================================

/** Resposta para o cartão do morador: usuário e senha aparecem UMA vez. */
export type ResultadoAcessoMorador =
  | {
      ok: true;
      mensagem: string;
      vez: number;
      usuario: string;
      senha: string;
      nome: string;
      telefone: string;
      condominioNome: string;
      linkEntrar: string;
    }
  | { ok: false; erro: string; vez: number }
  | null;

type DadosDoAcessoMorador = Omit<Extract<ResultadoAcessoMorador, { ok: true }>, "ok" | "mensagem" | "vez">;

const esquemaUid = z.object({ uid: idDocumento });

/** Quantas vezes tentamos sortear um código livre (colisão é raríssima: 32^6 ≈ 1 bilhão). */
const TENTATIVAS_CODIGO = 6;

/**
 * Faz o trabalho de criar (modo "criar") ou refazer a senha (modo "redefinir")
 * do morador. Passos:
 * 1. confere permissão (moradores.gerenciar), perfil morador e situação ativa;
 * 2. escolhe o usuário: novo sorteado (criar) ou o que já existe (redefinir);
 * 3. grava e-mail sintético + senha provisória no Firebase Authentication
 *    (o Firebase também não deixa dois e-mails iguais: mais uma trava contra repetição);
 * 4. numa transação: índice usernames/{codigo} → uid, members/{uid}.usuario,
 *    obrigação de trocar a senha e auditoria (SEM a senha).
 * Se o passo 4 falhar, a senha nunca é mostrada (falha segura).
 */
async function gerarAcessoMorador(modo: "criar" | "redefinir", dados: FormData): Promise<ResultadoAcessoMorador> {
  let extra: DadosDoAcessoMorador | null = null;
  const resultado = await executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "moradores.gerenciar");
    const v = lerFormulario(esquemaUid, dados);
    if (v.uid === ctx.uid) throw new ErroDeNegocio("Para trocar a sua própria senha, use “Trocar senha” no menu.");

    const db = adminDb();
    const refMembro = db.doc(`condominiums/${ctx.condominioId}/members/${v.uid}`);
    const [membro, usuarioDoc] = await Promise.all([refMembro.get(), db.doc(`users/${v.uid}`).get()]);
    if (!membro.exists) throw new ErroDeNegocio("Pessoa não encontrada. Atualize a página.");
    if (membro.get("papel") !== "morador") {
      throw new ErroDeNegocio("O usuário com código é só para moradores. A equipe entra com e-mail e senha.");
    }
    if (membro.get("status") !== "ativo") {
      throw new ErroDeNegocio("O acesso deste morador está suspenso. Reative antes de criar o acesso.");
    }
    // A conta do Firebase é uma só para todos os condomínios: não mexemos em quem está em outro.
    const lista = usuarioDoc.get("condominioIds");
    const outros = Array.isArray(lista) ? lista.filter((c) => c !== ctx.condominioId) : [];
    if (outros.length > 0) {
      throw new ErroDeNegocio("Esta pessoa também tem acesso a outro condomínio. O acesso dela só pode ser criado pelo suporte do portal.");
    }

    const nome = String(membro.get("nome") ?? "");
    const telefone = String(membro.get("telefone") ?? "");
    const existente: unknown = membro.get("usuario");
    if (modo === "criar" && ehUsuarioValido(existente)) {
      throw new ErroDeNegocio("Este morador já tem usuário. Para mandar outra senha, use “Gerar nova senha provisória”.");
    }
    // UM LOGIN POR CASA: se outra pessoa da casa já tem usuário, não cria outro.
    const unitId = typeof membro.get("unitId") === "string" ? (membro.get("unitId") as string) : null;
    const refMembrosDaCasa = unitId ? db.collection(`condominiums/${ctx.condominioId}/members`).where("unitId", "==", unitId) : null;
    if (modo === "criar" && refMembrosDaCasa) {
      const outro = (await refMembrosDaCasa.get()).docs.find((d) => d.id !== v.uid && ehUsuarioValido(d.get("usuario")));
      if (outro) throw new ErroDeNegocio(mensagemLoginJaExiste(String(outro.get("nome") ?? "outra pessoa")));
    }
    if (modo === "redefinir" && !ehUsuarioValido(existente)) {
      throw new ErroDeNegocio("Este morador ainda não tem usuário. Use “Criar acesso do morador”.");
    }

    const provisoria = gerarSenhaProvisoria();
    const atual = await contaOuNada(v.uid);

    // Escolhe o código e grava no Firebase Authentication.
    let codigo = "";
    let conta: UserRecord | null = null;
    const candidatos =
      modo === "redefinir" && ehUsuarioValido(existente)
        ? [existente]
        : Array.from({ length: TENTATIVAS_CODIGO }, () => gerarCodigoUsuario());
    for (const candidato of candidatos) {
      if (modo === "criar") {
        const ocupado = await db.doc(`condominiums/${ctx.condominioId}/usernames/${candidato}`).get();
        if (ocupado.exists) continue;
      }
      const email = emailDoMorador(candidato, ctx.condominioId);
      try {
        // Trocar a senha pelo Admin SDK já derruba as sessões abertas da pessoa.
        conta = atual
          ? await adminAuth().updateUser(v.uid, { email, password: provisoria })
          : await adminAuth().createUser({ uid: v.uid, email, password: provisoria, displayName: nome });
        codigo = candidato;
        break;
      } catch (e) {
        if (codigoDoErro(e) !== "auth/email-already-exists") throw e;
        // Já existe uma conta com este e-mail: sorteia outro código (só ao criar).
        if (modo === "redefinir") throw new ErroDeNegocio("Este usuário está ligado a outra conta. Fale com o suporte do portal.");
      }
    }
    if (!conta || !codigo) throw new ErroDeNegocio("Não foi possível gerar um usuário livre agora. Tente de novo.");

    // Marca do momento da senha provisória: a troca só vale se a conta mudar depois disso.
    const validaDesde = Date.parse(conta.tokensValidAfterTime ?? "") || Date.now();
    const refIndice = db.doc(`condominiums/${ctx.condominioId}/usernames/${codigo}`);

    await db.runTransaction(async (tx) => {
      const [m, indice, daCasa] = await Promise.all([
        tx.get(refMembro),
        tx.get(refIndice),
        modo === "criar" && refMembrosDaCasa ? tx.get(refMembrosDaCasa) : Promise.resolve(null),
      ]);
      // A casa também é conferida de novo: a trava "um login por casa" olhou a casa lida antes.
      const casaAgora = typeof m.get("unitId") === "string" ? (m.get("unitId") as string) : null;
      if (!m.exists || m.get("papel") !== "morador" || m.get("status") !== "ativo" || casaAgora !== unitId) {
        throw new ErroDeNegocio("O cadastro deste morador mudou. Atualize a página e tente de novo.");
      }
      // De novo dentro da transação: dois cliques ao mesmo tempo, em duas pessoas da casa, não criam dois logins.
      const outroNaCasa = daCasa?.docs.find((d) => d.id !== v.uid && ehUsuarioValido(d.get("usuario")));
      if (outroNaCasa) throw new ErroDeNegocio(mensagemLoginJaExiste(String(outroNaCasa.get("nome") ?? "outra pessoa")));
      const usuarioAgora: unknown = m.get("usuario");
      if (modo === "criar" && ehUsuarioValido(usuarioAgora)) {
        throw new ErroDeNegocio("Este morador acabou de receber um usuário. Atualize a página.");
      }
      if (modo === "redefinir" && usuarioAgora !== codigo) {
        throw new ErroDeNegocio("O usuário deste morador mudou. Atualize a página.");
      }
      // Índice de unicidade: um código, uma pessoa (criado dentro da transação).
      if (indice.exists && indice.get("uid") !== v.uid) {
        throw new ErroDeNegocio("Este usuário já pertence a outra pessoa. Tente de novo.");
      }
      if (!indice.exists) {
        tx.create(refIndice, { uid: v.uid, criadoEm: FieldValue.serverTimestamp(), criadoPor: ctx.uid });
      }
      tx.update(refMembro, {
        usuario: codigo,
        ...(modo === "criar" ? { usuarioCriadoEm: FieldValue.serverTimestamp(), loginRemovido: FieldValue.delete() } : {}),
        precisaTrocarSenha: true,
        senhaProvisoriaValidaDesde: validaDesde,
        senhaProvisoriaEm: FieldValue.serverTimestamp(),
        senhaProvisoriaPor: ctx.uid,
        atualizadoEm: FieldValue.serverTimestamp(),
      });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: modo === "criar" ? ACAO_CRIAR_MORADOR : ACAO_REDEFINIR,
        alvo: `members/${v.uid}`,
        // Nunca a senha. O usuário pode aparecer (sozinho ele não abre nada).
        detalhes: { nome, usuario: codigo },
      });
    });

    extra = {
      usuario: codigo,
      senha: provisoria,
      nome,
      telefone,
      condominioNome: ctx.condominioNome,
      linkEntrar: linkEntrarMorador(await enderecoDoPortal(), ctx.condominioId),
    };
    revalidatePath(`/admin/pessoas/${v.uid}`);
    revalidatePath("/admin/pessoas");
    if (unitId) revalidatePath(`/admin/unidades/${unitId}`);
    return modo === "criar"
      ? `Login da casa criado (em nome de ${nome}). Todos da casa entram com ele.`
      : `Nova senha provisória gerada para ${nome}. A anterior deixou de funcionar.`;
  });

  const dadosAcesso = extra as DadosDoAcessoMorador | null;
  if (resultado?.ok && dadosAcesso) return { ...resultado, ...dadosAcesso };
  return resultado?.ok ? { ok: false, erro: "Não foi possível criar o acesso agora. Tente de novo.", vez: resultado.vez } : resultado;
}

/** Explica por que não dá para criar outro login na mesma casa. */
function mensagemLoginJaExiste(dono: string): string {
  return `Esta casa já tem login (em nome de ${dono}). O login é um só por casa: todos da casa entram com ele. Para passar o login para outra pessoa, remova antes o acesso de ${dono}.`;
}

/** E-mail que fica na conta depois de tirar o login: não corresponde a nenhum usuário de morador. */
function emailSemLogin(uid: string, condominioId: string): string {
  const resumo = createHash("sha256").update(uid).digest("hex").slice(0, 20);
  return `sem-login-${resumo}@morador.${condominioId}.${SUFIXO_EMAIL_MORADOR}`;
}

/**
 * Tira o LOGIN de um morador (ele continua cadastrado na casa, sem forma de entrar).
 * Serve para passar o login da casa para outra pessoa (o login é um só por casa).
 * 1. numa transação: apaga o índice do usuário e os campos de login do cadastro e marca
 *    `loginRemovido`, com auditoria. A partir daí carregarContexto recusa este morador:
 *    quem estiver com o portal aberto (todos da casa) para de usar NA HORA;
 * 2. na conta do Firebase: troca o e-mail do usuário por um que não corresponde a nenhum
 *    usuário e a senha por uma que ninguém sabe; derruba as sessões abertas.
 * Se o passo 2 falhar, a marca do passo 1 já impede a entrada (e o próximo login apaga a marca).
 * Permissão: moradores.gerenciar.
 */
export async function removerAcessoMorador(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "moradores.gerenciar");
    const v = lerFormulario(esquemaUid, dados);
    if (v.uid === ctx.uid) throw new ErroDeNegocio("Você não pode remover o seu próprio acesso.");
    const db = adminDb();
    const refMembro = db.doc(`condominiums/${ctx.condominioId}/members/${v.uid}`);
    const [membro, usuarioDoc] = await Promise.all([refMembro.get(), db.doc(`users/${v.uid}`).get()]);
    if (!membro.exists) throw new ErroDeNegocio("Pessoa não encontrada. Atualize a página.");
    if (membro.get("papel") !== "morador") throw new ErroDeNegocio("Aqui só dá para remover o login de morador.");
    const codigo: unknown = membro.get("usuario");
    if (!ehUsuarioValido(codigo)) throw new ErroDeNegocio("Esta pessoa não tem login. Atualize a página.");
    const lista = usuarioDoc.get("condominioIds");
    if (Array.isArray(lista) && lista.some((c) => c !== ctx.condominioId)) {
      throw new ErroDeNegocio("Esta pessoa também tem acesso a outro condomínio. O acesso dela só pode ser mudado pelo suporte do portal.");
    }
    const nome = String(membro.get("nome") ?? "");

    // 1) Cadastro: tira o usuário e o índice "um usuário, uma pessoa" e marca o login como removido.
    const refIndice = db.doc(`condominiums/${ctx.condominioId}/usernames/${codigo}`);
    await db.runTransaction(async (tx) => {
      const [m, indice] = await Promise.all([tx.get(refMembro), tx.get(refIndice)]);
      if (!m.exists || m.get("usuario") !== codigo) throw new ErroDeNegocio("O cadastro desta pessoa mudou. Atualize a página.");
      if (indice.exists && indice.get("uid") === v.uid) tx.delete(refIndice);
      tx.update(refMembro, {
        usuario: FieldValue.delete(),
        usuarioCriadoEm: FieldValue.delete(),
        precisaTrocarSenha: FieldValue.delete(),
        senhaProvisoriaValidaDesde: FieldValue.delete(),
        senhaProvisoriaEm: FieldValue.delete(),
        senhaProvisoriaPor: FieldValue.delete(),
        loginRemovido: true,
        atualizadoEm: FieldValue.serverTimestamp(),
      });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: ACAO_REMOVER_MORADOR,
        alvo: `members/${v.uid}`,
        detalhes: { nome, usuario: codigo },
      });
    });

    // 2) Firebase Authentication: o e-mail e a senha antigos deixam de existir.
    try {
      if (await contaOuNada(v.uid)) {
        await adminAuth().updateUser(v.uid, {
          email: emailSemLogin(v.uid, ctx.condominioId),
          password: randomBytes(32).toString("base64url"),
        });
        await adminAuth().revokeRefreshTokens(v.uid);
      }
    } catch (erro) {
      // O login já não funciona (marca loginRemovido); só registra para conferência.
      console.error("removerAcessoMorador: falha ao limpar a conta no Auth", erro);
    }

    revalidatePath(`/admin/pessoas/${v.uid}`);
    revalidatePath("/admin/pessoas");
    const unitId = membro.get("unitId");
    if (typeof unitId === "string" && unitId) revalidatePath(`/admin/unidades/${unitId}`);
    return `O login de ${nome} foi removido. Agora dá para criar o login da casa para outra pessoa.`;
  });
}

/** Cria o usuário e a senha provisória do morador. Permissão: moradores.gerenciar. */
export async function criarAcessoMorador(_: ResultadoAcessoMorador, dados: FormData): Promise<ResultadoAcessoMorador> {
  return gerarAcessoMorador("criar", dados);
}

/** Gera nova senha provisória (o usuário continua o mesmo). Permissão: moradores.gerenciar. */
export async function redefinirSenhaMorador(_: ResultadoAcessoMorador, dados: FormData): Promise<ResultadoAcessoMorador> {
  return gerarAcessoMorador("redefinir", dados);
}

/**
 * Chamada pela tela "Trocar senha" DEPOIS que o navegador trocou a senha no
 * Firebase e entrou de novo com a senha nova. Recebe o token novo.
 *
 * Observação: trocar a senha no Firebase já invalida TODAS as sessões antigas
 * (inclusive o cookie deste aparelho). Por isso o uid é conferido pelo cookie
 * sem checar revogação, e o token novo é que prova quem é a pessoa.
 * Depois disso o navegador cria a sessão nova em POST /api/sessao.
 */
export async function concluirTrocaDeSenha(idToken: string): Promise<Resultado> {
  return executar(async () => {
    const pedido = pedidoSessao.safeParse({ idToken });
    if (!pedido.success) throw new ErroDeNegocio("Pedido incompleto. Atualize a página e tente de novo.");

    const cookie = (await cookies()).get(NOME_COOKIE_SESSAO)?.value;
    if (!cookie) throw new ErroDeNegocio("Sua sessão terminou. Entre novamente.");

    let uid: string;
    try {
      const sessao = await adminAuth().verifySessionCookie(cookie, false);
      const token = await adminAuth().verifyIdToken(pedido.data.idToken, true);
      const recente = Date.now() / 1000 - token.auth_time <= IDADE_MAXIMA_LOGIN_S;
      if (token.uid !== sessao.uid || token.firebase.sign_in_provider !== "password" || !recente) {
        throw new Error("token não confere");
      }
      uid = token.uid;
    } catch {
      throw new ErroDeNegocio("Não foi possível confirmar seu acesso. Entre novamente.");
    }

    const db = adminDb();
    const ctx = await carregarContexto(db, uid);
    if (!ctx) throw new ErroDeNegocio("Sua conta está suspensa ou sem vínculo. Fale com a administração do condomínio.");

    const conta = await adminAuth().getUser(uid);
    const mudouEm = Date.parse(conta.tokensValidAfterTime ?? "") || 0;
    const ref = db.doc(`condominiums/${ctx.condominioId}/members/${uid}`);

    await db.runTransaction(async (tx) => {
      const membro = await tx.get(ref);
      if (!membro.exists) throw new ErroDeNegocio("Cadastro não encontrado. Fale com a administração.");
      const obrigatoria = membro.get("precisaTrocarSenha") === true;
      if (obrigatoria) {
        // Prova de que a senha mudou mesmo: a conta foi alterada depois da provisória.
        const provisoriaDesde = Number(membro.get("senhaProvisoriaValidaDesde") ?? 0);
        if (!(mudouEm > provisoriaDesde)) {
          throw new ErroDeNegocio("Não conseguimos confirmar a troca da senha. Tente de novo.");
        }
      }
      tx.update(ref, {
        precisaTrocarSenha: false,
        senhaProvisoriaValidaDesde: FieldValue.delete(),
        senhaTrocadaEm: FieldValue.serverTimestamp(),
      });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: ACAO_TROCAR,
        alvo: `members/${uid}`,
        detalhes: { obrigatoria },
      });
    });

    return "Senha trocada.";
  });
}
