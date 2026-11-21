/**
 * EXCLUI UMA VOTAÇÃO DE TESTE (definitivo) no Firebase real ou no simulador.
 *
 * Apaga a eleição e tudo dela: votantes, urna (contagem), links de voto e os índices dos
 * códigos (votoCodigos), fotos, assinaturas da ata e seus índices (ataCodigos). A AUDITORIA
 * fica (é o histórico, nunca apagado) e ganha um registro "eleicao.excluir".
 *
 * Proteções:
 * - só apaga eleição cujo TÍTULO tem a palavra "TESTE" (para nunca apagar a eleição de verdade);
 * - sem --apagar, só mostra o que seria apagado (modo conferir);
 * - pede o id exato da eleição e o condomínio.
 *
 * Uso (na pasta portal):
 *   npx tsx scripts/excluir-votacao-teste.ts --condominio jardins-do-lago --id <idDaEleicao>           (só confere)
 *   npx tsx scripts/excluir-votacao-teste.ts --condominio jardins-do-lago --id <idDaEleicao> --apagar  (apaga)
 * Simulador: defina FIRESTORE_EMULATOR_HOST e FIREBASE_PROJECT_ID=demo-jardins.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type DocumentReference } from "firebase-admin/firestore";

const { values } = parseArgs({
  options: {
    condominio: { type: "string" },
    id: { type: "string" },
    apagar: { type: "boolean", default: false },
  },
});

function falhar(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

const condominioId = values.condominio ?? "";
const id = values.id ?? "";
if (!/^[a-z0-9-]{3,60}$/.test(condominioId)) falhar("Informe --condominio (ex.: jardins-do-lago).");
if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) falhar("Informe --id da eleição (veja em scripts/diagnostico-votacao.ts).");

if (process.env.FIRESTORE_EMULATOR_HOST) {
  initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-jardins" });
} else {
  const env = path.resolve(import.meta.dirname, "..", ".env.production.local");
  if (existsSync(env)) process.loadEnvFile?.(env);
  const projectId = process.env.FIREBASE_PROJECT_ID ?? "";
  if (!projectId) falhar("Configure FIREBASE_PROJECT_ID (arquivo .env.production.local).");
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

const SUBCOLECOES = ["votantes", "urna", "links", "fotos", "assinaturasAta", "assinaturasLinks"];

async function main() {
  const cond = db.collection("condominiums").doc(condominioId);
  const ref = cond.collection("elections").doc(id);
  const doc = await ref.get();
  if (!doc.exists) falhar(`Eleição ${id} não existe em ${condominioId}.`);
  const titulo = String(doc.get("titulo") ?? "");
  if (!/\bTESTE\b/i.test(titulo)) falhar(`A eleição "${titulo}" NÃO tem "TESTE" no título. Por segurança, este script só apaga votações de teste.`);

  const apagar: DocumentReference[] = [];
  const resumo: string[] = [];
  for (const sub of SUBCOLECOES) {
    const snap = await ref.collection(sub).get();
    if (snap.size) resumo.push(`${sub}: ${snap.size}`);
    for (const d of snap.docs) {
      apagar.push(d.ref);
      // Índices globais dos códigos (link de voto e link de assinatura).
      const hash = d.get("hash");
      if (sub === "links" && typeof hash === "string") apagar.push(db.collection("votoCodigos").doc(hash));
      if (sub === "assinaturasLinks" && typeof hash === "string") apagar.push(db.collection("ataCodigos").doc(hash));
    }
  }
  // Índices que apontam para esta eleição mas ficaram sem o documento de link (por garantia).
  for (const col of ["votoCodigos", "ataCodigos"]) {
    const snap = await db.collection(col).where("eleicaoId", "==", id).get();
    for (const d of snap.docs) {
      if (d.get("condominioId") === condominioId && !apagar.some((r) => r.path === d.ref.path)) apagar.push(d.ref);
    }
  }
  apagar.push(ref);

  console.log(`\nCondomínio: ${condominioId}`);
  console.log(`Eleição: ${id} — "${titulo}" (status ${doc.get("status")})`);
  console.log(`Dentro dela: ${resumo.join(" · ") || "nada"}`);
  console.log(`Documentos a apagar: ${apagar.length} (inclui índices de códigos e a própria eleição). A auditoria fica.`);
  if (!values.apagar) {
    console.log("\nModo conferir: nada foi apagado. Para apagar, rode de novo com --apagar.\n");
    return;
  }
  for (let i = 0; i < apagar.length; i += 400) {
    const lote = db.batch();
    for (const r of apagar.slice(i, i + 400)) lote.delete(r);
    if (i === 0) {
      lote.create(cond.collection("auditLogs").doc(), {
        condominioId,
        uid: "script:excluir-votacao-teste",
        nome: "Exclusão de votação de teste (script)",
        papel: "admin",
        acao: "eleicao.excluir",
        alvo: `elections/${id}`,
        detalhes: { titulo, documentos: apagar.length },
        criadoEm: FieldValue.serverTimestamp(),
      });
    }
    await lote.commit();
  }
  const depois = await ref.get();
  console.log(depois.exists ? "\n✖ A eleição ainda existe — confira." : `\n✔ Votação de teste excluída (${apagar.length} documentos). Registro "eleicao.excluir" gravado na auditoria.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
