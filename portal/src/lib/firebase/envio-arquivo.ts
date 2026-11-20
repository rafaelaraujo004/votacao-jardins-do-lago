/**
 * Envio de ARQUIVO (documento ou foto) direto do navegador para o Firebase Storage.
 *
 * Usa um "app" do Firebase separado só para isso: entra com a autorização de
 * uso único que o servidor gerou (vale só para criar aquele arquivo, naquele
 * caminho), manda o arquivo e sai. O login de verdade do portal continua sendo
 * o cookie do servidor; nada disso fica guardado no navegador.
 */
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, inMemoryPersistence, setPersistence, signInWithCustomToken, signOut } from "firebase/auth";
import { connectStorageEmulator, getStorage, ref, uploadBytesResumable } from "firebase/storage";

const NOME_APP = "envio-documentos";
const usaEmulador = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

function balde(): string {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`
  );
}

let emuladoresLigados = false;

function appDeEnvio(): FirebaseApp {
  const existente = getApps().find((a) => a.name === NOME_APP);
  if (existente) return existente;
  return initializeApp(
    {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || undefined,
      storageBucket: balde(),
    },
    NOME_APP,
  );
}

/**
 * Manda o arquivo (ou a foto já reduzida) para o caminho autorizado.
 * `aoProgredir` recebe de 0 a 100. Lança erro com mensagem em português se algo der errado.
 * Um envio por vez: a autorização de uso único é trocada a cada arquivo.
 */
export async function enviarComPermissao(
  arquivo: Blob,
  tipo: string,
  permissao: { caminho: string; token: string },
  aoProgredir: (porcento: number) => void,
): Promise<void> {
  const app = appDeEnvio();
  const auth = getAuth(app);
  const storage = getStorage(app);
  if (usaEmulador && !emuladoresLigados) {
    connectAuthEmulator(auth, process.env.NEXT_PUBLIC_AUTH_EMULATOR_URL ?? "http://127.0.0.1:9099", { disableWarnings: true });
    connectStorageEmulator(storage, "127.0.0.1", Number(process.env.NEXT_PUBLIC_STORAGE_EMULATOR_PORT ?? 9199));
    emuladoresLigados = true;
  }
  await setPersistence(auth, inMemoryPersistence);
  await signInWithCustomToken(auth, permissao.token);
  try {
    await new Promise<void>((resolve, reject) => {
      const tarefa = uploadBytesResumable(ref(storage, permissao.caminho), arquivo, { contentType: tipo });
      tarefa.on(
        "state_changed",
        (s) => aoProgredir(s.totalBytes ? Math.round((s.bytesTransferred / s.totalBytes) * 100) : 0),
        (erro) => reject(new Error(`O envio falhou (${erro.code}). Confira a internet e tente de novo.`)),
        () => resolve(),
      );
    });
  } finally {
    await signOut(auth).catch(() => undefined);
  }
}

/** Arquivo de documento (PDF, foto, Word, Excel). */
export async function enviarArquivoDocumento(
  arquivo: File,
  permissao: { caminho: string; token: string },
  aoProgredir: (porcento: number) => void,
): Promise<void> {
  return enviarComPermissao(arquivo, arquivo.type, permissao, aoProgredir);
}
