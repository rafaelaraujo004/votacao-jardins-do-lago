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
  // Uma linha de comando só (sem lista de argumentos): é o jeito que funciona no Windows.
  // O valor vai pela entrada padrão, nunca na linha de comando.
  const r = spawnSync(`npx --yes vercel@latest env add ${nome} --environment production --sensitive --force`, {
    input: valor,
    encoding: "utf8",
    shell: true,
  });
  if (r.status === 0) console.log(`${nome}: enviado`);
  else {
    const linhas = [r.stderr ?? "", r.stdout ?? ""].join("\n").split("\n");
    const motivo = linhas.filter((l) => /error|erro|!/i.test(l)).slice(-3).join(" | ");
    console.log(`${nome}: falhou — ${motivo || "sem detalhe"}`);
  }
}
