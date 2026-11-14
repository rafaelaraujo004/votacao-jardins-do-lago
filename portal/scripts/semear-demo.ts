/**
 * Cria os dados de DEMONSTRAÇÃO no simulador local.
 * Recusa-se a rodar fora do simulador: nunca toca no Firebase real.
 *
 * Uso: npm run semear   (o "npm run dev:emu" já roda este script sozinho)
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { CONDOMINIO_DEMO, OUTRO_CONDOMINIO_DEMO, USUARIOS_DEMO } from "../src/lib/demo";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error("Este script só roda com o simulador ligado (FIRESTORE_EMULATOR_HOST e FIREBASE_AUTH_EMULATOR_HOST).");
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? "demo-jardins";
if (!projectId.startsWith("demo-")) {
  console.error(`Projeto "${projectId}" não é de demonstração. Use um ID que comece com "demo-".`);
  process.exit(1);
}

initializeApp({ projectId });
const db = getFirestore();
const auth = getAuth();

async function main() {
  const lote = db.batch();
  const agora = FieldValue.serverTimestamp();

  for (const c of [CONDOMINIO_DEMO, OUTRO_CONDOMINIO_DEMO]) {
    lote.set(db.doc(`condominiums/${c.id}`), {
      nome: c.nome,
      status: "ativo",
      fuso: "America/Belem",
      moeda: "BRL",
      demo: true,
      criadoEm: agora,
    });
  }

  // Algumas casas fictícias (a numeração real vem do cadastro na Fase 2).
  for (const n of [1, 2, 12, 45, 120]) {
    const id = `casa-${String(n).padStart(3, "0")}`;
    lote.set(db.doc(`condominiums/${CONDOMINIO_DEMO.id}/units/${id}`), {
      rotulo: `Casa ${n}`,
      numero: n,
      quadra: null,
      status: "ativa",
      demo: true,
    });
  }

  for (const u of Object.values(USUARIOS_DEMO)) {
    await auth.deleteUser(u.uid).catch(() => undefined);
    await auth.createUser({ uid: u.uid, displayName: u.nome });

    lote.set(db.doc(`users/${u.uid}`), {
      nome: u.nome,
      condominioIds: [CONDOMINIO_DEMO.id],
      condominioAtivo: CONDOMINIO_DEMO.id,
      demo: true,
    });
    lote.set(db.doc(`condominiums/${CONDOMINIO_DEMO.id}/members/${u.uid}`), {
      nome: u.nome,
      papel: u.papel,
      unitId: u.unitId,
      status: "ativo",
      permissoesExtras: [],
      permissoesNegadas: [],
      demo: true,
      criadoEm: agora,
    });
  }

  await lote.commit();
  console.log(`Dados de demonstração prontos: ${CONDOMINIO_DEMO.nome}, 5 casas e 4 perfis.`);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
