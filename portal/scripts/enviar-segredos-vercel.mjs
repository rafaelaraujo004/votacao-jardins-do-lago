/**
 * Envia para a Vercel os 3 segredos do portal, lendo do .env.production.local,
 * SEM mostrar os valores na tela:
 *   - FIREBASE_PRIVATE_KEY    (chave do servidor do Firebase)
 *   - PORTARIA_SEGREDO_CODIGO (segredo dos códigos de visitante)
 *   - CRON_SECRET             (senha da rotina de reserva da votação, /api/eleicoes/finalizar:
 *                              com ela, só a própria Vercel consegue chamar a rotina)
 *
 * O CRON_SECRET não precisa ser criado à mão: se ainda não existir no .env.production.local,
 * o script sorteia um (48 caracteres, crypto) e grava no arquivo, para mandar sempre o mesmo.
 * Os outros dois continuam obrigatórios no arquivo (a chave vem do Firebase; trocar o segredo
 * da portaria invalida os códigos de visitante já gerados).
 *
 * Depois de enviar, faça um novo deploy (Vercel → Deployments → Redeploy): a variável só vale
 * nos deploys feitos depois dela.
 *
 * Uso (na pasta portal):  node scripts/enviar-segredos-vercel.mjs
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const ARQUIVO = ".env.production.local";
let texto = readFileSync(ARQUIVO, "utf8");
function ler(nome) {
  const m = texto.match(new RegExp(`^${nome}=(.*)$`, "m"));
  let v = m ? m[1].trim() : "";
  // A chave foi guardada entre aspas com "\n" escrito: volta a ter quebras de linha de verdade.
  if (v.startsWith('"')) v = JSON.parse(v);
  return v;
}

// CRON_SECRET: sorteia e guarda no arquivo se ainda não existir (só letras, números, - e _).
if (!ler("CRON_SECRET")) {
  const novo = randomBytes(36).toString("base64url");
  const vazia = /^CRON_SECRET=[ \t]*(?=\r?$)/m;
  if (vazia.test(texto)) {
    // Linha "CRON_SECRET=" já existe, vazia: preenche no mesmo lugar.
    writeFileSync(ARQUIVO, texto.replace(vazia, `CRON_SECRET=${novo}`));
  } else {
    const quebra = texto.length && !texto.endsWith("\n") ? "\n" : "";
    appendFileSync(ARQUIVO, `${quebra}# Senha da rotina de reserva da votação (gerada por scripts/enviar-segredos-vercel.mjs)\nCRON_SECRET=${novo}\n`);
  }
  texto = readFileSync(ARQUIVO, "utf8");
  console.log(`CRON_SECRET: não existia; criei um novo e guardei no ${ARQUIVO}`);
}

for (const nome of ["FIREBASE_PRIVATE_KEY", "PORTARIA_SEGREDO_CODIGO", "CRON_SECRET"]) {
  const valor = ler(nome);
  if (!valor) {
    console.error(`${nome} está vazio no ${ARQUIVO}.`);
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
