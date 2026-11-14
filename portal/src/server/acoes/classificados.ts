"use server";

/**
 * Ações dos classificados. Princípios:
 * - o morador cria o anúncio e ele nasce "pendente": só aparece depois que a
 *   moderação aprovar (vale por 30 dias);
 * - o autor e a casa vêm da SESSÃO, nunca do formulário;
 * - nada é apagado: o status muda e guarda o motivo;
 * - tudo é auditado na mesma transação, sem o texto do anúncio nem o telefone.
 */
import { revalidatePath } from "next/cache";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, getContexto, type Contexto } from "../contexto";
import { registrarAuditoria, type AcaoAuditada } from "../auditoria";
import { paraClassificado } from "../dados/classificados";
import { ErroDeNegocio, executar, lerFormulario, type Resultado } from "./resultado";
import {
  LIMITE_ATIVOS_POR_PESSOA,
  calcularExpiraEm,
  contaComoAtivo,
  podeRemover,
  primeiroNome,
  situacaoEfetiva,
} from "@/lib/classificados";
import { formatarData } from "@/lib/formato";
import { esquemaAnuncio, esquemaIdAnuncio, esquemaMotivoAnuncio } from "@/lib/validacao-classificados";

type AcaoClassificado = "classificado.criar" | "classificado.aprovar" | "classificado.rejeitar" | "classificado.remover";

/** Nome da ação na auditoria (todas estão em ACOES_AUDITADAS). */
function acaoClassificado(a: AcaoClassificado): AcaoAuditada {
  return a;
}

function revalidarClassificados() {
  revalidatePath("/classificados");
  revalidatePath("/classificados/moderar");
  revalidatePath("/admin/classificados");
  revalidatePath("/inicio");
  revalidatePath("/admin");
}

const colecao = (ctx: Contexto) =>
  adminDb().collection("condominiums").doc(ctx.condominioId).collection("classifieds");

// ---------- Morador ----------

/** Cria o anúncio (fica aguardando aprovação). */
export async function criarAnuncio(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "classificados.usar");
    if (!ctx.unitId) throw new ErroDeNegocio("Seu cadastro não está ligado a uma casa. Fale com a administração.");
    const v = lerFormulario(esquemaAnuncio, dados);
    const db = adminDb();
    const col = colecao(ctx);
    const ref = col.doc();
    const agora = new Date();

    await db.runTransaction(async (tx) => {
      // Limite por pessoa, conferido dentro da transação (dois cliques não passam do limite).
      const meus = await tx.get(col.where("autorUid", "==", ctx.uid));
      const ativos = meus.docs
        .map((d) => paraClassificado(d.id, d.data()))
        .filter((a) => contaComoAtivo(a.status, a.expiraEm, agora)).length;
      if (ativos >= LIMITE_ATIVOS_POR_PESSOA) {
        throw new ErroDeNegocio(
          `Você já tem ${LIMITE_ATIVOS_POR_PESSOA} anúncios aguardando ou publicados. Remova um deles para anunciar outro.`,
        );
      }

      tx.create(ref, {
        titulo: v.titulo,
        texto: v.texto,
        categoria: v.categoria,
        preco: v.preco,
        contatoWhatsapp: v.contatoWhatsapp,
        autorUid: ctx.uid,
        autorPrimeiroNome: primeiroNome(ctx.nome),
        unitId: ctx.unitId,
        status: "pendente",
        motivo: "",
        criadoEm: FieldValue.serverTimestamp(),
        decididoEm: null,
        expiraEm: null,
      });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: acaoClassificado("classificado.criar"),
        alvo: `classifieds/${ref.id}`,
        detalhes: {
          categoria: v.categoria,
          unidade: ctx.unitId,
          temPreco: v.preco !== null,
          temContato: v.contatoWhatsapp !== null,
        },
      });
    });

    revalidarClassificados();
    return `Anúncio "${v.titulo}" enviado. Ele aparece para os moradores depois que a administração aprovar.`;
  });
}

/** O autor tira o próprio anúncio do ar (ou desiste antes da aprovação). */
export async function removerMeuAnuncio(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "classificados.usar");
    const v = lerFormulario(esquemaIdAnuncio, dados);
    const db = adminDb();
    const ref = colecao(ctx).doc(v.id);
    const agora = new Date();

    const titulo = await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const a = doc.exists ? paraClassificado(doc.id, doc.data()) : null;
      // Anúncio de outra pessoa responde igual a "não existe" (não revela nada).
      if (!a || a.autorUid !== ctx.uid) throw new ErroDeNegocio("Anúncio não encontrado. Atualize a página.");
      if (!podeRemover(a.status, a.expiraEm, agora)) {
        throw new ErroDeNegocio("Este anúncio já não está no ar. Atualize a página.");
      }
      tx.update(ref, { status: "removido", motivo: "Removido pelo autor.", decididoEm: FieldValue.serverTimestamp() });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: acaoClassificado("classificado.remover"),
        alvo: `classifieds/${a.id}`,
        detalhes: { de: a.status, para: "removido", porAutor: true },
      });
      return a.titulo;
    });

    revalidarClassificados();
    return `Anúncio "${titulo}" removido.`;
  });
}

// ---------- Moderação ----------

/** Aprova um anúncio pendente: entra no ar por 30 dias. */
export async function aprovarAnuncio(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "classificados.moderar");
    const v = lerFormulario(esquemaIdAnuncio, dados);
    const db = adminDb();
    const ref = colecao(ctx).doc(v.id);
    const agora = new Date();
    const expira = calcularExpiraEm(agora);

    const titulo = await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new ErroDeNegocio("Anúncio não encontrado. Atualize a página.");
      const a = paraClassificado(doc.id, doc.data());
      if (a.status !== "pendente") throw new ErroDeNegocio("Este anúncio já foi decidido. Atualize a página.");
      tx.update(ref, {
        status: "aprovado",
        motivo: "",
        decididoEm: Timestamp.fromDate(agora),
        expiraEm: Timestamp.fromDate(expira),
      });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: acaoClassificado("classificado.aprovar"),
        alvo: `classifieds/${a.id}`,
        detalhes: { categoria: a.categoria, unidade: a.unitId, de: "pendente", para: "aprovado", expiraEm: expira.toISOString() },
      });
      return a.titulo;
    });

    revalidarClassificados();
    return `Anúncio "${titulo}" aprovado. Fica no ar até ${formatarData(expira, ctx.fuso)}.`;
  });
}

/** Rejeita um anúncio pendente, com motivo (o autor lê em "Meus anúncios"). */
export async function rejeitarAnuncio(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "classificados.moderar");
    const v = lerFormulario(esquemaMotivoAnuncio, dados);
    const db = adminDb();
    const ref = colecao(ctx).doc(v.id);

    const titulo = await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new ErroDeNegocio("Anúncio não encontrado. Atualize a página.");
      const a = paraClassificado(doc.id, doc.data());
      if (a.status !== "pendente") throw new ErroDeNegocio("Este anúncio já foi decidido. Atualize a página.");
      tx.update(ref, { status: "rejeitado", motivo: v.motivo, decididoEm: FieldValue.serverTimestamp() });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: acaoClassificado("classificado.rejeitar"),
        alvo: `classifieds/${a.id}`,
        detalhes: { categoria: a.categoria, unidade: a.unitId, de: "pendente", para: "rejeitado", motivo: v.motivo },
      });
      return a.titulo;
    });

    revalidarClassificados();
    return `Anúncio "${titulo}" não aprovado. O autor verá o motivo.`;
  });
}

/** A moderação tira do ar um anúncio publicado (ou pendente), com motivo. */
export async function removerAnuncio(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "classificados.moderar");
    const v = lerFormulario(esquemaMotivoAnuncio, dados);
    const db = adminDb();
    const ref = colecao(ctx).doc(v.id);
    const agora = new Date();

    const titulo = await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new ErroDeNegocio("Anúncio não encontrado. Atualize a página.");
      const a = paraClassificado(doc.id, doc.data());
      if (!podeRemover(a.status, a.expiraEm, agora)) {
        throw new ErroDeNegocio("Este anúncio já não está no ar. Atualize a página.");
      }
      tx.update(ref, { status: "removido", motivo: v.motivo, decididoEm: FieldValue.serverTimestamp() });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: acaoClassificado("classificado.remover"),
        alvo: `classifieds/${a.id}`,
        detalhes: {
          categoria: a.categoria,
          unidade: a.unitId,
          de: situacaoEfetiva(a.status, a.expiraEm, agora),
          para: "removido",
          motivo: v.motivo,
          porAutor: false,
        },
      });
      return a.titulo;
    });

    revalidarClassificados();
    return `Anúncio "${titulo}" removido. O autor verá o motivo.`;
  });
}
