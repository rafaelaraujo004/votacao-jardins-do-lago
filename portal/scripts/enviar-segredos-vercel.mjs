/**
 * Envia para a Vercel os 2 segredos do portal, lendo do .env.production.local,
 * SEM mostrar os valores na tela:
 *   - FIREBASE_PRIVATE_KEY    (chave do servidor do Firebase)
 *   - PORTARIA_SEGREDO_CODIGO (segredo dos códigos de visitante)
 *
 * Uso (na pasta portal):  node scripts/enviar-segredos-vercel.mjs
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const texto = readFileSync(".env.production.local", "utf8");
function ler(nome) {
  const m = texto.match(new RegExp(`^${nome}=(.*)$`, "m"));
  let v = m ? m[1].trim() : "";
  // A chave foi guardada entre aspas com "\n" escrito: volta a ter quebras de linha de verdade.
  if (v.startsWith('"')) v = JSON.parse(v);
  return v;
}

for (const nome of ["FIREBASE_PRIVATE_KEY", "PORTARIA_SEGREDO_CODIGO"]) {
  const valor = ler(nome);
  if (!valor) {
    console.error(`${nome} está vazio no .env.production.local.`);
    process.exitCode = 1;
    continue;
  }
  const r = spawnSync("npx", ["--yes", "vercel@latest", "env", "add", nome, "production", "--sensitive", "--force"], {
    input: valor,
    encoding: "utf8",
    shell: true,
  });
  console.log(`${nome}: ${r.status === 0 ? "enviado" : "falhou (rode de novo ou cadastre no painel da Vercel)"}`);
}
