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
import { apagarFotos, fotosDoFormulario } from "../fotos";
import { fotosRemovidas } from "@/lib/fotos";
import { avisarNoCelular } from "../push";
import {
  LIMITE_ATIVOS_POR_PESSOA,
  calcularExpiraEm,
  contaComoAtivo,
  podeEditar,
  podeRemover,
  primeiroNome,
  situacaoEfetiva,
} from "@/lib/classificados";
import { formatarData } from "@/lib/formato";
import { esquemaAnuncio, esquemaIdAnuncio, esquemaMotivoAnuncio } from "@/lib/validacao-classificados";

type AcaoClassificado = "classificado.criar" | "classificado.editar" | "classificado.aprovar" | "classificado.rejeitar" | "classificado.remover";

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
    // Fotos: conferidas no Storage ANTES da transação (o Storage não entra nela).
    const fotos = await fotosDoFormulario(v.fotos, ctx.condominioId, "classificados");
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
        fotos,
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
          fotos: fotos.length,
        },
      });
    });

    revalidarClassificados();
    // Quem modera recebe no celular: tem anúncio esperando aprovação.
    avisarNoCelular(
      ctx.condominioId,
      { permissao: "classificados.moderar" },
      { titulo: "Anúncio para aprovar", texto: `“${v.titulo}” · por ${primeiroNome(ctx.nome)}`, url: "/classificados/moderar", tag: "anuncios-pendentes" },
      ctx.uid,
    );
    return `Anúncio "${v.titulo}" enviado. Ele aparece para os moradores depois que a administração aprovar.`;
  });
}

/**
 * O autor edita o próprio anúncio (aguardando, publicado ou não aprovado).
 * Depois de editar, ele SEMPRE volta para "aguardando aprovação": a administração
 * confere de novo (assim ninguém troca o texto de um anúncio já aprovado).
 */
export async function editarAnuncio(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "classificados.usar");
    const { id } = lerFormulario(esquemaIdAnuncio, dados);
    const v = lerFormulario(esquemaAnuncio, dados);
    const db = adminDb();
    const col = colecao(ctx);
    const ref = col.doc(id);
    const agora = new Date();

    // Fotos: as que ficam ("atual:N") e as novas, conferidas no Storage ANTES da transação.
    const antes = await ref.get();
    const anterior = antes.exists ? paraClassificado(antes.id, antes.data(), ctx.condominioId) : null;
    // Anúncio de outra pessoa responde igual a "não existe" (não revela nada).
    if (!anterior || anterior.autorUid !== ctx.uid) throw new ErroDeNegocio("Anúncio não encontrado. Atualize a página.");
    const fotos = await fotosDoFormulario(v.fotos, ctx.condominioId, "classificados", anterior.fotos);
    const mesmaLista = (x: { caminho: string }[], y: { caminho: string }[]) => x.length === y.length && x.every((f, i) => f.caminho === y[i]?.caminho);

    const estava = await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const a = doc.exists ? paraClassificado(doc.id, doc.data(), ctx.condominioId) : null;
      if (!a || a.autorUid !== ctx.uid) throw new ErroDeNegocio("Anúncio não encontrado. Atualize a página.");
      if (!podeEditar(a.status, a.expiraEm, agora)) {
        throw new ErroDeNegocio("Este anúncio não pode mais ser editado (foi removido ou expirou). Crie um anúncio novo.");
      }
      if (!mesmaLista(a.fotos, anterior.fotos)) throw new ErroDeNegocio("O anúncio mudou enquanto você editava. Atualize a página e tente de novo.");
      const situacao = situacaoEfetiva(a.status, a.expiraEm, agora);
      // Não aprovado → volta a contar no limite de anúncios ativos.
      if (situacao === "rejeitado") {
        const meus = await tx.get(col.where("autorUid", "==", ctx.uid));
        const ativos = meus.docs
          .filter((d) => d.id !== id)
          .map((d) => paraClassificado(d.id, d.data()))
          .filter((x) => contaComoAtivo(x.status, x.expiraEm, agora)).length;
        if (ativos >= LIMITE_ATIVOS_POR_PESSOA) {
          throw new ErroDeNegocio(`Você já tem ${LIMITE_ATIVOS_POR_PESSOA} anúncios aguardando ou publicados. Remova um deles para reenviar este.`);
        }
      }
      tx.update(ref, {
        titulo: v.titulo,
        texto: v.texto,
        categoria: v.categoria,
        preco: v.preco,
        contatoWhatsapp: v.contatoWhatsapp,
        fotos,
        autorPrimeiroNome: primeiroNome(ctx.nome),
        status: "pendente",
        motivo: "",
        decididoEm: null,
        expiraEm: null,
        editadoEm: FieldValue.serverTimestamp(),
      });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: acaoClassificado("classificado.editar"),
        alvo: `classifieds/${id}`,
        detalhes: { categoria: v.categoria, de: situacao, para: "pendente", temPreco: v.preco !== null, temContato: v.contatoWhatsapp !== null, fotos: fotos.length },
      });
      return situacao;
    });

    await apagarFotos(fotosRemovidas(anterior.fotos, fotos));
    revalidarClassificados();
    avisarNoCelular(
      ctx.condominioId,
      { permissao: "classificados.moderar" },
      { titulo: "Anúncio editado para aprovar", texto: `“${v.titulo}” · por ${primeiroNome(ctx.nome)}`, url: "/classificados/moderar", tag: "anuncios-pendentes" },
      ctx.uid,
    );
    return estava === "aprovado"
      ? `Anúncio "${v.titulo}" atualizado. Ele saiu do ar e volta a aparecer depois que a administração aprovar de novo.`
      : `Anúncio "${v.titulo}" atualizado e enviado para aprovação.`;
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

    const { titulo, autorUid } = await db.runTransaction(async (tx) => {
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
      return { titulo: a.titulo, autorUid: a.autorUid };
    });

    revalidarClassificados();
    avisarNoCelular(ctx.condominioId, { uids: [autorUid] }, { titulo: "Seu anúncio foi aprovado", texto: `“${titulo}” já aparece para os vizinhos.`, url: "/classificados?aba=meus" });
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

    const { titulo, autorUid } = await db.runTransaction(async (tx) => {
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
      return { titulo: a.titulo, autorUid: a.autorUid };
    });

    revalidarClassificados();
    avisarNoCelular(ctx.condominioId, { uids: [autorUid] }, { titulo: "Seu anúncio não foi aprovado", texto: `“${titulo}” · Motivo: ${v.motivo}`, url: "/classificados?aba=meus" });
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

    const { titulo, autorUid } = await db.runTransaction(async (tx) => {
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
      return { titulo: a.titulo, autorUid: a.autorUid };
    });

    revalidarClassificados();
    avisarNoCelular(ctx.condominioId, { uids: [autorUid] }, { titulo: "Seu anúncio foi removido", texto: `“${titulo}” · Motivo: ${v.motivo}`, url: "/classificados?aba=meus" });
    return `Anúncio "${titulo}" removido. O autor verá o motivo.`;
  });
}
