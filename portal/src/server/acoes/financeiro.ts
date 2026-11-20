"use server";

/**
 * Ações do financeiro. Princípios:
 * - nada é apagado: correções são feitas por ESTORNO (lançamento inverso ligado ao original);
 * - mês publicado fica fechado: não recebe lançamentos novos;
 * - lançamento, total do mês e auditoria são gravados na MESMA transação.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, getContexto } from "../contexto";
import { registrarAuditoria } from "../auditoria";
import { ErroDeNegocio, executar, lerFormulario, type Resultado } from "./resultado";
import { CATEGORIAS_PADRAO, CHAVES_FORMA, nomeDoMes, REGEX_MES } from "@/lib/financeiro";
import { esquemaAlternarCategoria, esquemaNovaCategoria, esquemaQuadroCasas, idDaCategoria, quadroDoFormulario } from "@/lib/validacao-financeiro";
import { formatarMoeda, hojeISO, reaisParaCentavos } from "@/lib/formato";
import { idDocumento } from "@/lib/validacao";

const LIMITE_CENTAVOS = 100_000_000_00; // R$ 100 milhões: protege contra digitação errada

const esquemaLancamento = z.object({
  tipo: z.enum(["receita", "despesa"], { error: "Escolha se é entrada ou saída de dinheiro." }),
  categoriaId: idDocumento.refine(Boolean, "Escolha a categoria."),
  valor: z.string().trim().min(1, "Informe o valor."),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data."),
  forma: z.enum(CHAVES_FORMA, { error: "Escolha a forma de pagamento." }),
  descricao: z.string().trim().min(3, "Descreva o lançamento (ex.: Conta de luz de outubro).").max(200, "Descrição muito longa."),
});

function revalidarFinanceiro() {
  revalidatePath("/admin/financeiro");
  revalidatePath("/financeiro");
}

export async function lancar(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "financeiro.lancar");
    const v = lerFormulario(esquemaLancamento, dados);

    const valor = reaisParaCentavos(v.valor);
    if (valor === null || valor <= 0) throw new ErroDeNegocio("Valor inválido. Use o formato 1.234,56 e um valor maior que zero.");
    if (valor > LIMITE_CENTAVOS) throw new ErroDeNegocio("Valor alto demais. Confira se digitou certo.");

    const hoje = hojeISO(new Date(), ctx.fuso);
    if (v.data > hoje) throw new ErroDeNegocio("A data não pode ser no futuro.");
    const mes = v.data.slice(0, 7);

    const db = adminDb();
    const c = db.collection("condominiums").doc(ctx.condominioId);
    const resumoRef = c.collection("monthlySummaries").doc(mes);
    const categoriaRef = c.collection("financialCategories").doc(v.categoriaId);
    const novoRef = c.collection("financialEntries").doc();

    await db.runTransaction(async (tx) => {
      const [resumo, categoria, condominio] = await tx.getAll(resumoRef, categoriaRef, c);
      // Um mês posterior já publicado: lançar antes dele mudaria saldos que os moradores já viram.
      const publicados = await tx.get(c.collection("monthlySummaries").where("publicado", "==", true));
      const posteriorPublicado = publicados.docs.find((d) => d.id > mes);
      if (posteriorPublicado) {
        throw new ErroDeNegocio(
          `${nomeDoMes(posteriorPublicado.id)} já foi publicado, então meses anteriores estão fechados. Lance o ajuste no mês atual.`,
        );
      }
      if (!categoria.exists || categoria.get("ativa") === false) throw new ErroDeNegocio("Categoria não encontrada. Atualize a página.");
      if (categoria.get("tipo") !== v.tipo) throw new ErroDeNegocio("Essa categoria não combina com o tipo escolhido (entrada/saída).");
      const mesInicial = condominio.get("financeiro.mesInicial") as string | undefined;
      if (mesInicial && mes < mesInicial) {
        throw new ErroDeNegocio(`A prestação de contas começa em ${nomeDoMes(mesInicial)}. Use uma data a partir daí.`);
      }
      if (resumo.get("publicado") === true) {
        throw new ErroDeNegocio(`A prestação de ${nomeDoMes(mes)} já foi publicada e está fechada. Faça o ajuste com um lançamento no mês atual.`);
      }

      tx.create(novoRef, {
        tipo: v.tipo,
        categoriaId: v.categoriaId,
        categoriaNome: String(categoria.get("nome")),
        valorCentavos: valor,
        data: v.data,
        mes,
        forma: v.forma,
        descricao: v.descricao,
        publicado: false,
        estornaId: null,
        estornadoPor: null,
        criadoPor: ctx.uid,
        criadoPorNome: ctx.nome,
        criadoEm: FieldValue.serverTimestamp(),
      });
      tx.set(
        resumoRef,
        {
          [v.tipo === "receita" ? "receitasCentavos" : "despesasCentavos"]: FieldValue.increment(valor),
          quantidade: FieldValue.increment(1),
          publicado: false,
          atualizadoEm: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "financeiro.lancar",
        alvo: `financialEntries/${novoRef.id}`,
        detalhes: { tipo: v.tipo, valorCentavos: valor, data: v.data, categoria: v.categoriaId },
      });
    });

    revalidarFinanceiro();
    return `${v.tipo === "receita" ? "Receita" : "Despesa"} de ${formatarMoeda(valor)} lançada.`;
  });
}

const esquemaEstorno = z.object({
  id: idDocumento,
  motivo: z.string().trim().min(3, "Explique o motivo do estorno.").max(200, "Motivo muito longo."),
});

/** Estorno: cria um lançamento com valor negativo, ligado ao original, no mês atual. */
export async function estornar(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "financeiro.lancar");
    const v = lerFormulario(esquemaEstorno, dados);
    const db = adminDb();
    const c = db.collection("condominiums").doc(ctx.condominioId);
    const originalRef = c.collection("financialEntries").doc(v.id);
    const hoje = hojeISO(new Date(), ctx.fuso);
    const mes = hoje.slice(0, 7);
    const resumoRef = c.collection("monthlySummaries").doc(mes);
    const estornoRef = c.collection("financialEntries").doc();

    let valorOriginal = 0;
    await db.runTransaction(async (tx) => {
      const [original, resumo] = await tx.getAll(originalRef, resumoRef);
      if (!original.exists) throw new ErroDeNegocio("Lançamento não encontrado. Atualize a página.");
      if (original.get("estornaId")) throw new ErroDeNegocio("Um estorno não pode ser estornado. Faça um novo lançamento, se precisar.");
      if (original.get("estornadoPor")) throw new ErroDeNegocio("Este lançamento já foi estornado.");
      if (resumo.get("publicado") === true) {
        throw new ErroDeNegocio(`A prestação de ${nomeDoMes(mes)} já foi publicada. Não é possível estornar agora.`);
      }
      const tipo = original.get("tipo") as "receita" | "despesa";
      valorOriginal = Number(original.get("valorCentavos"));

      tx.create(estornoRef, {
        tipo,
        categoriaId: original.get("categoriaId"),
        categoriaNome: original.get("categoriaNome"),
        valorCentavos: -valorOriginal,
        data: hoje,
        mes,
        forma: original.get("forma"),
        descricao: `Estorno: ${original.get("descricao")} — ${v.motivo}`,
        publicado: false,
        estornaId: original.id,
        estornadoPor: null,
        criadoPor: ctx.uid,
        criadoPorNome: ctx.nome,
        criadoEm: FieldValue.serverTimestamp(),
      });
      tx.update(originalRef, { estornadoPor: estornoRef.id, estornadoEm: FieldValue.serverTimestamp() });
      tx.set(
        resumoRef,
        {
          [tipo === "receita" ? "receitasCentavos" : "despesasCentavos"]: FieldValue.increment(-valorOriginal),
          quantidade: FieldValue.increment(1),
          publicado: false,
          atualizadoEm: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "financeiro.estornar",
        alvo: `financialEntries/${original.id}`,
        detalhes: { estorno: estornoRef.id, valorCentavos: valorOriginal, motivo: v.motivo },
      });
    });

    revalidarFinanceiro();
    return `Estorno de ${formatarMoeda(valorOriginal)} registrado em ${nomeDoMes(mes)}.`;
  });
}

/** Publica (e fecha) a prestação de um mês. Os meses anteriores precisam estar publicados. */
export async function publicarMes(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "financeiro.publicar");
    const { mes } = lerFormulario(z.object({ mes: z.string().regex(REGEX_MES, "Mês inválido.") }), dados);
    const hoje = hojeISO(new Date(), ctx.fuso).slice(0, 7);
    if (mes >= hoje) throw new ErroDeNegocio("Só é possível publicar meses que já terminaram.");

    const db = adminDb();
    const c = db.collection("condominiums").doc(ctx.condominioId);
    const resumoRef = c.collection("monthlySummaries").doc(mes);

    const total = await db.runTransaction(async (tx) => {
      const resumo = await tx.get(resumoRef);
      if (resumo.get("publicado") === true) throw new ErroDeNegocio("Este mês já está publicado.");
      const pendentes = await tx.get(c.collection("monthlySummaries").where("publicado", "==", false));
      const anterior = pendentes.docs.find((d) => d.id < mes);
      if (anterior) throw new ErroDeNegocio(`Publique antes ${nomeDoMes(anterior.id)}. Os meses são publicados em ordem.`);
      const lancamentos = await tx.get(c.collection("financialEntries").where("mes", "==", mes));
      if (lancamentos.size > 450) throw new ErroDeNegocio("Mês com lançamentos demais para publicar de uma vez. Fale com o suporte.");

      lancamentos.docs.forEach((d) => tx.update(d.ref, { publicado: true }));
      tx.set(
        resumoRef,
        { publicado: true, publicadoEm: FieldValue.serverTimestamp(), publicadoPor: ctx.uid, quantidade: lancamentos.size },
        { merge: true },
      );
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "financeiro.publicar",
        alvo: `monthlySummaries/${mes}`,
        detalhes: { lancamentos: lancamentos.size },
      });
      return lancamentos.size;
    });

    revalidarFinanceiro();
    return `Prestação de ${nomeDoMes(mes)} publicada com ${total} lançamentos. Os moradores já podem ver.`;
  });
}

const esquemaConfig = z.object({
  saldoInicial: z.string().trim().min(1, "Informe o saldo inicial (pode ser 0)."),
  mesInicial: z.string().regex(REGEX_MES, "Escolha o mês em que a prestação começa."),
});

/** Saldo de partida (o que havia em caixa quando o portal começou a ser usado). */
export async function configurarSaldoInicial(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "financeiro.publicar");
    const v = lerFormulario(esquemaConfig, dados);
    const saldo = reaisParaCentavos(v.saldoInicial);
    if (saldo === null || Math.abs(saldo) > LIMITE_CENTAVOS) throw new ErroDeNegocio("Saldo inválido. Use o formato 1.234,56.");

    const db = adminDb();
    const c = db.collection("condominiums").doc(ctx.condominioId);
    await db.runTransaction(async (tx) => {
      const publicados = await tx.get(c.collection("monthlySummaries").where("publicado", "==", true).limit(1));
      if (!publicados.empty) throw new ErroDeNegocio("Já existe mês publicado; o saldo inicial não pode mais mudar.");
      const anteriores = await tx.get(c.collection("financialEntries").where("mes", "<", v.mesInicial).limit(1));
      if (!anteriores.empty) throw new ErroDeNegocio("Há lançamentos antes desse mês. Escolha um mês igual ou anterior ao primeiro lançamento.");
      tx.set(c, { financeiro: { saldoInicialCentavos: saldo, mesInicial: v.mesInicial } }, { merge: true });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "financeiro.configurar",
        detalhes: { saldoInicialCentavos: saldo, mesInicial: v.mesInicial },
      });
    });
    revalidarFinanceiro();
    return `Saldo inicial de ${formatarMoeda(saldo)} definido a partir de ${nomeDoMes(v.mesInicial)}.`;
  });
}

/** Cria as categorias iniciais pedidas pelo condomínio (não altera as que já existem). */
export async function criarCategoriasPadrao(): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "financeiro.lancar");
    const db = adminDb();
    const col = db.collection("condominiums").doc(ctx.condominioId).collection("financialCategories");
    const criadas = await db.runTransaction(async (tx) => {
      const existentes = await tx.getAll(...CATEGORIAS_PADRAO.map((cat) => col.doc(cat.id)));
      let n = 0;
      existentes.forEach((d, i) => {
        if (d.exists) return;
        const cat = CATEGORIAS_PADRAO[i];
        tx.create(d.ref, { nome: cat.nome, tipo: cat.tipo, ordem: cat.ordem, ativa: true });
        n++;
      });
      if (n) {
        registrarAuditoria(db, tx, {
          condominioId: ctx.condominioId,
          uid: ctx.uid,
          nome: ctx.nome,
          papel: ctx.papel,
          acao: "financeiro.categoria",
          detalhes: { criadas: n },
        });
      }
      return n;
    });
    revalidarFinanceiro();
    return criadas ? `${criadas} categorias criadas.` : "As categorias já existiam.";
  });
}

/**
 * Quadro de casas do mês (total, pagas, isentas, inadimplentes…), como no relatório em papel.
 * Só números: nenhuma casa é identificada. Não mexe em dinheiro nem em saldo, por isso pode ser
 * corrigido mesmo depois de publicado (fica na auditoria).
 */
export async function salvarQuadroCasas(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "financeiro.lancar");
    const v = lerFormulario(esquemaQuadroCasas, dados);
    const mesAtual = hojeISO(new Date(), ctx.fuso).slice(0, 7);
    if (v.mes > mesAtual) throw new ErroDeNegocio("Escolha um mês que já começou.");
    const quadro = quadroDoFormulario(v);

    const db = adminDb();
    const c = db.collection("condominiums").doc(ctx.condominioId);
    const resumoRef = c.collection("monthlySummaries").doc(v.mes);
    await db.runTransaction(async (tx) => {
      const [resumo, condominio] = await tx.getAll(resumoRef, c);
      const mesInicial = condominio.get("financeiro.mesInicial") as string | undefined;
      if (mesInicial && v.mes < mesInicial) {
        throw new ErroDeNegocio(`A prestação de contas começa em ${nomeDoMes(mesInicial)}.`);
      }
      // Só em mês que já tem lançamentos: um mês "vazio" criado aqui ficaria sem publicar e
      // travaria a publicação dos meses seguintes (eles são publicados em ordem).
      if (!resumo.exists || Number(resumo.get("quantidade") ?? 0) === 0) {
        throw new ErroDeNegocio(`Faça os lançamentos de ${nomeDoMes(v.mes)} antes de preencher o quadro de casas.`);
      }
      tx.set(resumoRef, { casas: { ...quadro, atualizadoEm: FieldValue.serverTimestamp(), atualizadoPor: ctx.uid } }, { merge: true });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "financeiro.quadro",
        alvo: `monthlySummaries/${v.mes}`,
        detalhes: {
          mes: v.mes,
          total: quadro.total,
          pagas: quadro.pagas,
          pagasSemExtra: quadro.pagasSemExtra,
          acordos: quadro.acordos,
          isentas: quadro.isentas,
          inadimplentes: quadro.inadimplentes,
          boletosVencidos: quadro.boletosVencidos,
          publicado: resumo.get("publicado") === true,
        },
      });
    });
    revalidarFinanceiro();
    return `Quadro de casas de ${nomeDoMes(v.mes)} salvo.`;
  });
}

/** Cria uma categoria nova (ex.: "Fundo de obras"). O nome vira o identificador. */
export async function criarCategoria(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "financeiro.lancar");
    const v = lerFormulario(esquemaNovaCategoria, dados);
    const id = idDaCategoria(v.nome);
    if (id.length < 2) throw new ErroDeNegocio("Use letras no nome da categoria.");

    const db = adminDb();
    const col = db.collection("condominiums").doc(ctx.condominioId).collection("financialCategories");
    await db.runTransaction(async (tx) => {
      const todas = await tx.get(col);
      const mesmoNome = todas.docs.find((d) => d.id === id || idDaCategoria(String(d.get("nome") ?? "")) === id);
      if (mesmoNome) {
        throw new ErroDeNegocio(
          mesmoNome.get("ativa") === false
            ? `Já existe a categoria "${mesmoNome.get("nome")}", escondida. Use "Mostrar" na lista.`
            : `Já existe a categoria "${mesmoNome.get("nome")}".`,
        );
      }
      // Entra no fim do seu tipo (as receitas vêm antes das despesas nas listas).
      const doTipo = todas.docs.filter((d) => d.get("tipo") === v.tipo).map((d) => Number(d.get("ordem") ?? 0));
      const ordem = Math.max(v.tipo === "receita" ? 3 : 20, ...doTipo) + 1;
      tx.create(col.doc(id), { nome: v.nome, tipo: v.tipo, ordem, ativa: true });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "financeiro.categoria",
        alvo: `financialCategories/${id}`,
        detalhes: { criada: v.nome, tipo: v.tipo },
      });
    });
    revalidarFinanceiro();
    return `Categoria "${v.nome}" criada.`;
  });
}

/**
 * Esconde ou mostra uma categoria na tela de lançar. Nada é apagado: os lançamentos antigos
 * continuam com a categoria (e aparecem normalmente nos relatórios).
 */
export async function alternarCategoria(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "financeiro.lancar");
    const v = lerFormulario(esquemaAlternarCategoria, dados);
    const ativa = v.ativa === "sim";

    const db = adminDb();
    const ref = db.collection("condominiums").doc(ctx.condominioId).collection("financialCategories").doc(v.id);
    const nome = await db.runTransaction(async (tx) => {
      const cat = await tx.get(ref);
      if (!cat.exists) throw new ErroDeNegocio("Categoria não encontrada. Atualize a página.");
      if (!ativa) {
        const outras = await tx.get(ref.parent.where("tipo", "==", cat.get("tipo")));
        const ativasDoTipo = outras.docs.filter((d) => d.id !== v.id && d.get("ativa") !== false);
        if (ativasDoTipo.length === 0) throw new ErroDeNegocio("Deixe pelo menos uma categoria deste tipo aparecendo.");
      }
      tx.update(ref, { ativa });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: "financeiro.categoria",
        alvo: `financialCategories/${v.id}`,
        detalhes: { categoria: String(cat.get("nome") ?? v.id), ativa },
      });
      return String(cat.get("nome") ?? v.id);
    });
    revalidarFinanceiro();
    return ativa ? `"${nome}" voltou a aparecer na tela de lançar.` : `"${nome}" não aparece mais na tela de lançar.`;
  });
}
