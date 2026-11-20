/**
 * Lança a prestação de contas de UM MÊS a partir de um arquivo JSON (o relatório mensal
 * passado a limpo), do mesmo jeito que a tela "Lançar no caixa": cada lançamento + total do
 * mês + auditoria na mesma transação. Nada é apagado; o mês fica NÃO PUBLICADO (a
 * administração confere na tela e publica). Com --publicar, publica também.
 *
 * Antes de gravar, confere as contas: subtotais e saldo final precisam bater com o relatório
 * (saldo inicial + receitas − despesas = "saldoEsperado"). Se o mês já tiver lançamentos, recusa
 * (evita lançar duas vezes).
 *
 * Os arquivos ficam em scripts/dados-financeiro/ (fora do git: o repositório é público).
 *
 * Uso (na pasta portal):
 *   Simulador:  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/lancar-prestacao.ts --arquivo scripts/dados-financeiro/2026-10.json --id jardins-do-lago-demo
 *   Real:       npx tsx scripts/lancar-prestacao.ts --arquivo scripts/dados-financeiro/2026-10.json --conferir
 *               npx tsx scripts/lancar-prestacao.ts --arquivo scripts/dados-financeiro/2026-10.json
 *   Publicar um mês JÁ lançado (o mesmo que o botão "Publicar" da tela; antes confere se os
 *   totais gravados batem com o arquivo):
 *               npx tsx scripts/lancar-prestacao.ts --arquivo scripts/dados-financeiro/2026-10.json --so-publicar
 *   Lançar um mês ANTERIOR ao primeiro mês do portal (ex.: setembro, com outubro já publicado). O mês entra
 *   PUBLICADO (os meses são publicados em ordem), o saldo inicial passa a ser o do arquivo e o saldo final
 *   dele precisa ser exatamente o saldo inicial que o portal já usava — assim os meses seguintes não mudam:
 *               npx tsx scripts/lancar-prestacao.ts --arquivo scripts/dados-financeiro/2026-09.json --antes-do-inicio --conferir
 *   Acertar a ordem das linhas de um mês lançado pelo script antigo (a ordem do arquivo vira a ordem do relatório):
 *               npx tsx scripts/lancar-prestacao.ts --arquivo scripts/dados-financeiro/2026-10.json --reordenar
 *   Conferir se o portal está igual ao arquivo (só lê; mostra cada diferença):
 *               npx tsx scripts/lancar-prestacao.ts --arquivo scripts/dados-financeiro/2026-10.json --comparar
 *   Gravar/corrigir só o quadro de casas do mês ("casas" no arquivo):
 *               npx tsx scripts/lancar-prestacao.ts --arquivo scripts/dados-financeiro/2026-10.json --quadro
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { CAMPOS_QUADRO, CATEGORIAS_PADRAO, CHAVES_FORMA, lerQuadroCasas, mesSeguinte, REGEX_MES, type CampoQuadro, type FormaPagamento, type TipoLancamento } from "../src/lib/financeiro";
import { formatarMoeda, reaisParaCentavos } from "../src/lib/formato";

const { values } = parseArgs({
  options: {
    arquivo: { type: "string" },
    id: { type: "string" },
    conferir: { type: "boolean" },
    publicar: { type: "boolean" },
    "so-publicar": { type: "boolean" },
    quadro: { type: "boolean" },
    "antes-do-inicio": { type: "boolean" },
    reordenar: { type: "boolean" },
    comparar: { type: "boolean" },
  },
});
const ID = values.id ?? "jardins-do-lago";
const SO_CONFERIR = values.conferir === true;
const PUBLICAR = values.publicar === true;
const SO_PUBLICAR = values["so-publicar"] === true;
const SO_QUADRO = values.quadro === true;
const ANTES_DO_INICIO = values["antes-do-inicio"] === true;
const REORDENAR = values.reordenar === true;
const COMPARAR = values.comparar === true;
const SIMULADOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const QUEM = { uid: "script:lancar-prestacao", nome: "Prestação de contas lançada do relatório mensal (a pedido da administração)", papel: "admin" };

function falhar(mensagem: string): never {
  console.error(`\n✖ ${mensagem}\n`);
  process.exit(1);
}

type Linha = { tipo: TipoLancamento; categoria: string; data: string; forma: FormaPagamento; valor: string; descricao: string };
type Arquivo = {
  fonte: string;
  mes: string;
  saldoInicial?: { valor: string; explicacao?: string };
  saldoEsperado: string;
  lancamentos: Linha[];
  conferencia?: Record<string, string>;
  /** Quadro de casas do relatório (só totais). */
  casas?: Partial<Record<CampoQuadro, number | null>> & { observacao?: string };
};

function centavos(texto: string, onde: string): number {
  const v = reaisParaCentavos(texto);
  if (v === null) falhar(`Valor inválido em ${onde}: "${texto}"`);
  return v;
}

// ---- Lê e confere o arquivo (antes de tocar no banco) ----
if (!values.arquivo) falhar("Informe o arquivo: --arquivo scripts/dados-financeiro/2026-10.json");
const dados = JSON.parse(readFileSync(path.resolve(values.arquivo), "utf8")) as Arquivo;
if (!REGEX_MES.test(dados.mes)) falhar(`Mês inválido: ${dados.mes}`);
const categoriasConhecidas = new Map(CATEGORIAS_PADRAO.map((c) => [c.id, c]));
const linhas = dados.lancamentos.map((l, i) => {
  const onde = `lançamento ${i + 1} ("${l.descricao}")`;
  const cat = categoriasConhecidas.get(l.categoria) ?? falhar(`Categoria desconhecida em ${onde}: ${l.categoria}`);
  if (cat.tipo !== l.tipo) falhar(`A categoria "${cat.nome}" não é de ${l.tipo} (${onde}).`);
  if (!l.data.startsWith(dados.mes) || !/^\d{4}-\d{2}-\d{2}$/.test(l.data)) falhar(`Data fora do mês em ${onde}: ${l.data}`);
  if (!(CHAVES_FORMA as readonly string[]).includes(l.forma)) falhar(`Forma de pagamento inválida em ${onde}: ${l.forma}`);
  const descricao = l.descricao.trim();
  if (descricao.length < 3 || descricao.length > 200) falhar(`Descrição com tamanho inválido em ${onde}.`);
  const valor = centavos(l.valor, onde);
  if (valor <= 0) falhar(`Valor precisa ser maior que zero em ${onde}.`);
  return { ...l, descricao, valorCentavos: valor, categoriaNome: cat.nome };
});
const soma = (filtro: (l: (typeof linhas)[number]) => boolean) => linhas.filter(filtro).reduce((s, l) => s + l.valorCentavos, 0);
const receitas = soma((l) => l.tipo === "receita");
const despesas = soma((l) => l.tipo === "despesa");
const saldoInicial = dados.saldoInicial ? centavos(dados.saldoInicial.valor, "saldoInicial") : null;
const esperado = centavos(dados.saldoEsperado, "saldoEsperado");

const conf = dados.conferencia ?? {};
const checar = (rotulo: string, calculado: number, texto?: string) => {
  if (texto === undefined) return;
  const doRelatorio = centavos(texto, rotulo);
  if (doRelatorio !== calculado) falhar(`${rotulo} não bate: relatório ${formatarMoeda(doRelatorio)}, somado ${formatarMoeda(calculado)}.`);
};
checar("Subtotal das despesas ordinárias", soma((l) => l.categoria === "despesas-ordinarias"), conf.subtotalOrdinarias);
checar("Subtotal das despesas extraordinárias", soma((l) => l.categoria === "despesas-extraordinarias"), conf.subtotalExtraordinarias);
checar("Total das despesas", despesas, conf.totalDespesas);
checar("Total das receitas", receitas, conf.totalReceitas);

// ---- Conecta (simulador ou Firebase real) ----
let projectId: string;
if (SIMULADOR) {
  projectId = "demo-jardins";
  initializeApp({ projectId });
} else {
  const ARQUIVO_ENV = path.resolve(import.meta.dirname, "..", ".env.production.local");
  if (existsSync(ARQUIVO_ENV)) process.loadEnvFile?.(ARQUIVO_ENV);
  projectId = process.env.FIREBASE_PROJECT_ID ?? "";
  if (!projectId || projectId.startsWith("demo-")) falhar("Configure o Firebase real (.env.production.local).");
  initializeApp({
    projectId,
    credential: cert({
      projectId,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore();

async function main() {
  const c = db.collection("condominiums").doc(ID);
  const mes = dados.mes;

  const resultado = await db.runTransaction(async (tx) => {
    const condominio = await tx.get(c);
    if (!condominio.exists) falhar(`O condomínio "${ID}" não existe no projeto ${projectId}.`);
    if (!SIMULADOR && condominio.get("demo") === true) falhar(`"${ID}" é uma demonstração; este uso é para o condomínio real.`);

    const [resumo, publicados, doMes] = await Promise.all([
      tx.get(c.collection("monthlySummaries").doc(mes)),
      tx.get(c.collection("monthlySummaries").where("publicado", "==", true)),
      tx.get(c.collection("financialEntries").where("mes", "==", mes)),
    ]);
    if (resumo.get("publicado") === true) falhar(`A prestação de ${mes} já foi publicada.`);
    const posterior = publicados.docs.find((d) => d.id > mes);
    if (posterior) falhar(`${posterior.id} já foi publicado; ${mes} está fechado.`);
    if (!doMes.empty) falhar(`${mes} já tem ${doMes.size} lançamento(s). Para não lançar duas vezes, nada foi gravado.`);

    // Saldo inicial: grava se ainda não existe; se existe, precisa ser o mesmo.
    const atualSaldo = condominio.get("financeiro.saldoInicialCentavos") as number | undefined;
    const atualMes = condominio.get("financeiro.mesInicial") as string | undefined;
    let gravarSaldo = false;
    if (saldoInicial !== null) {
      if (atualMes === undefined) {
        if (!publicados.empty) falhar("Já existe mês publicado; o saldo inicial não pode mais mudar.");
        const anteriores = await tx.get(c.collection("financialEntries").where("mes", "<", mes).limit(1));
        if (!anteriores.empty) falhar(`Há lançamentos antes de ${mes}: o saldo inicial não pode começar em ${mes}.`);
        gravarSaldo = true;
      } else if (atualMes !== mes || atualSaldo !== saldoInicial) {
        falhar(`O saldo inicial já está configurado (${formatarMoeda(atualSaldo ?? 0)} a partir de ${atualMes}); o arquivo diz ${formatarMoeda(saldoInicial)} em ${mes}.`);
      }
    }
    const saldoAnterior = saldoInicial ?? atualSaldo ?? 0;
    const saldoFinal = saldoAnterior + receitas - despesas;
    // Só confere com o relatório quando este é o primeiro mês (sem meses anteriores no portal).
    const primeiroMes = (atualMes ?? mes) === mes;
    if (primeiroMes && saldoFinal !== esperado) {
      falhar(`Saldo final não bate: calculado ${formatarMoeda(saldoFinal)}, relatório ${formatarMoeda(esperado)}.`);
    }

    // Categorias usadas: cria as que faltam (mesmos nomes da tela).
    const usadas = [...new Set(linhas.map((l) => l.categoria))].map((id) => categoriasConhecidas.get(id)!);
    const docsCat = await tx.getAll(...usadas.map((cat) => c.collection("financialCategories").doc(cat.id)));
    const criar = usadas.filter((_, i) => !docsCat[i].exists);
    const inativas = usadas.filter((_, i) => docsCat[i].exists && docsCat[i].get("ativa") === false);
    if (inativas.length) falhar(`Categoria desativada: ${inativas.map((x) => x.nome).join(", ")}.`);

    console.log(`\nProjeto ${projectId}${SIMULADOR ? " (SIMULADOR)" : ""} · condomínio ${ID} · mês ${mes}`);
    console.log(`Fonte: ${dados.fonte}`);
    console.log(`Saldo inicial: ${formatarMoeda(saldoAnterior)}${gravarSaldo ? " (será configurado agora)" : " (já configurado)"}`);
    console.log(`Receitas: ${formatarMoeda(receitas)} · Despesas: ${formatarMoeda(despesas)} · Saldo final: ${formatarMoeda(saldoFinal)}`);
    console.log(`Lançamentos: ${linhas.length} · categorias a criar: ${criar.map((x) => x.nome).join(", ") || "nenhuma"}`);
    console.log(PUBLICAR ? "Depois de lançar: PUBLICA o mês para os moradores." : "O mês fica NÃO PUBLICADO (a administração confere e publica na tela).");
    if (SO_CONFERIR) return { gravou: false };

    const audit = (acao: string, alvo: string | null, detalhes: Record<string, string | number | boolean | null>) =>
      tx.create(c.collection("auditLogs").doc(), {
        condominioId: ID,
        uid: QUEM.uid,
        nome: QUEM.nome,
        papel: QUEM.papel,
        acao,
        alvo,
        detalhes,
        criadoEm: FieldValue.serverTimestamp(),
      });

    for (const cat of criar) {
      tx.create(c.collection("financialCategories").doc(cat.id), { nome: cat.nome, tipo: cat.tipo, ordem: cat.ordem, ativa: true });
    }
    if (criar.length) audit("financeiro.categoria", null, { criadas: criar.length });
    if (gravarSaldo) {
      tx.set(c, { financeiro: { saldoInicialCentavos: saldoInicial, mesInicial: mes } }, { merge: true });
      audit("financeiro.configurar", null, { saldoInicialCentavos: saldoInicial, mesInicial: mes });
    }
    // Mesma data → a ordem vem da hora do lançamento. Um segundo de diferença entre eles, na ordem
    // do arquivo, faz o relatório do portal (Nº 1, 2, 3…) sair na mesma ordem do relatório em papel.
    const agora = Date.now() - linhas.length * 1000;
    for (const [i, l] of linhas.entries()) {
      const ref = c.collection("financialEntries").doc();
      tx.create(ref, {
        tipo: l.tipo,
        categoriaId: l.categoria,
        categoriaNome: l.categoriaNome,
        valorCentavos: l.valorCentavos,
        data: l.data,
        mes,
        forma: l.forma,
        descricao: l.descricao,
        publicado: PUBLICAR,
        estornaId: null,
        estornadoPor: null,
        criadoPor: QUEM.uid,
        criadoPorNome: QUEM.nome,
        criadoEm: Timestamp.fromMillis(agora + i * 1000),
      });
      audit("financeiro.lancar", `financialEntries/${ref.id}`, { tipo: l.tipo, valorCentavos: l.valorCentavos, data: l.data, categoria: l.categoria });
    }
    tx.set(
      c.collection("monthlySummaries").doc(mes),
      {
        receitasCentavos: FieldValue.increment(receitas),
        despesasCentavos: FieldValue.increment(despesas),
        quantidade: FieldValue.increment(linhas.length),
        publicado: PUBLICAR,
        atualizadoEm: FieldValue.serverTimestamp(),
        ...(PUBLICAR ? { publicadoEm: FieldValue.serverTimestamp(), publicadoPor: QUEM.uid } : {}),
      },
      { merge: true },
    );
    if (PUBLICAR) audit("financeiro.publicar", `monthlySummaries/${mes}`, { mes, lancamentos: linhas.length });
    // Avisa as telas abertas que o financeiro mudou (mesmo documento que o portal usa).
    tx.set(c.collection("sistema").doc("sinais"), { financeiro: FieldValue.serverTimestamp() }, { merge: true });
    return { gravou: true };
  });

  console.log(resultado.gravou ? `\n✔ ${linhas.length} lançamentos gravados em ${mes}.\n` : "\n(Só conferência: nada foi gravado.)\n");
}

/** Publica (e fecha) um mês já lançado — mesmas regras de publicarMes (src/server/acoes/financeiro.ts). */
async function soPublicar() {
  const c = db.collection("condominiums").doc(ID);
  const mes = dados.mes;
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Belem", year: "numeric", month: "2-digit" }).format(new Date());
  if (mes >= hoje.slice(0, 7)) falhar("Só é possível publicar meses que já terminaram.");

  const total = await db.runTransaction(async (tx) => {
    const resumoRef = c.collection("monthlySummaries").doc(mes);
    const [resumo, pendentes, lancamentos] = await Promise.all([
      tx.get(resumoRef),
      tx.get(c.collection("monthlySummaries").where("publicado", "==", false)),
      tx.get(c.collection("financialEntries").where("mes", "==", mes)),
    ]);
    if (!resumo.exists) falhar(`${mes} não tem lançamentos.`);
    if (resumo.get("publicado") === true) falhar(`${mes} já está publicado.`);
    const anterior = pendentes.docs.find((d) => d.id < mes);
    if (anterior) falhar(`Publique antes ${anterior.id}. Os meses são publicados em ordem.`);
    if (lancamentos.size > 450) falhar("Mês com lançamentos demais para publicar de uma vez.");

    // Confere o que está gravado contra o relatório antes de mostrar aos moradores.
    const gravado = (tipo: TipoLancamento) =>
      lancamentos.docs.filter((d) => d.get("tipo") === tipo).reduce((s, d) => s + Number(d.get("valorCentavos")), 0);
    if (gravado("receita") !== receitas || gravado("despesa") !== despesas) {
      falhar(`Os totais gravados (receitas ${formatarMoeda(gravado("receita"))}, despesas ${formatarMoeda(gravado("despesa"))}) não batem com o arquivo.`);
    }
    if (Number(resumo.get("receitasCentavos")) !== receitas || Number(resumo.get("despesasCentavos")) !== despesas) {
      falhar("O resumo do mês não bate com os lançamentos gravados.");
    }

    console.log(`\nProjeto ${projectId}${SIMULADOR ? " (SIMULADOR)" : ""} · condomínio ${ID} · mês ${mes}`);
    console.log(`Gravado: ${lancamentos.size} lançamentos · receitas ${formatarMoeda(receitas)} · despesas ${formatarMoeda(despesas)} (bate com o arquivo)`);
    if (SO_CONFERIR) return null;

    lancamentos.docs.forEach((d) => tx.update(d.ref, { publicado: true }));
    tx.set(resumoRef, { publicado: true, publicadoEm: FieldValue.serverTimestamp(), publicadoPor: QUEM.uid, quantidade: lancamentos.size }, { merge: true });
    tx.create(c.collection("auditLogs").doc(), {
      condominioId: ID,
      uid: QUEM.uid,
      nome: QUEM.nome,
      papel: QUEM.papel,
      acao: "financeiro.publicar",
      alvo: `monthlySummaries/${mes}`,
      detalhes: { lancamentos: lancamentos.size },
      criadoEm: FieldValue.serverTimestamp(),
    });
    tx.set(c.collection("sistema").doc("sinais"), { financeiro: FieldValue.serverTimestamp() }, { merge: true });
    return lancamentos.size;
  });
  console.log(total === null ? "\n(Só conferência: nada foi publicado.)\n" : `\n✔ ${mes} publicado com ${total} lançamentos. Os moradores já podem ver.\n`);
}


/** Lança um mês anterior ao primeiro mês do portal, já publicado, sem mudar os saldos dos meses seguintes. */
async function antesDoInicio() {
  const c = db.collection("condominiums").doc(ID);
  const mes = dados.mes;
  if (saldoInicial === null) falhar('Informe "saldoInicial" (o saldo do mês anterior a este) no arquivo.');
  const resultado = await db.runTransaction(async (tx) => {
    const condominio = await tx.get(c);
    if (!condominio.exists) falhar(`O condomínio "${ID}" não existe no projeto ${projectId}.`);
    const mesInicialAtual = condominio.get("financeiro.mesInicial") as string | undefined;
    const saldoAtual = Number(condominio.get("financeiro.saldoInicialCentavos") ?? NaN);
    if (!mesInicialAtual || mesSeguinte(mes) !== mesInicialAtual) {
      falhar(`Este modo é só para o mês logo antes do início do portal (início atual: ${mesInicialAtual ?? "não configurado"}).`);
    }
    const [resumo, doMes, anteriores] = await Promise.all([
      tx.get(c.collection("monthlySummaries").doc(mes)),
      tx.get(c.collection("financialEntries").where("mes", "==", mes)),
      tx.get(c.collection("financialEntries").where("mes", "<", mes).limit(1)),
    ]);
    if (resumo.exists || !doMes.empty || !anteriores.empty) falhar(`${mes} (ou um mês anterior) já tem dados no portal.`);
    const saldoFinal = saldoInicial + receitas - despesas;
    if (saldoFinal !== saldoAtual) {
      falhar(
        `O saldo final de ${mes} (${formatarMoeda(saldoFinal)}) precisa ser igual ao saldo inicial que o portal já usa ` +
          `(${formatarMoeda(saldoAtual)}, começo de ${mesInicialAtual}). Diferença: ${formatarMoeda(saldoAtual - saldoFinal)}.`,
      );
    }
    if (saldoFinal !== esperado) falhar(`Saldo final não bate com o relatório: calculado ${formatarMoeda(saldoFinal)}, relatório ${formatarMoeda(esperado)}.`);

    const usadas = [...new Set(linhas.map((l) => l.categoria))].map((id) => categoriasConhecidas.get(id)!);
    const docsCat = await tx.getAll(...usadas.map((cat) => c.collection("financialCategories").doc(cat.id)));
    const criar = usadas.filter((_, i) => !docsCat[i].exists);

    console.log(`\nProjeto ${projectId}${SIMULADOR ? " (SIMULADOR)" : ""} · condomínio ${ID} · mês ${mes} (antes de ${mesInicialAtual})`);
    console.log(`Fonte: ${dados.fonte}`);
    console.log(`Saldo inicial: ${formatarMoeda(saldoAtual)} em ${mesInicialAtual} → ${formatarMoeda(saldoInicial)} em ${mes}`);
    console.log(`Receitas: ${formatarMoeda(receitas)} · Despesas: ${formatarMoeda(despesas)} · Saldo final: ${formatarMoeda(saldoFinal)} (= começo de ${mesInicialAtual})`);
    console.log(`Lançamentos: ${linhas.length} · categorias a criar: ${criar.map((x) => x.nome).join(", ") || "nenhuma"} · entra PUBLICADO`);
    if (SO_CONFERIR) return false;

    const audit = (acao: string, alvo: string | null, detalhes: Record<string, string | number | boolean | null>) =>
      tx.create(c.collection("auditLogs").doc(), { condominioId: ID, uid: QUEM.uid, nome: QUEM.nome, papel: QUEM.papel, acao, alvo, detalhes, criadoEm: FieldValue.serverTimestamp() });
    for (const cat of criar) tx.create(c.collection("financialCategories").doc(cat.id), { nome: cat.nome, tipo: cat.tipo, ordem: cat.ordem, ativa: true });
    if (criar.length) audit("financeiro.categoria", null, { criadas: criar.length });
    tx.set(c, { financeiro: { saldoInicialCentavos: saldoInicial, mesInicial: mes } }, { merge: true });
    audit("financeiro.configurar", null, { saldoInicialCentavos: saldoInicial, mesInicial: mes, antes: `${saldoAtual} em ${mesInicialAtual}` });
    const base = Date.now() - linhas.length * 1000;
    for (const [i, l] of linhas.entries()) {
      const ref = c.collection("financialEntries").doc();
      tx.create(ref, {
        tipo: l.tipo, categoriaId: l.categoria, categoriaNome: l.categoriaNome, valorCentavos: l.valorCentavos, data: l.data, mes,
        forma: l.forma, descricao: l.descricao, publicado: true, estornaId: null, estornadoPor: null,
        criadoPor: QUEM.uid, criadoPorNome: QUEM.nome, criadoEm: Timestamp.fromMillis(base + i * 1000),
      });
      audit("financeiro.lancar", `financialEntries/${ref.id}`, { tipo: l.tipo, valorCentavos: l.valorCentavos, data: l.data, categoria: l.categoria });
    }
    const quadro = lerQuadroCasas(dados.casas ?? null);
    tx.set(c.collection("monthlySummaries").doc(mes), {
      receitasCentavos: receitas, despesasCentavos: despesas, quantidade: linhas.length, publicado: true,
      publicadoEm: FieldValue.serverTimestamp(), publicadoPor: QUEM.uid, atualizadoEm: FieldValue.serverTimestamp(),
      ...(quadro ? { casas: { ...quadro, atualizadoEm: FieldValue.serverTimestamp(), atualizadoPor: QUEM.uid } } : {}),
    });
    audit("financeiro.publicar", `monthlySummaries/${mes}`, { mes, lancamentos: linhas.length });
    if (quadro) audit("financeiro.quadro", `monthlySummaries/${mes}`, { mes });
    tx.set(c.collection("sistema").doc("sinais"), { financeiro: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  console.log(resultado ? `\n✔ ${linhas.length} lançamentos de ${mes} gravados e publicados.\n` : "\n(Só conferência: nada foi gravado.)\n");
}

/**
 * Acerta a ordem das linhas de um mês lançado pelo script antigo (que gravava a hora ao contrário).
 * Só muda a hora do lançamento (criadoEm), nunca valor, descrição ou categoria. Confere que cada
 * linha do arquivo existe uma única vez no mês.
 */
async function reordenar() {
  const c = db.collection("condominiums").doc(ID);
  const mes = dados.mes;
  const snap = await c.collection("financialEntries").where("mes", "==", mes).where("criadoPor", "==", QUEM.uid).get();
  if (snap.size !== linhas.length) falhar(`${mes} tem ${snap.size} lançamentos do script; o arquivo tem ${linhas.length}.`);
  const usados = new Set<string>();
  const pares = linhas.map((l) => {
    const d = snap.docs.find((x) => !usados.has(x.id) && x.get("descricao") === l.descricao && Number(x.get("valorCentavos")) === l.valorCentavos);
    if (!d) falhar(`Não achei no banco: "${l.descricao}" (${l.valor}).`);
    usados.add(d.id);
    return d;
  });
  const menor = Math.min(...snap.docs.map((d) => d.get("criadoEm")?.toMillis?.() ?? Date.now()));
  console.log(`\nProjeto ${projectId}${SIMULADOR ? " (SIMULADOR)" : ""} · ${mes}: ${pares.length} lançamentos encontrados; a ordem passa a ser a do arquivo.`);
  if (SO_CONFERIR) return console.log("\n(Só conferência: nada foi gravado.)\n");
  const lote = db.batch();
  pares.forEach((d, i) => lote.update(d.ref, { criadoEm: Timestamp.fromMillis(menor + i * 1000) }));
  lote.create(c.collection("auditLogs").doc(), {
    condominioId: ID, uid: QUEM.uid, nome: QUEM.nome, papel: QUEM.papel, acao: "financeiro.configurar",
    alvo: `monthlySummaries/${mes}`, detalhes: { mes, ordemDasLinhas: "ordem do relatório em papel (só a hora do lançamento mudou)" },
    criadoEm: FieldValue.serverTimestamp(),
  });
  await lote.commit();
  console.log(`\n✔ Ordem de ${mes} acertada.\n`);
}

/**
 * Só LÊ: compara o que está gravado no mês com o arquivo e mostra as diferenças — cada
 * lançamento (valor, descrição, categoria e ordem), estornos, totais do mês e quadro de casas.
 * Não grava nada.
 */
async function comparar() {
  const c = db.collection("condominiums").doc(ID);
  const mes = dados.mes;
  const [snap, resumo] = await Promise.all([
    c.collection("financialEntries").where("mes", "==", mes).get(),
    c.collection("monthlySummaries").doc(mes).get(),
  ]);
  console.log(`\nProjeto ${projectId}${SIMULADOR ? " (SIMULADOR)" : ""} · condomínio ${ID} · mês ${mes}`);
  const ordenados = [...snap.docs].sort((a, b) => (a.get("criadoEm")?.toMillis?.() ?? 0) - (b.get("criadoEm")?.toMillis?.() ?? 0));
  const estornados = ordenados.filter((d) => d.get("estornadoPor") || d.get("estornaId"));
  const valendo = ordenados.filter((d) => !d.get("estornadoPor") && !d.get("estornaId"));
  const diferencas: string[] = [];
  if (estornados.length) console.log(`  ${estornados.length} lançamento(s) estornado(s) ou de estorno (não entram na comparação).`);

  const usados = new Set<string>();
  const achados = linhas.map((l) => {
    const d = valendo.find((x) => !usados.has(x.id) && x.get("descricao") === l.descricao && Number(x.get("valorCentavos")) === l.valorCentavos);
    if (!d) {
      diferencas.push(`Falta no portal: "${l.descricao}" (${formatarMoeda(l.valorCentavos)}, ${l.categoriaNome}).`);
      return null;
    }
    usados.add(d.id);
    if (d.get("categoriaId") !== l.categoria) diferencas.push(`Categoria diferente em "${l.descricao}": portal ${d.get("categoriaNome")}, relatório ${l.categoriaNome}.`);
    if (d.get("tipo") !== l.tipo) diferencas.push(`Tipo diferente em "${l.descricao}": portal ${d.get("tipo")}, relatório ${l.tipo}.`);
    return d;
  });
  for (const d of valendo) {
    if (!usados.has(d.id)) diferencas.push(`Sobra no portal (não está no relatório): "${d.get("descricao")}" (${formatarMoeda(Number(d.get("valorCentavos")))}).`);
  }
  // Ordem: a sequência dos lançamentos achados precisa ser a mesma do arquivo.
  const posicoes = achados.filter((d) => d !== null).map((d) => valendo.indexOf(d!));
  if (posicoes.some((p, i) => i > 0 && p < posicoes[i - 1])) diferencas.push("A ordem das linhas no portal não é a do relatório (corrija com --reordenar).");

  const somaPortal = (tipo: string) => valendo.filter((d) => d.get("tipo") === tipo).reduce((s, d) => s + Number(d.get("valorCentavos")), 0);
  const totais: [string, number, number, number | undefined][] = [
    ["Receitas", receitas, somaPortal("receita"), resumo.get("receitasCentavos")],
    ["Despesas", despesas, somaPortal("despesa"), resumo.get("despesasCentavos")],
  ];
  for (const [rotulo, arquivo, lancado, guardado] of totais) {
    console.log(`  ${rotulo}: relatório ${formatarMoeda(arquivo)} · lançamentos ${formatarMoeda(lancado)} · total do mês ${guardado === undefined ? "—" : formatarMoeda(Number(guardado))}`);
    if (lancado !== arquivo) diferencas.push(`${rotulo} dos lançamentos não batem com o relatório.`);
    if (guardado !== undefined && Number(guardado) !== lancado) diferencas.push(`${rotulo}: o total guardado do mês não bate com a soma dos lançamentos.`);
  }
  console.log(`  Publicado: ${resumo.get("publicado") === true ? "sim" : "não"} · ${valendo.length} lançamentos valendo (arquivo: ${linhas.length})`);

  const quadroArquivo = lerQuadroCasas(dados.casas ?? null);
  const quadroPortal = lerQuadroCasas(resumo.get("casas") ?? null);
  if (quadroArquivo) {
    for (const campo of CAMPOS_QUADRO) {
      const a = quadroArquivo[campo.chave];
      const p = quadroPortal?.[campo.chave] ?? null;
      if (a !== p) diferencas.push(`Quadro de casas — ${campo.rotulo}: portal ${p ?? "—"}, relatório ${a ?? "—"}.`);
    }
  }

  if (!diferencas.length) return console.log("\n✔ O portal está igual ao relatório. Nada a corrigir.\n");
  console.log(`\n✖ ${diferencas.length} diferença(s):`);
  for (const d of diferencas) console.log(`  - ${d}`);
  console.log("\n(Só leitura: nada foi gravado.)\n");
}

/** Grava (ou corrige) o quadro de casas do mês a partir do arquivo — o mesmo da tela "Quadro de casas". */
async function soQuadro() {
  const c = db.collection("condominiums").doc(ID);
  const mes = dados.mes;
  const quadro = lerQuadroCasas(dados.casas ?? null);
  if (!quadro) falhar('O arquivo não tem "casas" (quadro de casas).');
  if (quadro.total !== null) {
    for (const campo of CAMPOS_QUADRO) {
      const n = quadro[campo.chave];
      if (campo.chave !== "total" && n !== null && n > quadro.total) falhar(`"${campo.rotulo}" passa do total de casas.`);
    }
  }
  const resumoRef = c.collection("monthlySummaries").doc(mes);
  const resumo = await resumoRef.get();
  if (!resumo.exists) falhar(`${mes} não tem lançamentos: lance o mês antes.`);
  console.log(`\nProjeto ${projectId}${SIMULADOR ? " (SIMULADOR)" : ""} · condomínio ${ID} · mês ${mes}`);
  for (const campo of CAMPOS_QUADRO) console.log(`  ${campo.rotulo}: ${quadro[campo.chave] ?? "—"}`);
  if (quadro.observacao) console.log(`  Observação: ${quadro.observacao}`);
  if (SO_CONFERIR) return console.log("\n(Só conferência: nada foi gravado.)\n");
  const lote = db.batch();
  lote.set(resumoRef, { casas: { ...quadro, atualizadoEm: FieldValue.serverTimestamp(), atualizadoPor: QUEM.uid } }, { merge: true });
  lote.create(c.collection("auditLogs").doc(), {
    condominioId: ID,
    uid: QUEM.uid,
    nome: QUEM.nome,
    papel: QUEM.papel,
    acao: "financeiro.quadro",
    alvo: `monthlySummaries/${mes}`,
    detalhes: { mes, ...Object.fromEntries(CAMPOS_QUADRO.map((x) => [x.chave, quadro[x.chave]])), publicado: resumo.get("publicado") === true },
    criadoEm: FieldValue.serverTimestamp(),
  });
  lote.set(c.collection("sistema").doc("sinais"), { financeiro: FieldValue.serverTimestamp() }, { merge: true });
  await lote.commit();
  console.log(`\n✔ Quadro de casas de ${mes} gravado.\n`);
}

(COMPARAR ? comparar() : REORDENAR ? reordenar() : ANTES_DO_INICIO ? antesDoInicio() : SO_QUADRO ? soQuadro() : SO_PUBLICAR ? soPublicar() : main()).catch((e) => falhar(e instanceof Error ? e.message : String(e)));
