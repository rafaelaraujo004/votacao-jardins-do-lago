"use server";

/**
 * Ações dos comunicados (só quem tem "comunicados.publicar", ex.: o síndico).
 * - Tudo é gravado numa TRANSAÇÃO, junto com a auditoria.
 * - Nada é apagado: "despublicar" = arquivar (sai do ar e fica no histórico).
 * - A auditoria guarda o título e as situações, nunca o texto inteiro.
 */
import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, getContexto } from "../contexto";
import { registrarAuditoria } from "../auditoria";
import { acaoComunicado, paraComunicadoGestao } from "../dados/comunicados";
import { ErroDeNegocio, executar, lerFormulario, type Resultado } from "./resultado";
import { apagarFotos, fotosDoFormulario } from "../fotos";
import { avisarNoCelular } from "../push";
import { fotosRemovidas, lerFotos } from "@/lib/fotos";
import { conferirMudanca, statusDepois } from "@/lib/comunicados";
import { esquemaComunicado, esquemaMudanca } from "@/lib/validacao-comunicados";

/** Avisa no celular dos moradores (e da portaria) que saiu um comunicado. */
function avisarComunicado(ctx: { condominioId: string; uid: string }, id: string, titulo: string, prioridade: string) {
  const mensagem = { titulo: prioridade === "urgente" ? "⚠️ Comunicado urgente" : "Novo comunicado", texto: titulo, tag: `comunicado-${id}` };
  avisarNoCelular(ctx.condominioId, { papeis: ["morador"] }, { ...mensagem, url: `/comunicados/${id}` }, ctx.uid);
  avisarNoCelular(ctx.condominioId, { papeis: ["portaria"] }, { ...mensagem, url: `/portaria/comunicados/${id}` }, ctx.uid);
}

function revalidarComunicados(id?: string) {
  revalidatePath("/comunicados");
  if (id) revalidatePath(`/comunicados/${id}`);
  revalidatePath("/inicio");
  revalidatePath("/admin/comunicados");
  revalidatePath("/admin");
}

/** Cria (sem "id") ou altera (com "id") um comunicado. Pode já publicar. */
export async function salvarComunicado(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "comunicados.publicar");
    const v = lerFormulario(esquemaComunicado, dados);
    const db = adminDb();
    const col = db.collection("condominiums").doc(ctx.condominioId).collection("announcements");
    const ref = v.id ? col.doc(v.id) : col.doc();
    const auditoriaBase = { condominioId: ctx.condominioId, uid: ctx.uid, nome: ctx.nome, papel: ctx.papel, alvo: `announcements/${ref.id}` };

    // Fotos: as que ficam ("atual:N") e as novas, conferidas no Storage ANTES da transação.
    const fotosAntes = v.id ? lerFotos((await ref.get()).get("fotos"), ctx.condominioId, "comunicados") : [];
    const fotos = await fotosDoFormulario(v.fotos, ctx.condominioId, "comunicados", fotosAntes);
    const mesmaLista = (a: { caminho: string }[], b: { caminho: string }[]) =>
      a.length === b.length && a.every((f, i) => f.caminho === b[i]?.caminho);

    const final = await db.runTransaction(async (tx) => {
      const doc = v.id ? await tx.get(ref) : null;
      if (v.id && !doc?.exists) throw new ErroDeNegocio("Comunicado não encontrado. Atualize a página.");
      const atual = doc?.exists ? paraComunicadoGestao(doc.id, doc.data()) : null;
      // Outra pessoa mudou as fotos enquanto esta editava: não mistura as duas versões.
      if (doc?.exists && !mesmaLista(lerFotos(doc.get("fotos"), ctx.condominioId, "comunicados"), fotosAntes)) {
        throw new ErroDeNegocio("As fotos deste comunicado mudaram enquanto você editava. Atualize a página e tente de novo.");
      }

      const statusAntes = atual?.status ?? null;
      const status = v.destino === "publicar" ? "publicado" : (statusAntes ?? "rascunho");
      // Só comunicado publicado fica fixado no topo.
      const fixado = status === "publicado" ? v.fixado : false;
      const publicando = status === "publicado" && statusAntes !== "publicado";

      const campos = {
        titulo: v.titulo,
        texto: v.texto,
        prioridade: v.prioridade,
        fixado,
        status,
        fotos,
        atualizadoEm: FieldValue.serverTimestamp(),
        // A data de publicação é a da PRIMEIRA vez (republicar não "renova" o comunicado).
        ...(publicando && !atual?.publicadoEm ? { publicadoEm: FieldValue.serverTimestamp() } : {}),
      };

      if (atual) {
        tx.update(ref, campos);
      } else {
        tx.create(ref, {
          ...campos,
          publicadoEm: publicando ? FieldValue.serverTimestamp() : null,
          criadoPor: ctx.uid,
          criadoPorNome: ctx.nome,
          criadoEm: FieldValue.serverTimestamp(),
        });
      }

      registrarAuditoria(db, tx, {
        ...auditoriaBase,
        acao: acaoComunicado(atual ? "comunicado.editar" : "comunicado.criar"),
        detalhes: { titulo: v.titulo, prioridade: v.prioridade, fixado, situacao: status, fotos: fotos.length },
      });
      if (publicando) {
        registrarAuditoria(db, tx, {
          ...auditoriaBase,
          acao: acaoComunicado("comunicado.publicar"),
          detalhes: { titulo: v.titulo, de: statusAntes ?? "novo", para: "publicado" },
        });
      }
      return { novo: !atual, status, publicando };
    });

    // Fotos que saíram do comunicado: apagadas do Storage (depois de salvar).
    await apagarFotos(fotosRemovidas(fotosAntes, fotos));
    revalidarComunicados(ref.id);
    if (final.publicando) avisarComunicado(ctx, ref.id, v.titulo, v.prioridade);
    if (final.publicando) return `Comunicado publicado: "${v.titulo}". Os moradores já podem ler.`;
    if (final.novo) return `Rascunho salvo: "${v.titulo}". Ele ainda não aparece para os moradores.`;
    return final.status === "publicado"
      ? `Alterações salvas. Os moradores já veem a versão nova.`
      : `Alterações salvas em "${v.titulo}".`;
  });
}

/** Publicar, arquivar (despublicar), fixar ou desafixar. */
export async function mudarComunicado(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "comunicados.publicar");
    const { id, mudanca } = lerFormulario(esquemaMudanca, dados);
    const db = adminDb();
    const ref = db.collection("condominiums").doc(ctx.condominioId).collection("announcements").doc(id);

    const { titulo, prioridade } = await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw new ErroDeNegocio("Comunicado não encontrado. Atualize a página.");
      const atual = paraComunicadoGestao(doc.id, doc.data());
      const problema = conferirMudanca(atual, mudanca);
      if (problema) throw new ErroDeNegocio(problema);

      const status = statusDepois(atual.status, mudanca);
      tx.update(ref, {
        status,
        // Arquivado sai do topo; fixar/desafixar muda só a marca.
        fixado: mudanca === "fixar" ? true : mudanca === "desafixar" || mudanca === "arquivar" ? false : atual.fixado,
        atualizadoEm: FieldValue.serverTimestamp(),
        ...(mudanca === "publicar" && !atual.publicadoEm ? { publicadoEm: FieldValue.serverTimestamp() } : {}),
      });

      const acao =
        mudanca === "publicar" ? "comunicado.publicar" : mudanca === "arquivar" ? "comunicado.arquivar" : "comunicado.editar";
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: acaoComunicado(acao),
        alvo: `announcements/${id}`,
        detalhes: { titulo: atual.titulo, mudanca, de: atual.status, para: status },
      });
      return { titulo: atual.titulo, prioridade: atual.prioridade };
    });

    revalidarComunicados(id);
    if (mudanca === "publicar") avisarComunicado(ctx, id, titulo, prioridade);
    switch (mudanca) {
      case "publicar":
        return `Comunicado publicado: "${titulo}".`;
      case "arquivar":
        return `Comunicado arquivado: "${titulo}". Ele saiu da lista dos moradores.`;
      case "fixar":
        return `"${titulo}" agora fica fixado no topo da lista.`;
      case "desafixar":
        return `"${titulo}" não está mais fixado no topo.`;
    }
  });
}
