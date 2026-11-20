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
import { grupoDoPapel } from "@/lib/modulos";
import { ehPapel, ehPermissao, PAPEIS, PERMISSOES_PADRAO, TETO_EXTRAS, type Papel, type Permissao } from "@/lib/permissoes";
import { ehUsuarioValido } from "@/lib/usuario-morador";
import { faixasDeCasas, LIMITE_IMPORTACAO, normalizarNome } from "@/lib/importar-moradores";
import { planoDeImportacao } from "../dados/pessoas";

/** Telefone opcional: só dígitos, com DDD (10 a 13 dígitos). */
const telefoneOpcional = (rotulo: string) =>
  z
    .string()
    .trim()
    .optional()
    .default("")
    .transform((t) => t.replace(/\D/g, ""))
    .refine((t) => t === "" || (t.length >= 10 && t.length <= 13), `${rotulo} com DDD, só números (ex.: 91 99999-9999).`);

const esquemaPessoa = z.object({
  // Mínimo de 2 letras: apelidos como "Zé" vêm da lista de contatos.
  nome: z.string().trim().min(2, "Informe o nome da pessoa.").max(80, "Nome muito longo."),
  papel: z.enum(PAPEIS, { error: "Escolha o perfil da pessoa." }),
  unitId: z.string().trim().optional().default(""),
  telefone: telefoneOpcional("Telefone"),
  telefone2: telefoneOpcional("Outro telefone"),
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
          telefone2: v.telefone2,
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
      tx.update(ref, {
        nome: v.nome,
        papel: v.papel,
        unitId,
        telefone: v.telefone,
        telefone2: v.telefone2,
        atualizadoEm: FieldValue.serverTimestamp(),
      });
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
      if (negadas.includes(`area.${grupoDoPapel(papel)}` as Permissao)) {
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

// ---------- Trazer as pessoas da lista de contatos ----------

/** A trava vale 3 minutos: se o servidor cair no meio, ela se solta sozinha. */
const TRAVA_IMPORTACAO_MS = 3 * 60 * 1000;
/** Pessoas por lote: 2 gravações cada (members + users) + auditoria, abaixo das 500 por lote do Firestore. */
const PESSOAS_POR_LOTE = 150;

/**
 * Cadastra em "Moradores e equipe" as pessoas da lista de contatos (lista do Word) que
 * ainda não estão lá. Cada nome vira um Morador SEM acesso (o síndico cria o usuário e a
 * senha depois, pessoa por pessoa). Rodar de novo não repete ninguém: cada pessoa da lista
 * tem um identificador fixo e o plano é recalculado depois de pegar a trava.
 */
export async function importarMoradoresDaLista(_: Resultado, dados: FormData): Promise<Resultado> {
  void dados;
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "moradores.gerenciar");
    const db = adminDb();
    const cond = db.collection("condominiums").doc(ctx.condominioId);
    const trava = cond.collection("sistema").doc("importacaoMoradores");

    // Trava: duas pessoas (ou dois cliques) não importam ao mesmo tempo.
    await db.runTransaction(async (tx) => {
      const atual = await tx.get(trava);
      const ate = Number(atual.get("ate") ?? 0);
      if (ate > Date.now()) {
        throw new ErroDeNegocio("Já tem uma importação em andamento. Espere um minuto e atualize a página.");
      }
      // merge: o mesmo documento guarda a lista de excluídos (não pode ser apagada aqui).
      tx.set(trava, { ate: Date.now() + TRAVA_IMPORTACAO_MS, por: ctx.uid, desde: FieldValue.serverTimestamp() }, { merge: true });
    });

    try {
      const plano = await planoDeImportacao(ctx);
      if (plano.novos.length === 0) {
        return "Nenhuma pessoa nova para trazer: todos da lista já estão em Moradores e equipe.";
      }
      if (plano.novos.length > LIMITE_IMPORTACAO) {
        throw new ErroDeNegocio(
          `A lista tem ${plano.novos.length} pessoas novas, mais do que o limite de ${LIMITE_IMPORTACAO}. Fale com o suporte.`,
        );
      }

      // 1) Contas no Firebase Authentication, todas numa chamada (ainda sem forma de entrar).
      const auth = adminAuth();
      const resultadoAuth = await auth.importUsers(plano.novos.map((p) => ({ uid: p.uid, displayName: p.nome })));
      const falhouNoAuth = new Set(resultadoAuth.errors.map((e) => e.index));
      for (const e of resultadoAuth.errors) {
        console.error("Importar moradores: conta não criada", plano.novos[e.index]?.uid, e.error.code);
      }
      const prontos = plano.novos.filter((_, i) => !falhouNoAuth.has(i));

      // 2) Cadastro no condomínio, em lotes (cada lote é tudo ou nada, com a sua auditoria).
      let criados = 0;
      let falhas = falhouNoAuth.size;
      for (let i = 0; i < prontos.length; i += PESSOAS_POR_LOTE) {
        const grupo = prontos.slice(i, i + PESSOAS_POR_LOTE);
        const lote = db.batch();
        for (const p of grupo) {
          lote.create(cond.collection("members").doc(p.uid), {
            nome: p.nome,
            papel: "morador",
            unitId: p.unitId,
            telefone: p.telefone,
            telefone2: p.telefone2,
            status: "ativo",
            permissoesExtras: [],
            permissoesNegadas: [],
            origem: "lista-contatos",
            criadoPor: ctx.uid,
            criadoEm: FieldValue.serverTimestamp(),
          });
          lote.set(
            db.doc(`users/${p.uid}`),
            { nome: p.nome, condominioIds: FieldValue.arrayUnion(ctx.condominioId), condominioAtivo: ctx.condominioId },
            { merge: true },
          );
        }
        registrarAuditoria(db, lote, {
          condominioId: ctx.condominioId,
          uid: ctx.uid,
          nome: ctx.nome,
          papel: ctx.papel,
          acao: "membro.importar",
          alvo: "members",
          // Sem nomes nem telefones: só quantas pessoas e de quais casas.
          detalhes: { origem: "lista de contatos", quantidade: grupo.length, casas: faixasDeCasas(grupo.map((p) => p.numero)) },
        });
        try {
          await lote.commit();
          criados += grupo.length;
        } catch (erro) {
          console.error("Importar moradores: lote não gravado", erro);
          // Confere o que de fato ficou gravado (o lote pode ter valido mesmo com erro na resposta)
          // e tira do Authentication só as contas deste lote que ficaram sem cadastro.
          // Um erro aqui não para a importação: o laço segue para os próximos lotes.
          try {
            const docs = await db.getAll(...grupo.map((p) => cond.collection("members").doc(p.uid)));
            const gravados = grupo.filter((_, j) => docs[j]?.exists).length;
            criados += gravados;
            falhas += grupo.length - gravados;
            const orfas = grupo.filter((_, j) => !docs[j]?.exists).map((p) => p.uid);
            if (orfas.length) await auth.deleteUsers(orfas).catch((e) => console.error("Importar moradores: limpeza do Auth", e));
          } catch (erroLimpeza) {
            console.error("Importar moradores: limpeza do lote", erroLimpeza);
            falhas += grupo.length;
          }
        }
      }

      revalidatePath("/admin/pessoas");
      revalidatePath("/admin/pessoas/importar");
      revalidatePath("/admin/unidades");
      revalidatePath("/admin");
      if (criados === 0) throw new ErroDeNegocio("Não foi possível cadastrar as pessoas agora. Tente de novo em instantes.");
      const feito =
        criados === 1
          ? "1 pessoa cadastrada a partir da lista. Ela aparece como “Sem acesso” até você criar o usuário e a senha."
          : `${criados} pessoas cadastradas a partir da lista. Elas aparecem como “Sem acesso” até você criar o usuário e a senha de cada uma.`;
      const aviso = falhas
        ? falhas === 1
          ? " 1 pessoa não pôde ser cadastrada agora: aperte o botão de novo para tentar."
          : ` ${falhas} pessoas não puderam ser cadastradas agora: aperte o botão de novo para tentar.`
        : "";
      return `${feito}${aviso}`;
    } finally {
      await trava.set({ ate: 0 }, { merge: true }).catch(() => undefined);
    }
  });
}

// ---------- Excluir cadastro (só a administração) ----------

const esquemaExcluir = z.object({ uid: idDocumento });

/**
 * Exclui DE VEZ o cadastro de uma pessoa: tira de "Moradores e equipe", apaga o usuário de
 * entrada (morador) e a conta de acesso. Os registros antigos dela (reservas, solicitações,
 * anúncios, auditoria) continuam guardados com o nome. Só a administração (papel admin).
 * Para algo temporário existe "Suspender acesso", que dá para desfazer.
 */
export async function excluirPessoa(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const v = lerFormulario(esquemaExcluir, dados);
    const ctx = garantirPermissao(await getContexto(), "area.gestao");
    if (ctx.papel !== "admin") throw new ErroDeNegocio("Só a administração (síndico) pode excluir cadastros.");
    if (v.uid === ctx.uid) throw new ErroDeNegocio("Você não pode excluir o seu próprio cadastro.");
    const db = adminDb();
    const cond = db.collection("condominiums").doc(ctx.condominioId);
    const refMembro = cond.collection("members").doc(v.uid);
    const refUsuario = db.doc(`users/${v.uid}`);

    const r = await db.runTransaction(async (tx) => {
      // Leituras primeiro (regra das transações), gravações depois.
      const membro = await tx.get(refMembro);
      if (!membro.exists) throw new ErroDeNegocio("Pessoa não encontrada. Atualize a página.");
      const papelBruto = membro.get("papel");
      const papel: Papel = ehPapel(papelBruto) ? papelBruto : "admin";
      garantirPermissao(ctx, permissaoParaPapel(papel));
      if (papel === "admin" && membro.get("status") === "ativo") {
        const admins = await tx.get(cond.collection("members").where("papel", "==", "admin").where("status", "==", "ativo"));
        if (!admins.docs.some((d) => d.id !== v.uid)) throw new ErroDeNegocio("Não dá para excluir o último administrador ativo.");
      }
      const usuario = await tx.get(refUsuario);
      const codigo = membro.get("usuario");
      const refCodigo = ehUsuarioValido(codigo) ? cond.collection("usernames").doc(codigo) : null;
      const indice = refCodigo ? await tx.get(refCodigo) : null;
      // Anúncios da pessoa ainda no ar (ou esperando aprovação): saem junto com o cadastro,
      // senão o WhatsApp dela continuaria aparecendo para todos.
      const anuncios = await tx.get(cond.collection("classifieds").where("autorUid", "==", v.uid));
      const agora = Date.now();
      const anunciosAtivos = anuncios.docs.filter((d) => {
        const status = d.get("status");
        const expira = (d.get("expiraEm") as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
        return status === "pendente" || (status === "aprovado" && expira > agora);
      });

      const nome = String(membro.get("nome") ?? "");
      const unitId = typeof membro.get("unitId") === "string" ? (membro.get("unitId") as string) : null;

      tx.delete(refMembro);
      if (refCodigo && indice?.exists && indice.get("uid") === v.uid) tx.delete(refCodigo);
      // Morador excluído: anota a casa e o nome para "Trazer moradores da lista" não trazer de volta.
      if (papel === "morador" && unitId) {
        tx.set(
          cond.collection("sistema").doc("importacaoMoradores"),
          { excluidosPorCasa: { [unitId]: FieldValue.arrayUnion(normalizarNome(nome)) } },
          { merge: true },
        );
      }
      for (const d of anunciosAtivos) {
        tx.update(d.ref, { status: "removido", motivo: "Cadastro excluído pela administração.", decididoEm: FieldValue.serverTimestamp() });
      }
      if (anunciosAtivos.length) {
        registrarAuditoria(db, tx, {
          condominioId: ctx.condominioId,
          uid: ctx.uid,
          nome: ctx.nome,
          papel: ctx.papel,
          acao: "classificado.remover",
          alvo: "classifieds",
          detalhes: { quantidade: anunciosAtivos.length, motivo: "cadastro excluído", porAutor: false },
        });
      }
      // A conta só é apagada se a pessoa não estiver em outro condomínio.
      const lista: unknown[] = Array.isArray(usuario.get("condominioIds")) ? (usuario.get("condominioIds") as unknown[]) : [];
      const outros = lista.filter((c): c is string => typeof c === "string" && c !== ctx.condominioId);
      const apagarConta = outros.length === 0;
      if (usuario.exists) {
        if (apagarConta) tx.delete(refUsuario);
        else
          tx.update(refUsuario, {
            condominioIds: FieldValue.arrayRemove(ctx.condominioId),
            ...(usuario.get("condominioAtivo") === ctx.condominioId ? { condominioAtivo: outros[0] } : {}),
          });
      }
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "membro.excluir",
        alvo: `members/${v.uid}`,
        detalhes: { nome, papel, unitId },
      });
      return { nome, unitId, apagarConta };
    });

    // Depois da transação: a conta de acesso some (ou, se estiver em outro condomínio, só é desconectada).
    if (r.apagarConta) {
      await adminAuth()
        .deleteUser(v.uid)
        .catch((e: unknown) => {
          const codigo = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
          if (codigo !== "auth/user-not-found") console.error("Excluir pessoa: conta não apagada", v.uid, e);
        });
    } else {
      await adminAuth().revokeRefreshTokens(v.uid).catch(() => undefined);
    }
    revalidatePath("/admin/pessoas");
    revalidatePath("/admin/unidades");
    if (r.unitId) revalidatePath(`/admin/unidades/${r.unitId}`);
    return `Cadastro de ${r.nome || "pessoa"} excluído.`;
  });
}
