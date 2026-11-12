/**
 * Firebase Admin SDK — SÓ NO SERVIDOR.
 *
 * ATENÇÃO: o Admin SDK ignora as regras do Firestore. Por isso nenhum código
 * fora de `src/server/` deve acessar o banco, e todo acesso aqui dentro
 * começa pelo contexto do usuário (veja contexto.ts).
 */
import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAppCheck } from "firebase-admin/app-check";

export function usaEmuladores(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
}

function app(): App {
  const existente = getApps()[0];
  if (existente) return existente;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Configure FIREBASE_PROJECT_ID (veja o README do portal).");

  if (usaEmuladores()) {
    if (process.env.VERCEL_ENV === "production") {
      throw new Error("Simulador configurado em produção: remova *_EMULATOR_HOST das variáveis da Vercel.");
    }
    return initializeApp({ projectId });
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) {
    throw new Error("Configure FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY (veja o README do portal).");
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
}

export const adminAuth = () => getAuth(app());
export const adminDb = () => getFirestore(app());
export const adminAppCheck = () => getAppCheck(app());
