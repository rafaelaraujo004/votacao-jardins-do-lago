/**
 * Cria um condomínio e o primeiro administrador (síndico) — USO REAL.
 * Não existe cadastro público: este é o único jeito de nascer o primeiro admin.
 *
 * Jeito 1 (recomendado) — o script cria a conta do síndico com e-mail e senha provisória:
 *   npm run criar-condominio -- --id jardins-do-lago --nome "Residencial Jardins do Lago" --admin-email "sindico@exemplo.com" --admin-nome "José da Silva"
 *   A senha provisória vai para o arquivo portal/.acesso-inicial.txt (NUNCA aparece na tela).
 *   No primeiro acesso o portal obriga a trocar a senha. Depois disso, APAGUE o arquivo.
 *
 * Jeito 2 — a conta já existe no Firebase Authentication:
 *   npm run criar-condominio -- --id jardins-do-lago --nome "Residencial Jardins do Lago" --admin-uid <UID>
 *
 * As credenciais do Admin SDK vêm do .env.local (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).
 */
import { parseArgs } from "node:util";
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { esquemaEmail, gerarSenhaProvisoria, mascararEmail } from "../src/lib/senha";

process.loadEnvFile?.(".env.local");

/** Arquivo LOCAL com o acesso inicial (está no .gitignore). */
const ARQUIVO_ACESSO = path.resolve(import.meta.dirname, "..", ".acesso-inicial.txt");

const { values } = parseArgs({
  options: {
    id: { type: "string" },
    nome: { type: "string" },
    "admin-uid": { type: "string" },
    "admin-email": { type: "string" },
    "admin-nome": { type: "string" },
  },
});

const id = values.id ?? "";
const nome = values.nome ?? "";
const adminUidInformado = values["admin-uid"] ?? "";
const emailBruto = values["admin-email"] ?? "";
const adminNome = (values["admin-nome"] ?? "").trim();

function uso(mensagem: string): never {
  console.error(mensagem);
  console.error("");
  console.error("Uso (cria a conta do síndico):");
  console.error('  npm run criar-condominio -- --id jardins-do-lago --nome "Residencial Jardins do Lago" --admin-email "sindico@exemplo.com" --admin-nome "José da Silva"');
  console.error("Ou, se a conta já existe no Firebase Authentication:");
  console.error('  npm run criar-condominio -- --id jardins-do-lago --nome "Residencial Jardins do Lago" --admin-uid <UID>');
  console.error("O id usa só letras minúsculas, números e hífen.");
  process.exit(1);
}

if (!/^[a-z0-9-]{3,40}$/.test(id) || nome.trim().length < 3) uso("Confira --id e --nome.");
if (Boolean(adminUidInformado) === Boolean(emailBruto)) uso("Informe --admin-uid OU --admin-email (um dos dois).");

let adminEmail = "";
if (emailBruto) {
  const r = esquemaEmail.safeParse(emailBruto);
  if (!r.success) uso("O --admin-email parece incompleto.");
  adminEmail = r.data;
  if (adminNome.length < 3 || adminNome.length > 80) uso("Informe --admin-nome com o nome completo do síndico.");
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

/** Texto do arquivo de acesso inicial. A senha só existe aqui. */
function textoDoArquivo(email: string, senha: string): string {
  return [
    "ACESSO INICIAL DO SÍNDICO — Portal Jardins do Lago",
    "",
    `Condomínio: ${nome} (${id})`,
    `E-mail:     ${email}`,
    `Senha provisória: ${senha}`,
    "",
    "1. Entre no portal com este e-mail e esta senha.",
    "2. O portal vai pedir para criar uma senha nova (mínimo 10 caracteres).",
    "3. Depois de trocar, APAGUE ESTE ARQUIVO. Não envie por e-mail nem coloque no GitHub.",
    "",
  ].join("\n");
}

async function main() {
  const db = getFirestore();
  const condominio = db.doc(`condominiums/${id}`);
  if ((await condominio.get()).exists) throw new Error(`O condomínio "${id}" já existe.`);

  let usuario: UserRecord;
  let criadoAgora = false;
  let validaDesde: number | null = null;

  if (adminEmail) {
    // Não reaproveita conta existente: evita trocar a senha de alguém sem querer.
    const existente = await getAuth()
      .getUserByEmail(adminEmail)
      .catch(() => null);
    if (existente) {
      throw new Error("Já existe uma conta com este e-mail. Use --admin-uid com o UID dela (Console do Firebase > Authentication).");
    }
    const senha = gerarSenhaProvisoria();
    usuario = await getAuth().createUser({ email: adminEmail, password: senha, displayName: adminNome });
    criadoAgora = true;
    validaDesde = Date.parse(usuario.tokensValidAfterTime ?? "") || Date.now();
    try {
      // "mode 0o600": só o dono do computador lê (no Windows vale a pasta do usuário).
      writeFileSync(ARQUIVO_ACESSO, textoDoArquivo(adminEmail, senha), { encoding: "utf8", mode: 0o600 });
    } catch (e) {
      await getAuth().deleteUser(usuario.uid).catch(() => undefined);
      throw e;
    }
  } else {
    usuario = await getAuth().getUser(adminUidInformado); // falha se a conta não existir
  }

  const adminUid = usuario.uid;
  const nomeAdmin = adminNome || usuario.displayName || usuario.email || "Administrador";

  try {
    await db.runTransaction(async (tx) => {
      if ((await tx.get(condominio)).exists) throw new Error(`O condomínio "${id}" já existe.`);
      const userRef = db.doc(`users/${adminUid}`);
      const user = await tx.get(userRef);

      tx.create(condominio, { nome, status: "ativo", fuso: "America/Belem", moeda: "BRL", criadoEm: FieldValue.serverTimestamp() });
      tx.create(condominio.collection("members").doc(adminUid), {
        nome: nomeAdmin,
        papel: "admin",
        unitId: null,
        status: "ativo",
        permissoesExtras: [],
        permissoesNegadas: [],
        // Conta criada aqui: a senha é provisória e precisa ser trocada no 1º acesso.
        ...(criadoAgora
          ? { precisaTrocarSenha: true, senhaProvisoriaValidaDesde: validaDesde, senhaProvisoriaEm: FieldValue.serverTimestamp() }
          : {}),
        criadoEm: FieldValue.serverTimestamp(),
      });
      tx.set(
        userRef,
        {
          nome: nomeAdmin,
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
        detalhes: { adminUid, ...(criadoAgora ? { adminEmail: mascararEmail(adminEmail) } : {}) },
        criadoEm: FieldValue.serverTimestamp(),
      });
    });
  } catch (e) {
    // Desfaz a conta e o arquivo criados agora, para poder rodar de novo.
    if (criadoAgora) {
      await getAuth().deleteUser(adminUid).catch(() => undefined);
      rmSync(ARQUIVO_ACESSO, { force: true });
    }
    throw e;
  }

  console.log(`Condomínio "${nome}" criado com o administrador ${usuario.email ?? adminUid}.`);
  if (criadoAgora) {
    // A senha NUNCA é impressa: só o lugar do arquivo.
    console.log(`A senha provisória foi gravada em: ${ARQUIVO_ACESSO}`);
    console.log("Entregue ao síndico com cuidado e APAGUE o arquivo depois que ele trocar a senha.");
  }
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
