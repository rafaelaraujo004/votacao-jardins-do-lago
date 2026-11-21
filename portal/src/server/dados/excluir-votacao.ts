import "server-only";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { garantirPermissao, type Contexto } from "../contexto";
import { registrarAuditoria } from "../auditoria";
import { ErroDeNegocio } from "../acoes/resultado";
import { eleicoesDe, paraEleicao } from "./eleicoes";
import { ehVotacaoDeTeste } from "@/lib/eleicoes";

/**
 * EXCLUIR VOTAÇÃO DE TESTE pela tela da comissão (definitivo).
 *
 * Pode excluir:
 * - votação com a palavra "TESTE" no título (em qualquer situação, mesmo com votos de teste);
 * - rascunho que nunca recebeu voto (nunca foi para os moradores).
 * NUNCA a eleição oficial: publicada e sem "TESTE" no título → o servidor recusa.
 *
 * Apaga a eleição e tudo dela: votantes, urna (contagem), links de voto e os índices dos códigos
 * (votoCodigos), fotos, assinaturas da ata e seus índices (ataCodigos). A AUDITORIA fica (é o
 * histórico, nunca apagado) e ganha "eleicao.excluir" — o que também atualiza as telas abertas
 * (o cartão da votação some do topo do Início).
 * Mesma regra do scripts/excluir-votacao-teste.ts (que usa só o título).
 */

/** A comissão pode excluir esta votação? (a tela mostra o botão só quando pode) */
export function podeExcluirVotacao(e: { titulo: string; status: string }, temVotos: boolean): boolean {
  return ehVotacaoDeTeste(e.titulo) || (e.status === "rascunho" && !temVotos);
}

const SUBCOLECOES = ["votantes", "urna", "links", "fotos", "assinaturasAta", "assinaturasLinks"] as const;

export async function excluirVotacao(db: Firestore, ctx: Contexto, id: string): Promise<{ titulo: string; documentos: number }> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const ref = eleicoesDe(ctx, db).doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new ErroDeNegocio("Esta votação não existe mais. Atualize a página.");
  const e = paraEleicao(doc.id, doc.data());
  const urna = await ref.collection("urna").doc("contagem").get();
  if (!podeExcluirVotacao(e, urna.exists))
    throw new ErroDeNegocio(
      'Só dá para excluir votação de teste (com a palavra "TESTE" no título) ou rascunho que nunca recebeu voto. A eleição oficial nunca é excluída.',
    );

  const apagar = new Map<string, DocumentReference>();
  for (const sub of SUBCOLECOES) {
    const snap = await ref.collection(sub).get();
    for (const d of snap.docs) {
      apagar.set(d.ref.path, d.ref);
      const hash = d.get("hash");
      if (sub === "links" && typeof hash === "string" && hash) apagar.set(`votoCodigos/${hash}`, db.collection("votoCodigos").doc(hash));
      if (sub === "assinaturasLinks" && typeof hash === "string" && hash) apagar.set(`ataCodigos/${hash}`, db.collection("ataCodigos").doc(hash));
    }
  }
  // Índices desta eleição neste condomínio que tenham ficado sem o documento de link (por garantia).
  for (const col of ["votoCodigos", "ataCodigos"] as const) {
    const snap = await db.collection(col).where("eleicaoId", "==", id).get();
    for (const d of snap.docs) if (d.get("condominioId") === ctx.condominioId) apagar.set(d.ref.path, d.ref);
  }
  const lista = [...apagar.values()];
  // A própria eleição vai no ÚLTIMO lote (se algo falhar no meio, dá para tentar de novo pela tela).
  for (let i = 0; i < lista.length; i += 450) {
    const lote = db.batch();
    for (const r of lista.slice(i, i + 450)) lote.delete(r);
    await lote.commit();
  }
  const final = db.batch();
  final.delete(ref);
  registrarAuditoria(db, final, {
    condominioId: ctx.condominioId,
    uid: ctx.uid,
    nome: ctx.nome,
    papel: ctx.papel,
    acao: "eleicao.excluir",
    alvo: `elections/${id}`,
    detalhes: { titulo: e.titulo, documentos: lista.length + 1, comVotos: urna.exists },
  });
  await final.commit();
  return { titulo: e.titulo, documentos: lista.length + 1 };
}
