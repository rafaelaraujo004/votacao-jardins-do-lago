/**
 * Liga (ou desliga) o PORTAL PÚBLICO de um condomínio já existente — USO REAL.
 * Com ele ligado, quem abre o link vê as informações gerais (prestação de contas
 * publicada, mapa, contatos e agenda das áreas) sem precisar entrar.
 * Não mexe em mais nada do condomínio (só o campo portalPublico).
 *
 * O síndico também pode fazer isso pela tela /admin/informacoes
 * ("Portal dos moradores ligado"). Este script serve para o primeiro acesso.
 *
 * Uso (na pasta portal), com as credenciais do Admin SDK do .env.local
 * (ou outro arquivo via --env-file):
 *   npx tsx scripts/ligar-portal-publico.ts --id jardins-do-lago
 *   npx tsx scripts/ligar-portal-publico.ts --id jardins-do-lago --desligar
 */
import { parseArgs } from "node:util";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

process.loadEnvFile?.(".env.local");

const { values } = parseArgs({ options: { id: { type: "string" }, desligar: { type: "boolean" } } });
const id = (values.id ?? "").trim();
const ligar = !values.desligar;

if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(id)) {
  console.error("Informe --id do condomínio (ex.: --id jardins-do-lago).");
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID;
if (process.env.FIRESTORE_EMULATOR_HOST) {
  initializeApp({ projectId: projectId ?? "demo-jardins" });
} else {
  if (!projectId) throw new Error("Configure FIREBASE_PROJECT_ID.");
  initializeApp({
    projectId,
    credential: cert({
      projectId,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

async function main() {
  const db = getFirestore();
  const ref = db.doc(`condominiums/${id}`);
  const doc = await ref.get();
  if (!doc.exists) throw new Error(`Condomínio "${id}" não encontrado. Confira o --id.`);

  // Grava junto um registro na auditoria (sem dados pessoais).
  const lote = db.batch();
  lote.update(ref, { portalPublico: ligar });
  // Mesmo formato de src/server/auditoria.ts (registrarAuditoria).
  lote.create(db.collection(`condominiums/${id}/auditLogs`).doc(), {
    condominioId: id,
    uid: "script",
    nome: "Script ligar-portal-publico",
    papel: null,
    acao: "informacoes.alterar",
    alvo: `condominiums/${id}`,
    detalhes: { portalPublicoAntes: doc.get("portalPublico") === true, portalPublico: ligar },
    criadoEm: FieldValue.serverTimestamp(),
  });
  await lote.commit();

  console.log(ligar ? `Portal público LIGADO em "${doc.get("nome") ?? id}".` : `Portal público DESLIGADO em "${doc.get("nome") ?? id}".`);
  if (doc.get("status") !== "ativo") console.log('Atenção: o condomínio não está com status "ativo"; o link continua mostrando "Portal indisponível".');
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
