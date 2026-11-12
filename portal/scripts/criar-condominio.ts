/**
 * Cria um condomínio e o primeiro administrador (síndico) — USO REAL.
 * Não existe cadastro público: este é o único jeito de nascer o primeiro admin.
 *
 * Uso:
 *   npm run criar-condominio -- --id jardins-do-lago --nome "Residencial Jardins do Lago" --admin-uid <UID>
 *
 * O <UID> é o identificador da conta do síndico no Firebase Authentication
 * (Console do Firebase > Authentication > Usuários). As credenciais do Admin SDK
 * vêm do .env.local (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).
 */
import { parseArgs } from "node:util";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

process.loadEnvFile?.(".env.local");

const { values } = parseArgs({
  options: {
    id: { type: "string" },
    nome: { type: "string" },
    "admin-uid": { type: "string" },
  },
});

const id = values.id ?? "";
const nome = values.nome ?? "";
const adminUid = values["admin-uid"] ?? "";

if (!/^[a-z0-9-]{3,40}$/.test(id) || nome.trim().length < 3 || !adminUid) {
  console.error('Uso: npm run criar-condominio -- --id jardins-do-lago --nome "Residencial Jardins do Lago" --admin-uid <UID>');
  console.error("O id usa só letras minúsculas, números e hífen.");
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const usaEmulador = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
if (!projectId) {
  console.error("Configure FIREBASE_PROJECT_ID no .env.local.");
  process.exit(1);
}

initializeApp(
  usaEmulador
    ? { projectId }
    : {
        projectId,
        credential: cert({
          projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      },
);

async function main() {
  const db = getFirestore();
  const usuario = await getAuth().getUser(adminUid); // falha se a conta não existir

  const condominio = db.doc(`condominiums/${id}`);
  await db.runTransaction(async (tx) => {
    if ((await tx.get(condominio)).exists) throw new Error(`O condomínio "${id}" já existe.`);
    const userRef = db.doc(`users/${adminUid}`);
    const user = await tx.get(userRef);

    tx.create(condominio, { nome, status: "ativo", fuso: "America/Belem", moeda: "BRL", criadoEm: FieldValue.serverTimestamp() });
    tx.create(condominio.collection("members").doc(adminUid), {
      nome: usuario.displayName ?? usuario.email ?? "Administrador",
      papel: "admin",
      unitId: null,
      status: "ativo",
      permissoesExtras: [],
      permissoesNegadas: [],
      criadoEm: FieldValue.serverTimestamp(),
    });
    tx.set(
      userRef,
      {
        nome: usuario.displayName ?? usuario.email ?? "Administrador",
        condominioIds: FieldValue.arrayUnion(id),
        condominioAtivo: user.exists ? (user.get("condominioAtivo") ?? id) : id,
      },
      { merge: true },
    );
    tx.create(condominio.collection("auditLogs").doc(), {
      condominioId: id,
      uid: "script",
      nome: "Script de implantação",
      papel: null,
      acao: "condominio.criar",
      alvo: `condominiums/${id}`,
      detalhes: { adminUid },
      criadoEm: FieldValue.serverTimestamp(),
    });
  });

  console.log(`Condomínio "${nome}" criado com o administrador ${usuario.email ?? adminUid}.`);
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
