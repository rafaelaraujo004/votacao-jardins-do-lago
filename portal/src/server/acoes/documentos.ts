"use server";

/**
 * Ações dos documentos do condomínio. Princípios:
 * - só quem tem "documentos.gerenciar" cadastra, altera, ativa ou desativa;
 * - o documento é um ARQUIVO guardado no Storage ou um LINK (só https);
 * - o arquivo vai do navegador direto para o Storage com uma autorização de
 *   uso único (vale só para aquele caminho); ao salvar, o servidor confere no
 *   Storage se o arquivo existe, o tipo e o tamanho, antes de gravar no banco;
 * - nada é apagado: desativar tira o documento da lista dos moradores
 *   (só o arquivo ANTIGO é apagado quando o síndico troca por outro);
 * - tudo é registrado na auditoria, na mesma transação (sem link nem caminho: só título e categoria).
 */
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminBalde, adminDb } from "../firebase-admin";
import { garantirPermissao, getContexto } from "../contexto";
import { registrarAuditoria } from "../auditoria";
import { acaoDocumento, lerArquivo, type ArquivoGuardado } from "../dados/documentos";
import { ErroDeNegocio, executar, lerFormulario, type Resultado } from "./resultado";
import {
  caminhoArquivoValido,
  descreverVisibilidade,
  nomeArquivoSeguro,
  pastaArquivosDocumentos,
  tipoArquivoAceito,
  TAMANHO_MAXIMO_ARQUIVO,
} from "@/lib/documentos";
import { esquemaDocumento, esquemaEnvioArquivo, esquemaSituacaoDocumento } from "@/lib/validacao-documentos";

function revalidarDocumentos() {
  revalidatePath("/admin/documentos");
  revalidatePath("/documentos");
  revalidatePath("/inicio");
}

export type PermissaoDeEnvio = { ok: true; caminho: string; token: string } | { ok: false; erro: string };

/**
 * Antes de mandar o arquivo: o servidor confere nome, tipo e tamanho e devolve
 * o caminho onde ele deve ficar + uma autorização (token) que só permite
 * CRIAR aquele arquivo, naquele caminho (as regras do Storage conferem).
 */
export async function prepararEnvioArquivo(pedido: { nome: string; tipo: string; tamanho: number }): Promise<PermissaoDeEnvio> {
  try {
    const ctx = garantirPermissao(await getContexto(), "documentos.gerenciar");
    const r = esquemaEnvioArquivo.safeParse(pedido);
    if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? "Arquivo inválido." };
    const caminho = `${pastaArquivosDocumentos(ctx.condominioId)}${randomUUID()}/${nomeArquivoSeguro(r.data.nome)}`;
    const token = await adminAuth().createCustomToken(ctx.uid, { envioDoc: caminho });
    return { ok: true, caminho, token };
  } catch (erro) {
    if (erro instanceof Error && erro.name === "ErroDeAcesso") return { ok: false, erro: erro.message };
    console.error("prepararEnvioArquivo", erro);
    return { ok: false, erro: "Não foi possível preparar o envio. Tente de novo." };
  }
}

/** Confere no Storage o arquivo que o navegador diz ter enviado. */
async function conferirArquivoEnviado(caminho: string, condominioId: string, nome: string): Promise<ArquivoGuardado> {
  if (!caminhoArquivoValido(caminho, condominioId)) throw new ErroDeNegocio("Arquivo inválido. Envie de novo.");
  const arquivo = adminBalde().file(caminho);
  const [existe] = await arquivo.exists();
  if (!existe) throw new ErroDeNegocio("O arquivo não chegou ao portal. Envie de novo e espere terminar.");
  const [meta] = await arquivo.getMetadata();
  const tamanho = Number(meta.size ?? 0);
  const tipo = String(meta.contentType ?? "");
  if (!tipoArquivoAceito(tipo) || !(tamanho > 0) || tamanho > TAMANHO_MAXIMO_ARQUIVO) {
    await arquivo.delete({ ignoreNotFound: true });
    throw new ErroDeNegocio("Arquivo não aceito (tipo ou tamanho). Envie PDF, foto, Word ou Excel de até 20 MB.");
  }
  return { caminho, nome: nomeArquivoSeguro(nome), tipo, tamanho };
}

/** Apaga um arquivo antigo do Storage sem travar a tela se der errado. */
async function apagarArquivo(caminho: string) {
  try {
    await adminBalde().file(caminho).delete({ ignoreNotFound: true });
  } catch (erro) {
    console.error("Não foi possível apagar o arquivo antigo", caminho, erro);
  }
}

/** Cadastra um documento novo ou altera um existente (campo "id" preenchido). */
export async function salvarDocumento(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "documentos.gerenciar");
    const v = lerFormulario(esquemaDocumento, dados);
    const db = adminDb();
    const col = db.collection("condominiums").doc(ctx.condominioId).collection("documents");
    const ref = v.id ? col.doc(v.id) : col.doc();

    // Arquivo novo: confere ANTES da transação (o Storage não entra nela).
    const arquivoNovo =
      v.fonte.origem === "arquivo" && v.fonte.caminho
        ? await conferirArquivoEnviado(v.fonte.caminho, ctx.condominioId, v.fonte.nome)
        : null;

    const arquivoAntigo = await db.runTransaction(async (tx) => {
      const atual = await tx.get(ref);
      if (v.id && !atual.exists) throw new ErroDeNegocio("Documento não encontrado. Atualize a página.");
      const anterior = lerArquivo(atual.get("arquivo"));

      let origem: Record<string, unknown>;
      if (v.fonte.origem === "link") {
        origem = { url: v.fonte.url, arquivo: v.id ? FieldValue.delete() : null };
      } else if (arquivoNovo) {
        origem = { arquivo: arquivoNovo, url: v.id ? FieldValue.delete() : null };
      } else {
        // Editando sem enviar arquivo novo: só vale se o documento já tinha arquivo.
        if (!anterior) throw new ErroDeNegocio("Escolha o arquivo e espere o envio terminar.");
        origem = {};
      }

      const campos = {
        titulo: v.titulo,
        descricao: v.descricao,
        categoria: v.categoria,
        ...origem,
        visivelPara: v.visivelPara,
        ativo: v.ativo,
        atualizadoEm: FieldValue.serverTimestamp(),
        atualizadoPor: ctx.uid,
      };
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
          origem: v.fonte.origem,
          visivelPara: descreverVisibilidade(v.visivelPara),
          ativo: v.ativo,
        },
      });

      // O arquivo antigo sai do Storage se foi trocado (por outro arquivo ou por um link).
      const trocou = anterior && (v.fonte.origem === "link" || (arquivoNovo && arquivoNovo.caminho !== anterior.caminho));
      return trocou ? anterior.caminho : null;
    });

    if (arquivoAntigo) await apagarArquivo(arquivoAntigo);

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
