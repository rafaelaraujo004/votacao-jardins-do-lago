/**
 * Traz para "Moradores e equipe" as pessoas da LISTA DE CONTATOS (contatosVotacao), no
 * condomínio REAL — a mesma regra do botão "Trazer moradores da lista"
 * (src/lib/importar-moradores.ts e importarMoradoresDaLista em src/server/acoes/pessoas.ts).
 * Cada nome vira um Morador SEM acesso; rodar de novo não repete ninguém; quem o síndico
 * excluiu não volta. Não mostra nomes nem telefones na tela: só contagens e números de casas.
 *
 * Uso (na pasta portal, com as credenciais do .env.production.local):
 *   npx tsx scripts/importar-moradores.ts --conferir   (só mostra o que faria)
 *   npx tsx scripts/importar-moradores.ts              (grava)
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  LIMITE_IMPORTACAO,
  faixasDeCasas,
  normalizarNome,
  planejarImportacao,
  type ContatoDaLista,
} from "../src/lib/importar-moradores";

const { values } = parseArgs({ options: { id: { type: "string" }, conferir: { type: "boolean" } } });
const ID = values.id ?? "jardins-do-lago";
const SO_CONFERIR = values.conferir === true;
const QUEM = { uid: "script:importar-moradores", nome: "Importação da lista de contatos (a pedido da administração)" };
const PESSOAS_POR_LOTE = 150;
const TRAVA_MS = 3 * 60 * 1000;

function falhar(mensagem: string): never {
  console.error(`\n✖ ${mensagem}\n`);
  process.exit(1);
}

if (process.env.FIRESTORE_EMULATOR_HOST) falhar("Este script é para o Firebase REAL; desligue o simulador (FIRESTORE_EMULATOR_HOST).");
const ARQUIVO_ENV = path.resolve(import.meta.dirname, "..", ".env.production.local");
if (existsSync(ARQUIVO_ENV)) process.loadEnvFile?.(ARQUIVO_ENV);
const projectId = process.env.FIREBASE_PROJECT_ID ?? "";
if (!projectId) falhar("Configure FIREBASE_PROJECT_ID (arquivo .env.production.local).");
if (projectId.startsWith("demo-")) falhar(`O projeto "${projectId}" é de demonstração.`);
initializeApp({
  projectId,
  credential: cert({
    projectId,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();
const auth = getAuth();

/** Palavras que indicam que a célula do Word não é um nome de pessoa. */
const SUSPEITAS = /\b(vazi[ao]|vago|alugad[ao]|inquilin|propriet|desocupad|sem morador|n[aã]o mora|lote|terreno|construc|obra)\b/i;

async function main() {
  const cond = db.collection("condominiums").doc(ID);
  if (!(await cond.get()).exists) falhar(`O condomínio "${ID}" não existe no projeto ${projectId}.`);
  const trava = cond.collection("sistema").doc("importacaoMoradores");

  const plano = async () => {
    const [contatos, casas, pessoas, controle] = await Promise.all([
      cond.collection("contatosVotacao").select("nome", "telefones").get(),
      cond.collection("units").get(),
      cond.collection("members").select("papel", "unitId", "nome").get(),
      trava.get(),
    ]);
    const lista: ContatoDaLista[] = contatos.docs.map((d) => ({
      unitId: d.id,
      nome: typeof d.get("nome") === "string" ? (d.get("nome") as string) : "",
      telefones: Array.isArray(d.get("telefones")) ? (d.get("telefones") as unknown[]).filter((t): t is string => typeof t === "string") : [],
    }));
    const brutos = controle.get("excluidosPorCasa");
    const excluidosPorCasa: Record<string, string[]> = {};
    if (brutos && typeof brutos === "object")
      for (const [u, n] of Object.entries(brutos as Record<string, unknown>))
        if (Array.isArray(n)) excluidosPorCasa[u] = n.filter((x): x is string => typeof x === "string");
    return {
      lista,
      resultado: planejarImportacao({
        condominioId: ID,
        contatos: lista,
        casas: casas.docs.map((d) => ({
          id: d.id,
          rotulo: String(d.get("rotulo") ?? d.id),
          numero: Number(d.get("numero") ?? 0),
          status: d.get("status") === "inativa" ? ("inativa" as const) : ("ativa" as const),
        })),
        pessoas: pessoas.docs.map((d) => ({
          uid: d.id,
          papel: String(d.get("papel") ?? ""),
          unitId: typeof d.get("unitId") === "string" ? (d.get("unitId") as string) : null,
          nome: String(d.get("nome") ?? ""),
        })),
        excluidosPorCasa,
      }),
    };
  };

  const { lista, resultado: p } = await plano();
  // Conferência de qualidade (sem mostrar nomes): células que parecem anotação, não nome.
  const suspeitas = p.novos.filter((x) => SUSPEITAS.test(normalizarNome(x.nome)) || /\d/.test(x.nome) || x.nome.length > 50);
  const semNome = p.novos.filter((x) => x.nome.startsWith("Contato da "));
  const semTelefone = p.novos.filter((x) => !x.telefone && !x.telefone2);
  const porCasa = new Map<number, number>();
  for (const x of p.novos) porCasa.set(x.numero, (porCasa.get(x.numero) ?? 0) + 1);
  const casasComMaisDeDois = [...porCasa].filter(([, n]) => n > 2).map(([c]) => c);

  console.log(`\nProjeto ${projectId} · condomínio ${ID}`);
  console.log(`Lista de contatos: ${lista.length} linhas (casas)`);
  console.log(`Pessoas novas: ${p.novos.length} · já cadastradas: ${p.jaCadastrados} · excluídas antes (não voltam): ${p.excluidosAntes}`);
  console.log(`Casas na lista: ${p.casasNaLista} · casas sem contato e sem morador: ${faixasDeCasas(p.casasSemContato) || "nenhuma"}`);
  if (p.casasInativas.length) console.log(`Casas inativas (ficam de fora): ${faixasDeCasas(p.casasInativas)}`);
  if (p.casasNaoEncontradas) console.log(`Linhas de casas que não existem no cadastro: ${p.casasNaoEncontradas}`);
  console.log(`Conferência: ${suspeitas.length} nome(s) que parecem anotação${suspeitas.length ? ` (casas ${faixasDeCasas(suspeitas.map((x) => x.numero))})` : ""} · ${semNome.length} linha(s) sem nome · ${semTelefone.length} pessoa(s) sem telefone · casas com mais de 2 pessoas: ${faixasDeCasas(casasComMaisDeDois) || "nenhuma"}`);

  if (SO_CONFERIR) {
    console.log("\n(só conferência: nada foi gravado)\n");
    return;
  }
  if (p.novos.length === 0) {
    console.log("\nNinguém novo para trazer.\n");
    return;
  }
  if (p.novos.length > LIMITE_IMPORTACAO) falhar(`Mais de ${LIMITE_IMPORTACAO} pessoas novas: confira a lista antes.`);

  // Trava (a mesma do botão do portal): duas importações não rodam juntas.
  await db.runTransaction(async (tx) => {
    const atual = await tx.get(trava);
    if (Number(atual.get("ate") ?? 0) > Date.now()) falhar("Já tem uma importação em andamento. Espere alguns minutos.");
    tx.set(trava, { ate: Date.now() + TRAVA_MS, por: QUEM.uid, desde: FieldValue.serverTimestamp() }, { merge: true });
  });

  let criados = 0;
  let falhas = 0;
  try {
    // Recalcula depois da trava (alguém pode ter cadastrado nesse meio tempo).
    const { resultado } = await plano();
    const novos = resultado.novos;
    const r = await auth.importUsers(novos.map((x) => ({ uid: x.uid, displayName: x.nome })));
    const falhouNoAuth = new Set(r.errors.map((e) => e.index));
    falhas += falhouNoAuth.size;
    for (const e of r.errors) console.error(`  conta não criada (casa ${novos[e.index]?.numero}): ${e.error.code}`);
    const prontos = novos.filter((_, i) => !falhouNoAuth.has(i));

    for (let i = 0; i < prontos.length; i += PESSOAS_POR_LOTE) {
      const grupo = prontos.slice(i, i + PESSOAS_POR_LOTE);
      const lote = db.batch();
      for (const x of grupo) {
        lote.create(cond.collection("members").doc(x.uid), {
          nome: x.nome,
          papel: "morador",
          unitId: x.unitId,
          telefone: x.telefone,
          telefone2: x.telefone2,
          status: "ativo",
          permissoesExtras: [],
          permissoesNegadas: [],
          origem: "lista-contatos",
          listaUnitId: x.unitId,
          listaChave: normalizarNome(x.nome),
          criadoPor: QUEM.uid,
          criadoEm: FieldValue.serverTimestamp(),
        });
        lote.set(db.doc(`users/${x.uid}`), { nome: x.nome, condominioIds: FieldValue.arrayUnion(ID), condominioAtivo: ID }, { merge: true });
      }
      // Auditoria (sem nomes nem telefones) e o sinal para as telas abertas se atualizarem.
      lote.create(cond.collection("auditLogs").doc(), {
        condominioId: ID,
        uid: QUEM.uid,
        nome: QUEM.nome,
        papel: "admin",
        acao: "membro.importar",
        alvo: "members",
        detalhes: { origem: "lista de contatos", quantidade: grupo.length, casas: faixasDeCasas(grupo.map((x) => x.numero)) },
        criadoEm: FieldValue.serverTimestamp(),
      });
      lote.set(cond.collection("sistema").doc("sinais"), { pessoas: FieldValue.serverTimestamp() }, { merge: true });
      try {
        await lote.commit();
        criados += grupo.length;
        console.log(`  lote ${i / PESSOAS_POR_LOTE + 1}: ${grupo.length} pessoas (casas ${faixasDeCasas(grupo.map((x) => x.numero))})`);
      } catch (erro) {
        console.error("  lote não gravado:", erro);
        const docs = await db.getAll(...grupo.map((x) => cond.collection("members").doc(x.uid)));
        criados += grupo.filter((_, j) => docs[j]?.exists).length;
        falhas += grupo.filter((_, j) => !docs[j]?.exists).length;
        const orfas = grupo.filter((_, j) => !docs[j]?.exists).map((x) => x.uid);
        if (orfas.length) await auth.deleteUsers(orfas).catch((e) => console.error("  limpeza do Auth:", e));
      }
    }
  } finally {
    await trava.set({ ate: 0 }, { merge: true }).catch(() => undefined);
  }
  console.log(`\n✔ ${criados} pessoas cadastradas como Morador (sem acesso).${falhas ? ` ${falhas} falharam: rode de novo.` : ""}\n`);
}

main().catch((e) => falhar(e instanceof Error ? e.message : String(e)));
