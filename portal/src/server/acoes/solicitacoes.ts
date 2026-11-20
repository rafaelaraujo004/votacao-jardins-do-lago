"use server";

/**
 * Ações das SOLICITAÇÕES. Princípios:
 * - morador ("solicitacoes.abrir"): abre, comenta e cancela SÓ na própria casa;
 * - administração ("solicitacoes.gerenciar"): muda a situação e responde
 *   (público ou nota interna, que o morador nunca vê);
 * - o protocolo "AAAA-NNNN" sai de um contador do ano, numa TRANSAÇÃO
 *   (dois pedidos ao mesmo tempo nunca recebem o mesmo número);
 * - nada é apagado; tudo vai para a auditoria na mesma transação.
 */
import { revalidatePath } from "next/cache";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, getContexto, type Contexto } from "../contexto";
import { registrarAuditoria, type AcaoAuditada } from "../auditoria";
import { consumirTentativa } from "../rate-limit";
import { ErroDeNegocio, executar, lerFormulario, type Resultado } from "./resultado";
import { hojeISO } from "@/lib/formato";
import { avisarNoCelular } from "../push";
import {
  ROTULO_STATUS_SOLICITACAO,
  formatarProtocolo,
  idContadorSolicitacoes,
  paraSolicitacao,
  podeCancelarMorador,
  podeComentarMorador,
  podeMudarStatus,
  proximoNumero,
  type Solicitacao,
} from "@/lib/solicitacoes";
import {
  esquemaAbrirSolicitacao,
  esquemaCancelarSolicitacao,
  esquemaComentarSolicitacao,
  esquemaMudarStatusSolicitacao,
  esquemaResponderSolicitacao,
} from "@/lib/validacao-solicitacoes";

type AcaoSolicitacao = "solicitacao.abrir" | "solicitacao.comentar" | "solicitacao.status" | "solicitacao.cancelar";

/** Nome da ação na auditoria (todas estão em ACOES_AUDITADAS). */
function acao(a: AcaoSolicitacao): AcaoAuditada {
  return a;
}

function revalidar(id?: string) {
  revalidatePath("/solicitacoes");
  revalidatePath("/admin/solicitacoes");
  revalidatePath("/inicio");
  revalidatePath("/admin");
  if (id) {
    revalidatePath(`/solicitacoes/${id}`);
    revalidatePath(`/admin/solicitacoes/${id}`);
  }
}

const colecao = (db: Firestore, ctx: Contexto) => db.collection("condominiums").doc(ctx.condominioId);

/** Papel do autor na linha do tempo: quem não é morador fala pela administração. */
const papelDoAutor = (ctx: Contexto) => (ctx.papel === "morador" ? "morador" : "administracao");

/** Lê a solicitação dentro da transação (erro amigável se não existir). */
async function lerNaTransacao(tx: Transaction, db: Firestore, ctx: Contexto, id: string) {
  const ref = colecao(db, ctx).collection("tickets").doc(id);
  const doc = await tx.get(ref);
  if (!doc.exists) throw new ErroDeNegocio("Solicitação não encontrada. Atualize a página.");
  return { ref, s: paraSolicitacao(doc.id, doc.data()) };
}

/** Morador: só a própria casa. De outra casa = "não encontrada" (não revela que existe). */
function conferirCasa(ctx: Contexto, s: Solicitacao) {
  if (!ctx.unitId || s.unitId !== ctx.unitId) throw new ErroDeNegocio("Solicitação não encontrada. Atualize a página.");
}

// ---------- Morador ----------

/** Abre uma solicitação e devolve o protocolo. */
export async function abrirSolicitacao(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "solicitacoes.abrir");
    if (!ctx.unitId) throw new ErroDeNegocio("Seu cadastro não está ligado a uma casa. Fale com a administração.");
    const v = lerFormulario(esquemaAbrirSolicitacao, dados);
    const db = adminDb();

    // Freio contra cliques repetidos ou abuso: até 10 solicitações por casa a cada hora.
    const limite = await consumirTentativa(db, "solicitacao.abrir", `${ctx.condominioId}:${ctx.unitId}`, 10, 3600);
    if (!limite.permitido) {
      throw new ErroDeNegocio("Muitas solicitações em pouco tempo. Aguarde um pouco ou fale com a administração.");
    }

    const ano = Number(hojeISO(new Date(), ctx.fuso).slice(0, 4));
    const c = colecao(db, ctx);
    const contadorRef = c.collection("counters").doc(idContadorSolicitacoes(ano));
    const unidadeRef = c.collection("units").doc(ctx.unitId);
    const ticketRef = c.collection("tickets").doc();

    const protocolo = await db.runTransaction(async (tx) => {
      // 1) Leituras primeiro (regra das transações).
      const [contador, unidade] = await tx.getAll(contadorRef, unidadeRef);
      if (!unidade.exists) throw new ErroDeNegocio("Sua casa não foi encontrada no cadastro. Fale com a administração.");
      if (unidade.get("status") === "inativa") throw new ErroDeNegocio("Sua casa está inativa no cadastro. Fale com a administração.");

      const numero = proximoNumero(contador.get("ultimo"));
      const protocolo = formatarProtocolo(ano, numero);

      // 2) Gravações: contador + solicitação + auditoria, tudo junto.
      tx.set(contadorRef, { ultimo: numero, ano, atualizadoEm: FieldValue.serverTimestamp() });
      tx.create(ticketRef, {
        protocolo,
        unitId: ctx.unitId,
        unidadeRotulo: String(unidade.get("rotulo") ?? ctx.unidadeRotulo ?? ctx.unitId),
        categoria: v.categoria,
        local: v.local,
        descricao: v.descricao,
        status: "aberta",
        criadoPor: ctx.uid,
        criadoEm: FieldValue.serverTimestamp(),
        atualizadoEm: FieldValue.serverTimestamp(),
        resolvidoEm: null,
      });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: acao("solicitacao.abrir"),
        alvo: `tickets/${ticketRef.id}`,
        // Sem a descrição (pode ter dados pessoais): só o essencial.
        detalhes: { protocolo, categoria: v.categoria, unidade: ctx.unitId },
      });
      return protocolo;
    });

    revalidar();
    avisarNoCelular(
      ctx.condominioId,
      { permissao: "solicitacoes.gerenciar", papeis: ["admin", "conselheiro"] },
      { titulo: `Nova solicitação ${protocolo}`, texto: `${ctx.unidadeRotulo ?? "Uma casa"} abriu uma solicitação.`, url: `/admin/solicitacoes/${ticketRef.id}` },
      ctx.uid,
    );
    return `Solicitação enviada. Seu protocolo é ${protocolo}.`;
  });
}

/** O morador escreve na solicitação da própria casa (sempre público). */
export async function comentarSolicitacao(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "solicitacoes.abrir");
    const v = lerFormulario(esquemaComentarSolicitacao, dados);
    const db = adminDb();
    const protocolo = await db.runTransaction(async (tx) => {
      const { ref, s } = await lerNaTransacao(tx, db, ctx, v.id);
      conferirCasa(ctx, s);
      if (!podeComentarMorador(s.status)) {
        throw new ErroDeNegocio("Esta solicitação já foi encerrada. Se o problema continuar, abra uma nova.");
      }
      tx.create(ref.collection("updates").doc(), {
        tipo: "comentario",
        texto: v.texto,
        deStatus: null,
        paraStatus: null,
        autorUid: ctx.uid,
        autorNome: ctx.nome,
        autorPapel: "morador",
        publico: true,
        criadoEm: FieldValue.serverTimestamp(),
      });
      tx.update(ref, { atualizadoEm: FieldValue.serverTimestamp() });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: acao("solicitacao.comentar"),
        alvo: `tickets/${s.id}`,
        detalhes: { protocolo: s.protocolo, publico: true, origem: "morador" },
      });
      return s.protocolo;
    });
    revalidar(v.id);
    return `Mensagem enviada na solicitação ${protocolo}.`;
  });
}

/** O morador cancela enquanto a solicitação ainda está "aberta". */
export async function cancelarSolicitacao(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "solicitacoes.abrir");
    const v = lerFormulario(esquemaCancelarSolicitacao, dados);
    const db = adminDb();
    const protocolo = await db.runTransaction(async (tx) => {
      const { ref, s } = await lerNaTransacao(tx, db, ctx, v.id);
      conferirCasa(ctx, s);
      if (!podeCancelarMorador(s.status)) {
        throw new ErroDeNegocio("Só dá para cancelar enquanto a solicitação está aberta. Fale com a administração.");
      }
      tx.update(ref, { status: "cancelada", atualizadoEm: FieldValue.serverTimestamp() });
      tx.create(ref.collection("updates").doc(), {
        tipo: "status",
        texto: v.motivo || "Cancelada pelo morador.",
        deStatus: s.status,
        paraStatus: "cancelada",
        autorUid: ctx.uid,
        autorNome: ctx.nome,
        autorPapel: "morador",
        publico: true,
        criadoEm: FieldValue.serverTimestamp(),
      });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: acao("solicitacao.cancelar"),
        alvo: `tickets/${s.id}`,
        detalhes: { protocolo: s.protocolo, de: s.status, para: "cancelada", origem: "morador" },
      });
      return s.protocolo;
    });
    revalidar(v.id);
    return `Solicitação ${protocolo} cancelada.`;
  });
}

// ---------- Administração ----------

/** Muda a situação (aberta → em andamento → resolvida...), com comentário opcional. */
export async function mudarStatusSolicitacao(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "solicitacoes.gerenciar");
    const v = lerFormulario(esquemaMudarStatusSolicitacao, dados);
    const db = adminDb();
    const { protocolo, unitId } = await db.runTransaction(async (tx) => {
      const { ref, s } = await lerNaTransacao(tx, db, ctx, v.id);
      if (s.status === v.status) throw new ErroDeNegocio("A solicitação já está nessa situação. Atualize a página.");
      if (!podeMudarStatus(s.status, v.status)) {
        throw new ErroDeNegocio(
          `Não dá para passar de "${ROTULO_STATUS_SOLICITACAO[s.status]}" para "${ROTULO_STATUS_SOLICITACAO[v.status]}".`,
        );
      }
      tx.update(ref, {
        status: v.status,
        atualizadoEm: FieldValue.serverTimestamp(),
        // Resposta da administração: aparece no sino do morador.
        respondidoEm: FieldValue.serverTimestamp(),
        // Data da solução: marca ao resolver; se sair de "resolvida", limpa.
        resolvidoEm: v.status === "resolvida" ? FieldValue.serverTimestamp() : null,
      });
      const comentarioInterno = !!v.comentario && !v.publico;
      // A mudança de situação SEMPRE aparece para o morador...
      tx.create(ref.collection("updates").doc(), {
        tipo: "status",
        texto: comentarioInterno ? "" : v.comentario,
        deStatus: s.status,
        paraStatus: v.status,
        autorUid: ctx.uid,
        autorNome: ctx.nome,
        autorPapel: papelDoAutor(ctx),
        publico: true,
        criadoEm: FieldValue.serverTimestamp(),
      });
      // ...e o comentário interno vira uma nota separada, que o morador não vê.
      if (comentarioInterno) {
        tx.create(ref.collection("updates").doc(), {
          tipo: "comentario",
          texto: v.comentario,
          deStatus: null,
          paraStatus: null,
          autorUid: ctx.uid,
          autorNome: ctx.nome,
          autorPapel: papelDoAutor(ctx),
          publico: false,
          criadoEm: FieldValue.serverTimestamp(),
        });
      }
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: acao("solicitacao.status"),
        alvo: `tickets/${s.id}`,
        detalhes: { protocolo: s.protocolo, de: s.status, para: v.status, comentario: !!v.comentario, comentarioInterno },
      });
      return { protocolo: s.protocolo, unitId: s.unitId };
    });
    revalidar(v.id);
    avisarNoCelular(ctx.condominioId, { casa: unitId }, {
      titulo: `Solicitação ${protocolo}: ${ROTULO_STATUS_SOLICITACAO[v.status]}`,
      texto: v.publico && v.comentario ? v.comentario : "A administração atualizou a sua solicitação.",
      url: `/solicitacoes/${v.id}`,
    });
    return `Solicitação ${protocolo}: agora está "${ROTULO_STATUS_SOLICITACAO[v.status]}".`;
  });
}

/** A administração responde ao morador (público) ou anota algo só para a equipe (interno). */
export async function responderSolicitacao(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "solicitacoes.gerenciar");
    const v = lerFormulario(esquemaResponderSolicitacao, dados);
    const db = adminDb();
    const { protocolo, unitId } = await db.runTransaction(async (tx) => {
      const { ref, s } = await lerNaTransacao(tx, db, ctx, v.id);
      tx.create(ref.collection("updates").doc(), {
        tipo: "comentario",
        texto: v.texto,
        deStatus: null,
        paraStatus: null,
        autorUid: ctx.uid,
        autorNome: ctx.nome,
        autorPapel: papelDoAutor(ctx),
        publico: v.publico,
        criadoEm: FieldValue.serverTimestamp(),
      });
      // Nota interna não muda a data de "atualizada" que o morador vê.
      // A resposta pública também aparece no sino do morador (respondidoEm).
      if (v.publico) tx.update(ref, { atualizadoEm: FieldValue.serverTimestamp(), respondidoEm: FieldValue.serverTimestamp() });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: acao("solicitacao.comentar"),
        alvo: `tickets/${s.id}`,
        detalhes: { protocolo: s.protocolo, publico: v.publico, origem: "administracao" },
      });
      return { protocolo: s.protocolo, unitId: s.unitId };
    });
    revalidar(v.id);
    if (v.publico) {
      avisarNoCelular(ctx.condominioId, { casa: unitId }, { titulo: `A administração respondeu: ${protocolo}`, texto: v.texto, url: `/solicitacoes/${v.id}` });
    }
    return v.publico ? `Resposta enviada ao morador (${protocolo}).` : `Nota interna salva (${protocolo}).`;
  });
}
