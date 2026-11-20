"use server";

/**
 * Comprovantes dos lançamentos do caixa. Princípios:
 * - só quem tem "financeiro.lancar" anexa ou remove;
 * - anexar NÃO muda valor nenhum: vale até em mês publicado (o comprovante chega depois);
 * - o arquivo vai do navegador direto para o Storage com uma autorização de uso único
 *   (só aquele caminho); ao salvar, o servidor confere no Storage se o arquivo existe,
 *   o tipo e o tamanho, antes de gravar;
 * - remover serve para corrigir um anexo errado: sai da lista e do Storage, e fica na auditoria;
 * - tudo é registrado na auditoria, na mesma transação (só o nome do arquivo, nunca o caminho).
 */
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminBalde, adminDb } from "../firebase-admin";
import { garantirPermissao, getContexto } from "../contexto";
import { registrarAuditoria } from "../auditoria";
import { ErroDeNegocio, executar, lerFormulario, type Resultado } from "./resultado";
import {
  caminhoComprovanteValido,
  esquemaAnexarComprovante,
  esquemaEnvioComprovante,
  esquemaRemoverComprovante,
  lerComprovantes,
  MAXIMO_COMPROVANTES,
  pastaComprovantes,
  tipoComprovanteAceito,
  TAMANHO_MAXIMO_COMPROVANTE,
  type ComprovanteGuardado,
} from "@/lib/comprovantes";
import { nomeArquivoSeguro } from "@/lib/documentos";

function revalidarFinanceiro() {
  revalidatePath("/admin/financeiro");
  revalidatePath("/financeiro");
}

export type PermissaoDeEnvioComprovante = { ok: true; caminho: string; token: string } | { ok: false; erro: string };

/**
 * Antes de mandar o arquivo: confere nome, tipo e tamanho e devolve o caminho onde ele
 * deve ficar + uma autorização que só permite CRIAR aquele arquivo (as regras do Storage conferem).
 */
export async function prepararEnvioComprovante(pedido: { nome: string; tipo: string; tamanho: number }): Promise<PermissaoDeEnvioComprovante> {
  try {
    const ctx = garantirPermissao(await getContexto(), "financeiro.lancar");
    const r = esquemaEnvioComprovante.safeParse(pedido);
    if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? "Arquivo inválido." };
    const caminho = `${pastaComprovantes(ctx.condominioId)}${randomUUID()}/${nomeArquivoSeguro(r.data.nome)}`;
    const token = await adminAuth().createCustomToken(ctx.uid, { envioComprovante: caminho });
    return { ok: true, caminho, token };
  } catch (erro) {
    if (erro instanceof Error && erro.name === "ErroDeAcesso") return { ok: false, erro: erro.message };
    console.error("prepararEnvioComprovante", erro);
    return { ok: false, erro: "Não foi possível preparar o envio. Tente de novo." };
  }
}

/** Confere no Storage o arquivo que o navegador diz ter enviado. */
async function conferirArquivo(caminho: string, condominioId: string, nome: string): Promise<Omit<ComprovanteGuardado, "id">> {
  if (!caminhoComprovanteValido(caminho, condominioId)) throw new ErroDeNegocio("Arquivo inválido. Envie de novo.");
  const arquivo = adminBalde().file(caminho);
  const [existe] = await arquivo.exists();
  if (!existe) throw new ErroDeNegocio("O arquivo não chegou ao portal. Envie de novo e espere terminar.");
  const [meta] = await arquivo.getMetadata();
  const tamanho = Number(meta.size ?? 0);
  const tipo = String(meta.contentType ?? "");
  if (!tipoComprovanteAceito(tipo) || !(tamanho > 0) || tamanho > TAMANHO_MAXIMO_COMPROVANTE) {
    await arquivo.delete({ ignoreNotFound: true });
    throw new ErroDeNegocio("Arquivo não aceito (tipo ou tamanho). Envie PDF ou foto de até 20 MB.");
  }
  return { caminho, nome, tipo, tamanho };
}

async function apagarArquivo(caminho: string) {
  try {
    await adminBalde().file(caminho).delete({ ignoreNotFound: true });
  } catch (erro) {
    console.error("Comprovante: não foi possível apagar o arquivo", caminho, erro);
  }
}

/** Anexa ao lançamento o arquivo já enviado ao Storage. */
export async function anexarComprovante(_: Resultado, dados: FormData): Promise<Resultado> {
  // Se algo der errado depois do envio, o arquivo enviado não pode ficar solto no Storage.
  let enviado: string | null = null;
  const resultado = await executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "financeiro.lancar");
    const v = lerFormulario(esquemaAnexarComprovante, dados);
    enviado = caminhoComprovanteValido(v.caminho, ctx.condominioId) ? v.caminho : null;
    const arquivo = await conferirArquivo(v.caminho, ctx.condominioId, v.nome);
    const db = adminDb();
    const ref = db.collection("condominiums").doc(ctx.condominioId).collection("financialEntries").doc(v.lancamentoId);

    const descricao = await db.runTransaction(async (tx) => {
      const atual = await tx.get(ref);
      if (!atual.exists) throw new ErroDeNegocio("Lançamento não encontrado. Atualize a página.");
      const lista = lerComprovantes(atual.get("comprovantes"));
      if (lista.some((c) => c.caminho === arquivo.caminho)) throw new ErroDeNegocio("Este arquivo já está anexado.");
      if (lista.length >= MAXIMO_COMPROVANTES) {
        throw new ErroDeNegocio(`Este lançamento já tem ${MAXIMO_COMPROVANTES} comprovantes. Remova um antes de anexar outro.`);
      }
      const novo: ComprovanteGuardado = { id: randomUUID(), ...arquivo };
      tx.update(ref, {
        comprovantes: FieldValue.arrayUnion({ ...novo, enviadoEm: Date.now(), enviadoPor: ctx.uid, enviadoPorNome: ctx.nome }),
      });
      const desc = String(atual.get("descricao") ?? "");
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "financeiro.comprovante",
        alvo: `financialEntries/${ref.id}`,
        detalhes: { operacao: "anexar", comprovante: novo.id, arquivo: novo.nome, mes: String(atual.get("mes") ?? ""), lancamento: desc },
      });
      return desc;
    });

    enviado = null; // gravado: o arquivo fica
    revalidarFinanceiro();
    return `Comprovante anexado a "${descricao}".`;
  });
  if (enviado) await apagarArquivo(enviado);
  return resultado;
}

/** Tira um comprovante do lançamento (anexo errado) e apaga o arquivo. */
export async function removerComprovante(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "financeiro.lancar");
    const v = lerFormulario(esquemaRemoverComprovante, dados);
    const db = adminDb();
    const ref = db.collection("condominiums").doc(ctx.condominioId).collection("financialEntries").doc(v.lancamentoId);

    const removido = await db.runTransaction(async (tx) => {
      const atual = await tx.get(ref);
      if (!atual.exists) throw new ErroDeNegocio("Lançamento não encontrado. Atualize a página.");
      const brutos: unknown[] = Array.isArray(atual.get("comprovantes")) ? atual.get("comprovantes") : [];
      const alvo = lerComprovantes(brutos).find((c) => c.id === v.comprovanteId);
      if (!alvo) throw new ErroDeNegocio("Este comprovante já foi removido. Atualize a página.");
      // Regrava a lista sem ele (arrayRemove precisaria do objeto idêntico, com data e autor).
      tx.update(ref, {
        comprovantes: brutos.filter((b) => !(b && typeof b === "object" && (b as { id?: unknown }).id === v.comprovanteId)),
      });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "financeiro.comprovante",
        alvo: `financialEntries/${ref.id}`,
        detalhes: { operacao: "remover", comprovante: alvo.id, arquivo: alvo.nome, mes: String(atual.get("mes") ?? ""), lancamento: String(atual.get("descricao") ?? "") },
      });
      return alvo;
    });

    await apagarArquivo(removido.caminho);
    revalidarFinanceiro();
    return `Comprovante "${removido.nome}" removido.`;
  });
}
