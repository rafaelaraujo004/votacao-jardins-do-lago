/**
 * Cadastra a VOTAÇÃO OFICIAL do Residencial Jardins do Lago — USO REAL.
 *
 * O que faz (pode rodar de novo sem duplicar nada):
 *  1. Casas: cria as casas de 1 a 225 que ainda não existem no cadastro (id casa-001…,
 *     "Casa N", ativa). Não mexe nas que já existem.
 *  2. Contatos: lê a lista do Word (colunas CASA, NOME, CONTATOS) e grava nome e telefones
 *     de cada casa (para o envio do link de voto pelo WhatsApp). Casa sem telefone na lista
 *     mantém o que já havia; número de casa repetido no cadastro não é importado (avisa).
 *  3. Eleição: cria, como RASCUNHO, a "Eleição do síndico e conselho 2026/2027" — chapa
 *     única (Sim ou Não), dia 29/11/2026, das 7h às 17h (horário do condomínio).
 *     Se já existir uma eleição com esse título, não cria outra.
 *  4. Fotos da chapa (recortadas do cartaz): põe a foto de cada integrante que ainda
 *     não tem foto. A comissão pode trocar depois no portal (Votação oficial → Fotos da chapa).
 *  5. Registra tudo na auditoria (sem telefones).
 * NÃO publica e NÃO gera os links: isso a comissão faz no portal (Votação oficial →
 * conferir → Publicar → Links de voto e WhatsApp → Gerar links).
 *
 * Uso (na pasta portal), com as credenciais do .env.production.local:
 *   npx tsx scripts/cadastrar-votacao.ts --lista "C:\caminho\LISTA ASSINATURA 2026.docx" --conferir   (só mostra)
 *   npx tsx scripts/cadastrar-votacao.ts --lista "C:\caminho\LISTA ASSINATURA 2026.docx"              (grava)
 * Testar no simulador: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 ... --simulador --projeto demo-jardins
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { lerTabelasDocx } from "../src/lib/docx";
import { lerTabelaContatos, numeroDaCasa } from "../src/lib/contatos-votacao";
import { montarCandidatos, type Candidato } from "../src/lib/eleicoes";
import { dataHoraLocalParaDate } from "../src/lib/enquetes";
import { FUSO_PADRAO } from "../src/lib/formato";
import { TOTAL_LOTES } from "../src/lib/planta";

const { values } = parseArgs({
  options: {
    lista: { type: "string" },
    id: { type: "string" },
    conferir: { type: "boolean" },
    simulador: { type: "boolean" },
    projeto: { type: "string" },
  },
});

function falhar(mensagem: string): never {
  console.error(`\n✖ ${mensagem}\n`);
  process.exit(1);
}

const ID = values.id ?? "jardins-do-lago";
const SO_CONFERIR = values.conferir === true;
const SIMULADOR = values.simulador === true;

/** A eleição pedida pela administração (19/11/2026). */
const ELEICAO = {
  titulo: "Eleição do síndico e conselho 2026/2027",
  cargo: "Chapa única",
  abre: "2026-11-29T07:00",
  fecha: "2026-11-29T17:00",
  chapa: [
    { nome: "José Amaral", funcao: "Síndico", foto: "c1-jose.jpg" },
    { nome: "Iza Rabelo", funcao: "Vice-síndica", foto: "c2-iza.jpg" },
    { nome: "Aliny", funcao: "Tesoureira", foto: "c3-aliny.jpg" },
    { nome: "Bruno", funcao: "Fiscal", foto: "c4-bruno.jpg" },
    { nome: "Andrey", funcao: "Fiscal", foto: "c5-andrey.jpg" },
  ],
};

// ---------- Conferências antes de tocar no banco ----------

if (!values.lista) falhar('Informe a lista do Word: --lista "C:\\caminho\\LISTA ASSINATURA 2026.docx"');
const arquivo = path.resolve(values.lista);
if (!existsSync(arquivo)) falhar(`Não achei o arquivo: ${arquivo}`);
if (!/^[a-z0-9-]{3,40}$/.test(ID)) falhar("Confira o --id (letras minúsculas, números e hífen).");

let projectId: string;
if (SIMULADOR) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) falhar("--simulador precisa de FIRESTORE_EMULATOR_HOST.");
  projectId = values.projeto ?? "demo-jardins";
  initializeApp({ projectId });
} else {
  if (process.env.FIRESTORE_EMULATOR_HOST) falhar("Este script grava no Firebase REAL; desligue o simulador (FIRESTORE_EMULATOR_HOST) ou use --simulador.");
  const ARQUIVO_ENV = path.resolve(import.meta.dirname, "..", ".env.production.local");
  if (existsSync(ARQUIVO_ENV)) process.loadEnvFile?.(ARQUIVO_ENV);
  projectId = process.env.FIREBASE_PROJECT_ID ?? "";
  if (!projectId) falhar("Configure FIREBASE_PROJECT_ID (arquivo .env.production.local).");
  if (projectId.startsWith("demo-")) falhar(`O projeto "${projectId}" é de demonstração; este script é para o Firebase real.`);
  if (ID.endsWith("-demo")) falhar("Este script é do condomínio REAL.");
  initializeApp({
    projectId,
    credential: cert({
      projectId,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const montada = montarCandidatos(ELEICAO.chapa.map((c) => ({ nome: c.nome, funcao: c.funcao, casa: "", apresentacao: "", nascimento: "" })));
if (typeof montada === "string") falhar(`Chapa com problema: ${montada}`);
const candidatos: Candidato[] = montada;

// Lista do Word
const tabelas = lerTabelasDocx(readFileSync(arquivo));
const linhas = tabelas.filter((t) => t.some((l) => l.length >= 3)).flat();
const { contatos, avisos } = lerTabelaContatos(linhas.length ? linhas : tabelas[0]);
if (!contatos.length) falhar("Não encontrei casas na lista. Confira as colunas CASA, NOME e CONTATOS.");

const db = getFirestore();

async function main() {
  const refCond = db.collection("condominiums").doc(ID);
  const cond = await refCond.get();
  if (!cond.exists) falhar(`O condomínio "${ID}" não existe no projeto ${projectId}.`);
  const fuso = typeof cond.get("fuso") === "string" ? (cond.get("fuso") as string) : FUSO_PADRAO;
  const abreEm = dataHoraLocalParaDate(ELEICAO.abre, fuso);
  const fechaEm = dataHoraLocalParaDate(ELEICAO.fecha, fuso);
  if (!abreEm || !fechaEm || fechaEm <= abreEm) falhar("Datas da eleição inválidas.");
  if (fechaEm.getTime() <= Date.now()) falhar("O dia da eleição já passou.");

  // ---------- 1. Casas ----------
  const unidades = await refCond.collection("units").get();
  const porNumero = new Map<number, string[]>();
  for (const u of unidades.docs) {
    const n = numeroDaCasa({ id: u.id, numero: u.get("numero"), rotulo: u.get("rotulo") });
    if (n !== null) porNumero.set(n, [...(porNumero.get(n) ?? []), u.id]);
  }
  const faltam: number[] = [];
  for (let n = 1; n <= TOTAL_LOTES; n++) if (!porNumero.has(n)) faltam.push(n);
  const repetidos = [...porNumero.entries()].filter(([, ids]) => ids.length > 1).map(([n]) => n);

  // ---------- 2. Contatos ----------
  const gravar: { unitId: string; rotulo: string; nome: string; telefones: string[] }[] = [];
  const semCadastro: number[] = [];
  const semTelefone: number[] = [];
  for (const c of contatos) {
    if (repetidos.includes(c.numeroCasa)) continue;
    const id = porNumero.get(c.numeroCasa)?.[0] ?? (c.numeroCasa <= TOTAL_LOTES ? `casa-${String(c.numeroCasa).padStart(3, "0")}` : null);
    if (!id) {
      semCadastro.push(c.numeroCasa);
      continue;
    }
    if (!c.telefones.length) {
      semTelefone.push(c.numeroCasa);
      continue;
    }
    const rotulo = unidades.docs.find((u) => u.id === id)?.get("rotulo") ?? `Casa ${c.numeroCasa}`;
    gravar.push({ unitId: id, rotulo: String(rotulo), nome: c.nome, telefones: c.telefones });
  }
  const casasNaLista = new Set(contatos.map((c) => c.numeroCasa));
  const foraDaLista = Array.from({ length: TOTAL_LOTES }, (_, i) => i + 1).filter((n) => !casasNaLista.has(n));

  // ---------- 3. Eleição ----------
  const eleicoes = await refCond.collection("elections").where("titulo", "==", ELEICAO.titulo).get();
  const jaExiste = !eleicoes.empty;

  // ---------- 4. Fotos ----------
  const PASTA_FOTOS = path.resolve(import.meta.dirname, "dados-votacao", "fotos-chapa");
  const fotosArquivo = new Map(
    ELEICAO.chapa.map((c) => [c.nome, path.join(PASTA_FOTOS, c.foto)] as const).filter(([, arq]) => existsSync(arq)),
  );

  // ---------- Resumo ----------
  const fmt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: fuso, dateStyle: "short", timeStyle: "short" });
  console.log(`\nCondomínio: ${cond.get("nome")} (${ID}) · projeto ${projectId}${SIMULADOR ? " · SIMULADOR" : ""}`);
  console.log(`\n1. Casas: ${unidades.size} no cadastro; ${faltam.length ? `vou criar ${faltam.length} (${resumir(faltam)})` : "nenhuma a criar"}.`);
  if (repetidos.length) console.log(`   ⚠ Número repetido no cadastro (contato NÃO importado): casa ${repetidos.join(", ")}.`);
  console.log(`\n2. Contatos: ${contatos.length} casas na lista; vou gravar ${gravar.length} (${gravar.filter((g) => g.telefones.length > 1).length} com 2 telefones).`);
  if (semTelefone.length) console.log(`   Sem telefone na lista (mantém o que havia): casa ${semTelefone.join(", ")}.`);
  if (semCadastro.length) console.log(`   Fora das 225 casas (ignoradas): ${semCadastro.join(", ")}.`);
  if (foraDaLista.length) console.log(`   Casas que NÃO estão na lista do Word (sem contato): ${resumir(foraDaLista)}.`);
  for (const a of avisos) console.log(`   aviso: ${a.replace(/\d{8,}/g, "…")}`);
  console.log(
    `\n3. Eleição: ${jaExiste ? `já existe ("${ELEICAO.titulo}") — não vou criar outra.` : `vou criar como RASCUNHO "${ELEICAO.titulo}", ${fmt(abreEm)} até ${fmt(fechaEm)}.`}`,
  );
  console.log(`   Chapa: ${candidatos.map((c) => `${c.nome} (${c.funcao})`).join(", ")}.`);
  console.log(`\n4. Fotos: ${fotosArquivo.size} de ${candidatos.length} integrantes têm foto pronta (só grava em quem ainda não tem foto).`);

  if (SO_CONFERIR) {
    console.log("\n(--conferir: nada foi gravado. Rode de novo sem --conferir para gravar.)\n");
    return;
  }

  // ---------- Gravação ----------
  const agora = FieldValue.serverTimestamp();
  const auditoria = (acao: string, alvo: string, detalhes: Record<string, string | number | boolean | null>) => ({
    condominioId: ID,
    uid: "script:cadastrar-votacao",
    nome: "Cadastro da votação (script)",
    papel: null,
    acao,
    alvo,
    detalhes,
    criadoEm: agora,
  });

  // Casas (lotes de 400)
  for (let i = 0; i < faltam.length; i += 400) {
    const lote = db.batch();
    for (const n of faltam.slice(i, i + 400)) {
      lote.create(refCond.collection("units").doc(`casa-${String(n).padStart(3, "0")}`), {
        rotulo: `Casa ${n}`,
        numero: n,
        quadra: null,
        status: "ativa",
        observacao: "",
        criadoEm: agora,
      });
    }
    if (i === 0) lote.create(refCond.collection("auditLogs").doc(), auditoria("unidade.criar", "units", { criadas: faltam.length, origem: "script" }));
    await lote.commit();
  }

  // Contatos (lotes de 400)
  for (let i = 0; i < gravar.length; i += 400) {
    const lote = db.batch();
    for (const g of gravar.slice(i, i + 400)) {
      lote.set(refCond.collection("contatosVotacao").doc(g.unitId), {
        casa: g.rotulo,
        nome: g.nome,
        telefones: g.telefones,
        atualizadoEm: agora,
        atualizadoPor: "script:cadastrar-votacao",
      });
    }
    if (i === 0)
      lote.create(refCond.collection("auditLogs").doc(), auditoria("eleicao.contatos", "contatosVotacao", { gravados: gravar.length, origem: "script" }));
    await lote.commit();
  }

  // Eleição (rascunho)
  if (!jaExiste) {
    const ref = refCond.collection("elections").doc();
    const lote = db.batch();
    lote.create(ref, {
      titulo: ELEICAO.titulo,
      cargo: ELEICAO.cargo,
      modo: "chapa",
      vagas: candidatos.length,
      escolhasPorCasa: 1,
      permiteBranco: false,
      regraDesempate: "comissao",
      abreEm: Timestamp.fromDate(abreEm),
      fechaEm: Timestamp.fromDate(fechaEm),
      candidatos,
      casasBloqueadas: [],
      status: "rascunho",
      criadoPor: "script:cadastrar-votacao",
      criadoPorNome: "Cadastro da votação (script)",
      criadoEm: agora,
      atualizadoEm: agora,
      atualizadoPor: "script:cadastrar-votacao",
    });
    lote.create(
      refCond.collection("auditLogs").doc(),
      auditoria("eleicao.criar", `elections/${ref.id}`, { titulo: ELEICAO.titulo, candidatos: candidatos.length, origem: "script" }),
    );
    await lote.commit();
  }
  // Fotos (só em quem ainda não tem)
  const eleicaoRef = jaExiste
    ? eleicoes.docs[0].ref
    : (await refCond.collection("elections").where("titulo", "==", ELEICAO.titulo).get()).docs[0]?.ref;
  if (eleicaoRef) {
    const cands = ((await eleicaoRef.get()).get("candidatos") ?? []) as { id: string; nome: string }[];
    const existentes = new Set((await eleicaoRef.collection("fotos").get()).docs.map((d) => d.id));
    let postas = 0;
    for (const c of cands) {
      const arq = fotosArquivo.get(c.nome);
      if (!arq || existentes.has(c.id)) continue;
      const imagem = `data:image/jpeg;base64,${readFileSync(arq).toString("base64")}`;
      await eleicaoRef.collection("fotos").doc(c.id).set({ imagem, atualizadoEm: agora, atualizadoPor: "script:cadastrar-votacao" });
      postas++;
    }
    if (postas) await refCond.collection("auditLogs").add(auditoria("eleicao.foto", `elections/${eleicaoRef.id}`, { fotos: postas, origem: "script" }));
    console.log(`   Fotos postas: ${postas}.`);
  }
  console.log("\n✔ Gravado. Agora, no portal: Votação oficial → abra a eleição → confira → Publicar → Links de voto e WhatsApp → Gerar links.\n");
}

/** "1, 2, 3, 7, 8" → "1–3, 7–8". */
function resumir(nums: number[]): string {
  const partes: string[] = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    partes.push(i === j ? `${nums[i]}` : `${nums[i]}–${nums[j]}`);
    i = j;
  }
  return partes.join(", ");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
