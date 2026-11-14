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

// Ações da auditoria usadas aqui (todas estão em ACOES_AUDITADAS).
const ACAO_CRIAR = "acesso.criar_senha" satisfies AcaoAuditada;
const ACAO_REDEFINIR = "acesso.redefinir_senha" satisfies AcaoAuditada;
const ACAO_TROCAR = "acesso.trocar_senha" satisfies AcaoAuditada;

/** Perfis que entram com e-mail e senha. Morador fica para depois. */
const PAPEIS_COM_SENHA = ["admin", "conselheiro", "portaria"];

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
