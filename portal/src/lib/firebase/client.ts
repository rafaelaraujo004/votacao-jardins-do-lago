/**
 * Firebase no NAVEGADOR.
 * Usado apenas para autenticar (provar quem é a pessoa). Depois do login,
 * o navegador troca o token por um cookie de sessão seguro no servidor.
 */
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  inMemoryPersistence,
  setPersistence,
  type Auth,
} from "firebase/auth";
import { initializeAppCheck, ReCaptchaV3Provider, getToken, type AppCheck } from "firebase/app-check";

const usaEmulador = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || undefined,
};

let auth: Auth | null = null;
let appCheck: AppCheck | null = null;

function app(): FirebaseApp {
  if (!config.apiKey || !config.projectId) {
    throw new Error("Firebase não configurado: confira NEXT_PUBLIC_FIREBASE_* no .env.local.");
  }
  return getApps()[0] ?? initializeApp(config);
}

export async function firebaseAuth(): Promise<Auth> {
  if (auth) return auth;
  const a = getAuth(app());
  if (usaEmulador) {
    connectAuthEmulator(a, process.env.NEXT_PUBLIC_AUTH_EMULATOR_URL ?? "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
  }
  // A sessão de verdade é o cookie do servidor; o navegador não guarda o login.
  await setPersistence(a, inMemoryPersistence);
  auth = a;
  return a;
}

/** Liga o App Check (reCAPTCHA) quando a chave do site estiver configurada. */
function iniciarAppCheck(): AppCheck | null {
  const chave = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (!chave || usaEmulador) return null;
  if (!appCheck) {
    appCheck = initializeAppCheck(app(), {
      provider: new ReCaptchaV3Provider(chave),
      isTokenAutoRefreshEnabled: true,
    });
  }
  return appCheck;
}

/** Cabeçalhos para pedidos ao nosso servidor (inclui o token do App Check, se houver). */
export async function cabecalhosSeguros(): Promise<Record<string, string>> {
  const cabecalhos: Record<string, string> = { "Content-Type": "application/json" };
  const ac = iniciarAppCheck();
  if (ac) {
    const { token } = await getToken(ac, false);
    cabecalhos["X-Firebase-AppCheck"] = token;
  }
  return cabecalhos;
}
