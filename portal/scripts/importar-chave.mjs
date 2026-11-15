/**
 * Guarda a chave do servidor (conta de serviço do Firebase) no .env.production.local
 * SEM mostrar a chave na tela.
 *
 * Uso (na pasta portal):
 *   node scripts/importar-chave.mjs "C:\Users\...\Downloads\jardim-do-lago-af4b3-firebase-adminsdk-xxxx.json"
 *
 * Depois de rodar, APAGUE o arquivo .json baixado (a chave já está guardada).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const caminho = process.argv[2];
if (!caminho || !existsSync(caminho)) {
  console.error('Informe o arquivo .json baixado. Ex.: node scripts/importar-chave.mjs "C:\\Users\\voce\\Downloads\\chave.json"');
  process.exit(1);
}

const chave = JSON.parse(readFileSync(caminho, "utf8"));
if (chave.type !== "service_account" || !chave.private_key || !chave.client_email) {
  console.error("Esse arquivo não parece ser uma chave de conta de serviço do Firebase.");
  process.exit(1);
}

const destino = ".env.production.local";
let texto = existsSync(destino) ? readFileSync(destino, "utf8") : "";

function definir(nome, valor) {
  const linha = `${nome}=${valor}`;
  const regra = new RegExp(`^${nome}=.*$`, "m");
  texto = regra.test(texto) ? texto.replace(regra, () => linha) : `${texto.trimEnd()}\n${linha}\n`;
}

definir("FIREBASE_PROJECT_ID", chave.project_id);
definir("FIREBASE_CLIENT_EMAIL", chave.client_email);
// A chave tem quebras de linha; guardamos com "\n" escrito, entre aspas (o portal converte de volta).
definir("FIREBASE_PRIVATE_KEY", JSON.stringify(chave.private_key));

writeFileSync(destino, texto);
console.log(`Chave do projeto ${chave.project_id} guardada em ${destino}.`);
console.log("Agora apague o arquivo .json baixado.");
