"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "../firebase-admin";
import { garantirPermissao, getContexto, type Contexto } from "../contexto";
import { registrarAuditoria } from "../auditoria";
import { ErroDeNegocio, executar, lerFormulario, type Resultado } from "./resultado";
import { idDocumento } from "@/lib/validacao";
import { ehPermissao, PAPEIS, PERMISSOES_PADRAO, TETO_EXTRAS, type Papel, type Permissao } from "@/lib/permissoes";

const esquemaPessoa = z.object({
  nome: z.string().trim().min(3, "Informe o nome completo.").max(80, "Nome muito longo."),
  papel: z.enum(PAPEIS, { error: "Escolha o perfil da pessoa." }),
  unitId: z.string().trim().optional().default(""),
  telefone: z
    .string()
    .trim()
    .optional()
    .default("")
    .transform((t) => t.replace(/\D/g, ""))
    .refine((t) => t === "" || (t.length >= 10 && t.length <= 13), "Telefone com DDD, só números (ex.: 91 99999-9999)."),
});

/** Morador é gerido por quem cuida de moradores; os demais perfis, por quem cuida da equipe. */
function permissaoParaPapel(papel: Papel): Permissao {
  return papel === "morador" ? "moradores.gerenciar" : "equipe.gerenciar";
}

async function validarUnidade(ctx: Contexto, papel: Papel, unitId: string): Promise<string | null> {
  if (papel !== "morador") return null;
  if (!unitId) throw new ErroDeNegocio("Escolha a casa do morador.");
  if (!idDocumento.safeParse(unitId).success) throw new ErroDeNegocio("Casa inválida.");
  const u = await adminDb().collection("condominiums").doc(ctx.condominioId).collection("units").doc(unitId).get();
  if (!u.exists) throw new ErroDeNegocio("Essa casa não está cadastrada. Cadastre-a em Unidades.");
  if (u.get("status") !== "ativa") throw new ErroDeNegocio("Essa casa está inativa. Reative-a em Unidades antes.");
  return unitId;
}

/**
 * Adiciona uma pessoa ao condomínio. Cria a conta no Firebase Authentication
 * (ainda sem forma de entrar: o método de login será ligado depois).
 */
export async function adicionarPessoa(_: Resultado, dados: FormData): Promise<Resultado> {
  let novoUid = "";
  const resultado = await executar(async () => {
    const ctx = await getContexto();
    const v = lerFormulario(esquemaPessoa, dados);
    garantirPermissao(ctx, permissaoParaPapel(v.papel));
    const c = ctx!;
    const unitId = await validarUnidade(c, v.papel, v.unitId);

    const conta = await adminAuth().createUser({ displayName: v.nome });
    const db = adminDb();
    try {
      await db.runTransaction(async (tx) => {
        tx.create(db.doc(`condominiums/${c.condominioId}/members/${conta.uid}`), {
          nome: v.nome,
          papel: v.papel,
          unitId,
          telefone: v.telefone,
          status: "ativo",
          permissoesExtras: [],
          permissoesNegadas: [],
          criadoPor: c.uid,
          criadoEm: FieldValue.serverTimestamp(),
        });
        tx.create(db.doc(`users/${conta.uid}`), {
          nome: v.nome,
          condominioIds: [c.condominioId],
          condominioAtivo: c.condominioId,
        });
        registrarAuditoria(db, tx, {
          condominioId: c.condominioId,
          uid: c.uid,
          nome: c.nome,
          papel: c.papel,
          acao: "membro.criar",
          alvo: `members/${conta.uid}`,
          detalhes: { nome: v.nome, papel: v.papel, unitId },
        });
      });
    } catch (e) {
      await adminAuth().deleteUser(conta.uid).catch(() => undefined);
      throw e;
    }
    novoUid = conta.uid;
    revalidatePath("/admin/pessoas");
    if (unitId) revalidatePath(`/admin/unidades/${unitId}`);
    return `${v.nome} foi adicionado(a).`;
  });
  if (resultado?.ok && novoUid) redirect(`/admin/pessoas/${novoUid}?criado=1`);
  return resultado;
}

const esquemaEdicao = esquemaPessoa.extend({ uid: idDocumento });

export async function salvarPessoa(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = await getContexto();
    const v = lerFormulario(esquemaEdicao, dados);
    const db = adminDb();
    const ref = db.doc(`condominiums/${ctx?.condominioId}/members/${v.uid}`);
    const atual = await ref.get();
    if (!ctx || !atual.exists) throw new ErroDeNegocio("Pessoa não encontrada. Atualize a página.");

    const papelAntes = atual.get("papel") as Papel;
    garantirPermissao(ctx, permissaoParaPapel(papelAntes));
    garantirPermissao(ctx, permissaoParaPapel(v.papel));
    if (v.uid === ctx.uid && v.papel !== papelAntes) {
      throw new ErroDeNegocio("Você não pode mudar o seu próprio perfil. Peça a outro administrador.");
    }
    const unitId = await validarUnidade(ctx, v.papel, v.unitId);

    await db.runTransaction(async (tx) => {
      tx.update(ref, { nome: v.nome, papel: v.papel, unitId, telefone: v.telefone, atualizadoEm: FieldValue.serverTimestamp() });
      tx.set(db.doc(`users/${v.uid}`), { nome: v.nome }, { merge: true });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "membro.alterar",
        alvo: `members/${v.uid}`,
        detalhes: { nome: v.nome, papelAntes, papel: v.papel, unitIdAntes: atual.get("unitId") ?? null, unitId },
      });
    });
    revalidatePath(`/admin/pessoas/${v.uid}`);
    revalidatePath("/admin/pessoas");
    return "Dados salvos.";
  });
}

const esquemaSituacao = z.object({ uid: idDocumento, status: z.enum(["ativo", "suspenso"]) });

/** Suspende ou reativa o acesso. Ao suspender, encerra as sessões abertas da pessoa. */
export async function alterarSituacao(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = await getContexto();
    const v = lerFormulario(esquemaSituacao, dados);
    if (!ctx) throw new ErroDeNegocio("Sua sessão terminou. Entre novamente.");
    if (v.uid === ctx.uid) throw new ErroDeNegocio("Você não pode suspender o seu próprio acesso.");
    const db = adminDb();
    const ref = db.doc(`condominiums/${ctx.condominioId}/members/${v.uid}`);

    await db.runTransaction(async (tx) => {
      const atual = await tx.get(ref);
      if (!atual.exists) throw new ErroDeNegocio("Pessoa não encontrada.");
      garantirPermissao(ctx, permissaoParaPapel(atual.get("papel") as Papel));
      tx.update(ref, { status: v.status, atualizadoEm: FieldValue.serverTimestamp() });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: v.status === "suspenso" ? "membro.suspender" : "membro.reativar",
        alvo: `members/${v.uid}`,
        detalhes: { nome: String(atual.get("nome") ?? "") },
      });
    });
    if (v.status === "suspenso") await adminAuth().revokeRefreshTokens(v.uid).catch(() => undefined);
    revalidatePath(`/admin/pessoas/${v.uid}`);
    revalidatePath("/admin/pessoas");
    return v.status === "suspenso" ? "Acesso suspenso. A pessoa foi desconectada." : "Acesso reativado.";
  });
}

/** Permissões extras e retiradas de uma pessoa (sempre dentro do teto do perfil). */
export async function salvarPermissoes(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "permissoes.gerenciar");
    const uid = lerFormulario(z.object({ uid: idDocumento }).loose(), dados).uid;
    if (uid === ctx.uid) throw new ErroDeNegocio("Você não pode alterar as suas próprias permissões.");

    // Marcadas = manter. Retiradas = permissões do perfil que vieram desmarcadas.
    const extrasPedidas = dados.getAll("extras").filter(ehPermissao);
    const mantidas = new Set(dados.getAll("manter").filter(ehPermissao));
    const db = adminDb();
    const ref = db.doc(`condominiums/${ctx.condominioId}/members/${uid}`);

    await db.runTransaction(async (tx) => {
      const atual = await tx.get(ref);
      if (!atual.exists) throw new ErroDeNegocio("Pessoa não encontrada.");
      const papel = atual.get("papel") as Papel;
      const teto = new Set<Permissao>(TETO_EXTRAS[papel] ?? []);
      const extras = [...new Set(extrasPedidas.filter((p) => teto.has(p)))];
      const negadas = PERMISSOES_PADRAO[papel].filter((p) => !mantidas.has(p));
      if (negadas.includes(`area.${papel === "admin" || papel === "conselheiro" ? "gestao" : papel}` as Permissao)) {
        throw new ErroDeNegocio("Não retire o acesso à área principal do perfil. Para bloquear a pessoa, use “Suspender acesso”.");
      }
      tx.update(ref, { permissoesExtras: extras, permissoesNegadas: negadas, atualizadoEm: FieldValue.serverTimestamp() });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "membro.permissoes",
        alvo: `members/${uid}`,
        detalhes: { nome: String(atual.get("nome") ?? ""), extras: extras.join(", "), retiradas: negadas.join(", ") },
      });
    });
    revalidatePath(`/admin/pessoas/${uid}`);
    return "Permissões atualizadas.";
  });
}
