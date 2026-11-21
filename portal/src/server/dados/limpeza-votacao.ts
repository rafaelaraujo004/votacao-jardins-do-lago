import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import { registrarAuditoria } from "../auditoria";
import { ErroDeNegocio } from "../acoes/resultado";
import { data, eleicoesDe, paraEleicao } from "./eleicoes";

/**
 * APAGAR OS DADOS PESSOAIS DA VOTAÇÃO (LGPD) — depois que o resultado saiu.
 *
 * Depois da eleição, as SENHAS e os CÓDIGOS dos links de voto não servem para mais nada; a
 * LGPD pede apagar o que perdeu a finalidade.
 * Apaga:
 * - os links de voto de cada casa (código e senha em elections/{id}/links);
 * - nos índices globais dos códigos (votoCodigos), a senha e a casa: o índice fica só com o
 *   condomínio e a eleição, marcado como DESATIVADO — o link antigo passa a mostrar "esta
 *   votação terminou" (e não "link inválido, peça outro").
 * NÃO apaga a lista de contatos (contatosVotacao): ela é do condomínio, não da eleição — a
 * portaria (aviso de encomenda no WhatsApp) e a importação de moradores também usam.
 * FICA (é o registro da eleição): quem votou (votantes, sem o voto), a contagem (urna), a
 * chapa e as fotos, a ata e as assinaturas digitais (inclusive links de assinatura ainda
 * esperando: a ata pode ser assinada depois). A auditoria registra "eleicao.limpeza".
 *
 * Só a comissão (eleicoes.gerenciar), só depois do resultado DIVULGADO, uma vez (repetir não faz mal).
 */

export type SituacaoLimpeza = { podeApagar: boolean; apagadosEm: Date | null; links: number };

/** Para a tela da comissão: já apagou? quantos links e contatos ainda existem? */
export async function situacaoDaLimpeza(ctx: Contexto, id: string, db: Firestore = adminDb()): Promise<SituacaoLimpeza> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const ref = eleicoesDe(ctx, db).doc(id);
  const [doc, links] = await Promise.all([ref.get(), ref.collection("links").count().get()]);
  if (!doc.exists) return { podeApagar: false, apagadosEm: null, links: 0 };
  const e = paraEleicao(doc.id, doc.data());
  return {
    podeApagar: e.status === "publicada" && !!e.resultadoDivulgadoEm,
    apagadosEm: data(doc.get("dadosPessoaisApagadosEm")),
    links: links.data().count,
  };
}

export async function apagarDadosPessoaisDaVotacao(
  db: Firestore,
  ctx: Contexto,
  id: string,
): Promise<{ links: number; codigos: number }> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const ref = eleicoesDe(ctx, db).doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new ErroDeNegocio("Eleição não encontrada. Atualize a página.");
  const e = paraEleicao(doc.id, doc.data());
  if (e.status !== "publicada" || !e.resultadoDivulgadoEm)
    throw new ErroDeNegocio("Só dá para apagar os dados pessoais depois que o resultado for divulgado.");

  const [links, indices] = await Promise.all([
    ref.collection("links").get(),
    db.collection("votoCodigos").where("eleicaoId", "==", id).get(),
  ]);
  // Índices desta eleição neste condomínio que ainda têm senha (os já desativados ficam).
  const desativar = indices.docs.filter((i) => i.get("condominioId") === ctx.condominioId && i.get("senhaHash")).map((i) => i.ref);
  type Passo = { tipo: "apagar" | "desativar"; ref: FirebaseFirestore.DocumentReference };
  const passos: Passo[] = [
    ...links.docs.map((l) => ({ tipo: "apagar" as const, ref: l.ref })),
    ...desativar.map((r) => ({ tipo: "desativar" as const, ref: r })),
  ];
  const codigos = desativar.length;
  // Lotes de até 450 (limite de 500 por lote, com folga para a marca e a auditoria).
  for (let i = 0; i < Math.max(passos.length, 1); i += 450) {
    const lote = db.batch();
    for (const p of passos.slice(i, i + 450)) {
      if (p.tipo === "apagar") lote.delete(p.ref);
      else lote.update(p.ref, { senhaHash: FieldValue.delete(), unitId: FieldValue.delete(), desativadoEm: FieldValue.serverTimestamp() });
    }
    if (i === 0) {
      lote.update(ref, { dadosPessoaisApagadosEm: FieldValue.serverTimestamp(), dadosPessoaisApagadosPor: ctx.uid });
      registrarAuditoria(db, lote, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "eleicao.limpeza",
        alvo: `elections/${id}`,
        detalhes: { titulo: e.titulo, links: links.size, codigos },
      });
    }
    await lote.commit();
  }
  return { links: links.size, codigos };
}
