"use server";

/**
 * Ações dos documentos do condomínio. Princípios:
 * - só quem tem "documentos.gerenciar" cadastra, altera, ativa ou desativa;
 * - o documento é um LINK (só https); nenhum arquivo é guardado no portal;
 * - nada é apagado: desativar tira o documento da lista dos moradores;
 * - tudo é registrado na auditoria, na mesma transação (sem o link: só título e categoria).
 */
import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, getContexto } from "../contexto";
import { registrarAuditoria } from "../auditoria";
import { acaoDocumento } from "../dados/documentos";
import { ErroDeNegocio, executar, lerFormulario, type Resultado } from "./resultado";
import { descreverVisibilidade } from "@/lib/documentos";
import { esquemaDocumento, esquemaSituacaoDocumento } from "@/lib/validacao-documentos";

function revalidarDocumentos() {
  revalidatePath("/admin/documentos");
  revalidatePath("/documentos");
  revalidatePath("/inicio");
}

/** Cadastra um documento novo ou altera um existente (campo "id" preenchido). */
export async function salvarDocumento(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "documentos.gerenciar");
    const v = lerFormulario(esquemaDocumento, dados);
    const db = adminDb();
    const col = db.collection("condominiums").doc(ctx.condominioId).collection("documents");
    const ref = v.id ? col.doc(v.id) : col.doc();
    const campos = {
      titulo: v.titulo,
      descricao: v.descricao,
      categoria: v.categoria,
      url: v.url,
      visivelPara: v.visivelPara,
      ativo: v.ativo,
      atualizadoEm: FieldValue.serverTimestamp(),
      atualizadoPor: ctx.uid,
    };

    await db.runTransaction(async (tx) => {
      const atual = await tx.get(ref);
      if (v.id && !atual.exists) throw new ErroDeNegocio("Documento não encontrado. Atualize a página.");
      if (v.id) tx.update(ref, campos);
      else tx.create(ref, { ...campos, criadoPor: ctx.uid, criadoEm: FieldValue.serverTimestamp() });

      // Desligar um documento ativo pela edição conta como "desativar".
      const desativou = Boolean(v.id) && atual.get("ativo") !== false && !v.ativo;
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: acaoDocumento(!v.id ? "documento.criar" : desativou ? "documento.desativar" : "documento.editar"),
        alvo: `documents/${ref.id}`,
        detalhes: {
          titulo: v.titulo,
          categoria: v.categoria,
          visivelPara: descreverVisibilidade(v.visivelPara),
          ativo: v.ativo,
        },
      });
    });

    revalidarDocumentos();
    return v.id ? `Documento "${v.titulo}" atualizado.` : `Documento "${v.titulo}" cadastrado.`;
  });
}

/** Ativa ou desativa um documento (nunca apaga). */
export async function mudarSituacaoDocumento(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "documentos.gerenciar");
    const v = lerFormulario(esquemaSituacaoDocumento, dados);
    const db = adminDb();
    const ref = db.collection("condominiums").doc(ctx.condominioId).collection("documents").doc(v.id);

    const titulo = await db.runTransaction(async (tx) => {
      const atual = await tx.get(ref);
      if (!atual.exists) throw new ErroDeNegocio("Documento não encontrado. Atualize a página.");
      const estavaAtivo = atual.get("ativo") !== false;
      if (estavaAtivo === v.ativo) {
        throw new ErroDeNegocio(v.ativo ? "Este documento já está visível." : "Este documento já está desativado.");
      }
      const nome = typeof atual.get("titulo") === "string" ? (atual.get("titulo") as string) : "Documento";
      tx.update(ref, { ativo: v.ativo, atualizadoEm: FieldValue.serverTimestamp(), atualizadoPor: ctx.uid });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        // Reativar é registrado como "editar" (com ativo: true nos detalhes).
        acao: acaoDocumento(v.ativo ? "documento.editar" : "documento.desativar"),
        alvo: `documents/${ref.id}`,
        detalhes: { titulo: nome, ativo: v.ativo },
      });
      return nome;
    });

    revalidarDocumentos();
    return v.ativo ? `"${titulo}" voltou a aparecer para quem pode ver.` : `"${titulo}" foi desativado e não aparece mais na lista.`;
  });
}
