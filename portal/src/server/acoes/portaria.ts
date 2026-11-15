"use server";

/**
 * Ações da portaria, das visitas e das encomendas. Princípios:
 * - toda ação começa conferindo a permissão (garantirPermissao);
 * - o que pode dar conflito (dois porteiros usando o mesmo código ao mesmo tempo,
 *   entregar a mesma encomenda duas vezes) é gravado em TRANSAÇÃO;
 * - a auditoria é gravada junto, na mesma transação;
 * - nada é apagado: autorização cancelada continua no histórico.
 */
import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { ErroDeAcesso, garantirPermissao, getContexto } from "../contexto";
import { registrarAuditoria, type AcaoAuditada } from "../auditoria";
import { consumirTentativa } from "../rate-limit";
import { ErroDeNegocio, executar, lerFormulario, type Resultado } from "./resultado";
import { limparVisitantesAntigos, segredoDoCodigo } from "../dados/portaria";
import { hojeISO } from "@/lib/formato";
import {
  ehUsoUnico,
  erroNoPeriodo,
  formatarCodigo,
  gerarCodigo,
  hashDoCodigo,
  motivoParaRecusarEntrada,
  nomeTipoEncomenda,
  type ResultadoCodigoGerado,
  type ResultadoConsulta,
  type StatusVisita,
  type TipoVisita,
} from "@/lib/portaria";
import {
  esquemaAutorizarVisita,
  esquemaCancelarVisita,
  esquemaCodigo,
  esquemaEncomenda,
  esquemaEntradaSemCodigo,
  esquemaEntregaEncomenda,
  esquemaSaida,
} from "@/lib/validacao-portaria";

// Ações da auditoria das encomendas (estão em ACOES_AUDITADAS).
const ACAO_ENCOMENDA_REGISTRAR = "encomenda.registrar" satisfies AcaoAuditada;
const ACAO_ENCOMENDA_ENTREGAR = "encomenda.entregar" satisfies AcaoAuditada;

const col = (condominioId: string, nome: string) => adminDb().collection("condominiums").doc(condominioId).collection(nome);

function revalidarPortaria() {
  revalidatePath("/portaria");
  revalidatePath("/visitas");
  revalidatePath("/encomendas");
  revalidatePath("/admin/portaria");
}

/** Como o `executar`, mas para ações que devolvem dados (código gerado, consulta). */
async function executarComDados<T extends object>(fn: () => Promise<T>): Promise<({ ok: true; vez: number } & T) | { ok: false; vez: number; erro: string }> {
  const vez = Date.now();
  try {
    return { ok: true, vez, ...(await fn()) };
  } catch (e) {
    if (e instanceof ErroDeNegocio || e instanceof ErroDeAcesso) return { ok: false, vez, erro: e.message };
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    console.error("[portaria] erro inesperado", e);
    return { ok: false, vez, erro: "Não foi possível concluir agora. Tente de novo em instantes." };
  }
}

/** Lê a casa dentro da transação e confere se existe e está ativa. */
async function casaAtiva(tx: FirebaseFirestore.Transaction, condominioId: string, unitId: string): Promise<string> {
  const casa = await tx.get(col(condominioId, "units").doc(unitId));
  if (!casa.exists || casa.get("status") === "inativa") throw new ErroDeNegocio("Casa não encontrada. Escolha de novo na lista.");
  return String(casa.get("rotulo") ?? unitId);
}

// =====================================================================
// MORADOR
// =====================================================================

/** Morador autoriza uma visita. Gera o código, grava só o HMAC e mostra o código uma única vez. */
export async function autorizarVisita(_: ResultadoCodigoGerado, dados: FormData): Promise<ResultadoCodigoGerado> {
  return executarComDados(async () => {
    const ctx = garantirPermissao(await getContexto(), "visitantes.autorizar");
    if (!ctx.unitId) throw new ErroDeNegocio("Seu cadastro não está ligado a uma casa. Fale com a administração.");
    const v = lerFormulario(esquemaAutorizarVisita, dados);
    const hoje = hojeISO(new Date(), ctx.fuso);
    const erro = erroNoPeriodo(v.data, v.validaAte, hoje);
    if (erro) throw new ErroDeNegocio(erro);

    // Limite simples contra abuso: até 30 autorizações por casa a cada hora.
    const db = adminDb();
    const limite = await consumirTentativa(db, "visita.autorizar", `${ctx.condominioId}:${ctx.unitId}`, 30, 3600);
    if (!limite.permitido) throw new ErroDeNegocio("Muitas autorizações em pouco tempo. Aguarde um pouco e tente de novo.");

    const segredo = segredoDoCodigo();
    const visitantes = col(ctx.condominioId, "visitors");
    const ref = visitantes.doc();
    const usoUnico = ehUsoUnico(v.data, v.validaAte);

    // Sorteia o código; se (raríssimo) já existir um ativo igual, sorteia outro.
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const codigo = gerarCodigo();
      const codigoHash = await hashDoCodigo(segredo, ctx.condominioId, codigo);
      const gravou = await db.runTransaction(async (tx) => {
        const iguais = await tx.get(visitantes.where("codigoHash", "==", codigoHash).where("status", "==", "ativa").limit(1));
        if (!iguais.empty) return false;
        tx.create(ref, {
          unitId: ctx.unitId,
          unidadeRotulo: ctx.unidadeRotulo ?? ctx.unitId,
          nome: v.nome,
          tipo: v.tipo,
          data: v.data,
          validaAte: v.validaAte,
          usoUnico,
          usos: 0,
          observacao: v.observacao,
          codigoHash,
          status: "ativa" satisfies StatusVisita,
          anonimizado: false,
          criadoPor: ctx.uid,
          criadoPorNome: ctx.nome,
          criadoEm: FieldValue.serverTimestamp(),
        });
        registrarAuditoria(db, tx, {
          condominioId: ctx.condominioId,
          uid: ctx.uid,
          nome: ctx.nome,
          papel: ctx.papel,
          acao: "visitante.autorizar",
          alvo: `visitors/${ref.id}`,
          detalhes: { unitId: ctx.unitId, tipo: v.tipo, data: v.data, validaAte: v.validaAte, usoUnico },
        });
        return true;
      });
      if (gravou) {
        revalidarPortaria();
        return { codigo, nome: v.nome, data: v.data, validaAte: v.validaAte, usoUnico };
      }
    }
    throw new ErroDeNegocio("Não foi possível gerar o código agora. Tente de novo.");
  });
}

/** Morador cancela uma autorização da própria casa (o registro fica, com status "cancelada"). */
export async function cancelarAutorizacao(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "visitantes.autorizar");
    const { id } = lerFormulario(esquemaCancelarVisita, dados);
    const db = adminDb();
    const ref = col(ctx.condominioId, "visitors").doc(id);
    const nome = await db.runTransaction(async (tx) => {
      const d = await tx.get(ref);
      // Outra casa: responde como "não encontrada" para não revelar que existe.
      if (!d.exists || !ctx.unitId || d.get("unitId") !== ctx.unitId) throw new ErroDeNegocio("Autorização não encontrada. Atualize a página.");
      if (d.get("status") === "cancelada") throw new ErroDeNegocio("Esta autorização já estava cancelada.");
      if (d.get("status") === "usada") throw new ErroDeNegocio("Este código já foi usado; não há o que cancelar.");
      tx.update(ref, { status: "cancelada", canceladoEm: FieldValue.serverTimestamp(), canceladoPor: ctx.uid });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "visitante.cancelar",
        alvo: `visitors/${id}`,
        detalhes: { unitId: ctx.unitId },
      });
      return String(d.get("nome") ?? "");
    });
    revalidarPortaria();
    return `Autorização de ${nome} cancelada. O código não abre mais a portaria.`;
  });
}

// =====================================================================
// PORTARIA — visitantes
// =====================================================================

/** Portaria digita o código e vê de quem é, antes de liberar. Não grava nada. */
export async function consultarCodigo(_: ResultadoConsulta, dados: FormData): Promise<ResultadoConsulta> {
  return executarComDados(async () => {
    const ctx = garantirPermissao(await getContexto(), "portaria.operar");
    const { codigo } = lerFormulario(esquemaCodigo, dados);
    const db = adminDb();
    // Evita "chutar" códigos: até 40 consultas por pessoa a cada 5 minutos.
    const limite = await consumirTentativa(db, "portaria.codigo", `${ctx.condominioId}:${ctx.uid}`, 40, 300);
    if (!limite.permitido) throw new ErroDeNegocio("Muitas consultas seguidas. Aguarde alguns minutos.");

    const hash = await hashDoCodigo(segredoDoCodigo(), ctx.condominioId, codigo);
    const snap = await col(ctx.condominioId, "visitors").where("codigoHash", "==", hash).limit(5).get();
    if (snap.empty) throw new ErroDeNegocio(`Código ${formatarCodigo(codigo)} não encontrado. Confira com o visitante.`);

    const hoje = hojeISO(new Date(), ctx.fuso);
    // Se houver mais de um com o mesmo código (um antigo e um novo), prefere o que vale hoje.
    const docs = snap.docs.map((d) => ({
      d,
      recusa: motivoParaRecusarEntrada({ status: d.get("status"), data: d.get("data"), validaAte: d.get("validaAte") }, hoje),
    }));
    const escolhido = docs.find((x) => x.recusa === null) ?? docs[0];
    const d = escolhido.d;
    return {
      codigo,
      visita: {
        nome: String(d.get("nome") ?? ""),
        tipo: (d.get("tipo") ?? "outro") as TipoVisita,
        unidadeRotulo: String(d.get("unidadeRotulo") ?? d.get("unitId") ?? ""),
        data: String(d.get("data") ?? ""),
        validaAte: String(d.get("validaAte") ?? ""),
        usoUnico: d.get("usoUnico") === true,
        observacao: String(d.get("observacao") ?? ""),
        autorizadoPor: String(d.get("criadoPorNome") ?? ""),
        recusa: escolhido.recusa,
      },
    };
  });
}

/**
 * Registra a entrada com o código. Tudo é conferido de novo DENTRO da transação:
 * se dois porteiros apertarem ao mesmo tempo com um código de uso único, só um consegue.
 */
export async function registrarEntradaComCodigo(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "portaria.operar");
    const { codigo } = lerFormulario(esquemaCodigo, dados);
    const db = adminDb();
    const hash = await hashDoCodigo(segredoDoCodigo(), ctx.condominioId, codigo);
    const hoje = hojeISO(new Date(), ctx.fuso);
    const eventos = col(ctx.condominioId, "accessEvents");
    const eventoRef = eventos.doc();

    const nome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(col(ctx.condominioId, "visitors").where("codigoHash", "==", hash).limit(5));
      if (snap.empty) throw new ErroDeNegocio("Código não encontrado.");
      const validos = snap.docs.filter(
        (d) => motivoParaRecusarEntrada({ status: d.get("status"), data: d.get("data"), validaAte: d.get("validaAte") }, hoje) === null,
      );
      const visita = validos[0];
      if (!visita) {
        const d = snap.docs[0];
        throw new ErroDeNegocio(
          motivoParaRecusarEntrada({ status: d.get("status"), data: d.get("data"), validaAte: d.get("validaAte") }, hoje) ?? "Código não vale hoje.",
        );
      }
      // Período com vários usos: não deixa registrar a mesma pessoa "entrando" duas vezes sem sair.
      const jaDentro = await tx.get(eventos.where("visitorId", "==", visita.id).where("dentro", "==", true).limit(1));
      if (!jaDentro.empty) throw new ErroDeNegocio("Esta pessoa já está registrada como dentro. Registre a saída antes.");

      const usoUnico = visita.get("usoUnico") === true;
      const nomeVisitante = String(visita.get("nome") ?? "");
      tx.create(eventoRef, {
        tipo: "entrada",
        origem: "codigo",
        visitorId: visita.id,
        unitId: visita.get("unitId"),
        unidadeRotulo: visita.get("unidadeRotulo") ?? visita.get("unitId"),
        nome: nomeVisitante,
        tipoVisita: visita.get("tipo") ?? "outro",
        confirmadoComMorador: false,
        data: hoje,
        quando: FieldValue.serverTimestamp(),
        dentro: true,
        saidaEm: null,
        saidaId: null,
        anonimizado: false,
        registradoPor: ctx.uid,
        registradoPorNome: ctx.nome,
      });
      tx.update(visita.ref, {
        usos: FieldValue.increment(1),
        ultimoUsoEm: FieldValue.serverTimestamp(),
        ...(usoUnico ? { status: "usada" satisfies StatusVisita } : {}),
      });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "acesso.entrada",
        alvo: `accessEvents/${eventoRef.id}`,
        detalhes: { visitorId: visita.id, unitId: String(visita.get("unitId") ?? ""), origem: "codigo", usoUnico },
      });
      return nomeVisitante;
    });

    revalidarPortaria();
    return `Entrada de ${nome} registrada.`;
  });
}

/** Visitante sem código: a portaria liga para o morador e confirma antes de liberar. */
export async function registrarEntradaSemCodigo(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "portaria.operar");
    const v = lerFormulario(esquemaEntradaSemCodigo, dados);
    const db = adminDb();
    const hoje = hojeISO(new Date(), ctx.fuso);
    const eventoRef = col(ctx.condominioId, "accessEvents").doc();

    const rotulo = await db.runTransaction(async (tx) => {
      const unidadeRotulo = await casaAtiva(tx, ctx.condominioId, v.unitId);
      tx.create(eventoRef, {
        tipo: "entrada",
        origem: "sem_codigo",
        visitorId: null,
        unitId: v.unitId,
        unidadeRotulo,
        nome: v.nome,
        tipoVisita: v.tipo,
        confirmadoComMorador: true,
        data: hoje,
        quando: FieldValue.serverTimestamp(),
        dentro: true,
        saidaEm: null,
        saidaId: null,
        anonimizado: false,
        registradoPor: ctx.uid,
        registradoPorNome: ctx.nome,
      });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "acesso.entrada",
        alvo: `accessEvents/${eventoRef.id}`,
        detalhes: { unitId: v.unitId, origem: "sem_codigo", tipo: v.tipo, confirmadoComMorador: true },
      });
      return unidadeRotulo;
    });

    revalidarPortaria();
    return `Entrada de ${v.nome} (${rotulo}) registrada.`;
  });
}

/** Saída: cria o evento de saída e tira a pessoa da lista "dentro agora". */
export async function registrarSaida(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "portaria.operar");
    const { id } = lerFormulario(esquemaSaida, dados);
    const db = adminDb();
    const eventos = col(ctx.condominioId, "accessEvents");
    const entradaRef = eventos.doc(id);
    const saidaRef = eventos.doc();
    const hoje = hojeISO(new Date(), ctx.fuso);

    const nome = await db.runTransaction(async (tx) => {
      const entrada = await tx.get(entradaRef);
      if (!entrada.exists || entrada.get("tipo") !== "entrada") throw new ErroDeNegocio("Entrada não encontrada. Atualize a página.");
      if (entrada.get("dentro") !== true) throw new ErroDeNegocio("A saída desta pessoa já foi registrada.");
      tx.create(saidaRef, {
        tipo: "saida",
        entradaId: id,
        visitorId: entrada.get("visitorId") ?? null,
        unitId: entrada.get("unitId"),
        unidadeRotulo: entrada.get("unidadeRotulo") ?? entrada.get("unitId"),
        nome: entrada.get("nome"),
        tipoVisita: entrada.get("tipoVisita") ?? "outro",
        origem: entrada.get("origem") ?? "sem_codigo",
        data: hoje,
        quando: FieldValue.serverTimestamp(),
        anonimizado: entrada.get("anonimizado") === true,
        registradoPor: ctx.uid,
        registradoPorNome: ctx.nome,
      });
      tx.update(entradaRef, { dentro: false, saidaEm: FieldValue.serverTimestamp(), saidaId: saidaRef.id });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "acesso.saida",
        alvo: `accessEvents/${saidaRef.id}`,
        detalhes: { entradaId: id, unitId: String(entrada.get("unitId") ?? "") },
      });
      return String(entrada.get("nome") ?? "");
    });

    revalidarPortaria();
    return `Saída de ${nome} registrada.`;
  });
}

// =====================================================================
// PORTARIA — encomendas
// =====================================================================

export async function registrarEncomenda(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "encomendas.registrar");
    const v = lerFormulario(esquemaEncomenda, dados);
    const db = adminDb();
    const hoje = hojeISO(new Date(), ctx.fuso);
    const ref = col(ctx.condominioId, "packages").doc();

    const rotulo = await db.runTransaction(async (tx) => {
      const unidadeRotulo = await casaAtiva(tx, ctx.condominioId, v.unitId);
      tx.create(ref, {
        unitId: v.unitId,
        unidadeRotulo,
        destinatario: v.destinatario,
        tipo: v.tipo,
        observacao: v.observacao,
        status: "aguardando",
        dataRecebimento: hoje,
        recebidoEm: FieldValue.serverTimestamp(),
        recebidoPor: ctx.uid,
        recebidoPorNome: ctx.nome,
        entregueEm: null,
        entreguePor: null,
        entreguePorNome: null,
        retiradoPor: null,
      });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: ACAO_ENCOMENDA_REGISTRAR,
        alvo: `packages/${ref.id}`,
        detalhes: { unitId: v.unitId, tipo: v.tipo },
      });
      return unidadeRotulo;
    });

    revalidarPortaria();
    return `${nomeTipoEncomenda(v.tipo)} para ${v.destinatario} (${rotulo}) registrada. Aguardando retirada.`;
  });
}

export async function entregarEncomenda(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "encomendas.registrar");
    const v = lerFormulario(esquemaEntregaEncomenda, dados);
    const db = adminDb();
    const ref = col(ctx.condominioId, "packages").doc(v.id);

    const rotulo = await db.runTransaction(async (tx) => {
      const d = await tx.get(ref);
      if (!d.exists) throw new ErroDeNegocio("Encomenda não encontrada. Atualize a página.");
      if (d.get("status") === "entregue") throw new ErroDeNegocio("Esta encomenda já foi entregue.");
      // Qualquer outra situação estranha (campo faltando ou valor desconhecido) também não entrega.
      if (d.get("status") !== "aguardando") throw new ErroDeNegocio("Esta encomenda não está aguardando retirada. Atualize a página.");
      tx.update(ref, {
        status: "entregue",
        entregueEm: FieldValue.serverTimestamp(),
        entreguePor: ctx.uid,
        entreguePorNome: ctx.nome,
        retiradoPor: v.retiradoPor,
      });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: ACAO_ENCOMENDA_ENTREGAR,
        alvo: `packages/${v.id}`,
        detalhes: { unitId: String(d.get("unitId") ?? "") },
      });
      return String(d.get("unidadeRotulo") ?? d.get("unitId") ?? "");
    });

    revalidarPortaria();
    return `Encomenda de ${rotulo} entregue a ${v.retiradoPor}.`;
  });
}

// =====================================================================
// ADMINISTRAÇÃO — LGPD
// =====================================================================

/** Botão "Remover nomes antigos" da administração (a função de verdade fica em dados/portaria.ts). */
export async function limparVisitantesAntigosAgora(): Promise<Resultado> {
  return executar(async () => {
    const ctx = await getContexto();
    if (!ctx) throw new ErroDeAcesso("sem-sessao", "Sua sessão terminou. Entre novamente.");
    const r = await limparVisitantesAntigos(ctx);
    revalidarPortaria();
    const total = r.autorizacoes + r.acessos;
    if (total === 0) return "Nenhum nome com mais de 90 dias para remover.";
    return `Nomes removidos de ${r.autorizacoes} autorizações e ${r.acessos} registros de entrada/saída.${r.restam ? " Ainda há mais: clique de novo." : ""}`;
  });
}

