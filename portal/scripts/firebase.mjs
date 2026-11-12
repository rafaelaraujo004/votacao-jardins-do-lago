/**
 * Roda o Firebase CLI do projeto garantindo o Java 21+ (exigido pelos simuladores).
 * No Windows, procura o JDK do Eclipse Adoptium e o coloca na frente do PATH,
 * mesmo que o terminal ainda não tenha sido reaberto depois da instalação.
 *
 * Uso: node scripts/firebase.mjs <comando do firebase>
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const pastaAdoptium = "C:\\Program Files\\Eclipse Adoptium";
if (process.platform === "win32" && existsSync(pastaAdoptium)) {
  const jdk = readdirSync(pastaAdoptium)
    .filter((nome) => /^jdk-(2[1-9]|[3-9]\d)/.test(nome))
    .sort()
    .pop();
  if (jdk) {
    process.env.JAVA_HOME = path.join(pastaAdoptium, jdk);
    process.env.PATH = path.join(process.env.JAVA_HOME, "bin") + path.delimiter + process.env.PATH;
  }
}

// O Java não consegue criar "sockets" locais quando a pasta temporária tem acento
// (ex.: C:\Users\Rafael Araújo\...). O Node pode até mostrar o nome curto (RAFAEL~1),
// mas o Java usa o nome longo; por isso, no Windows, sempre usamos uma pasta sem acento.
if (process.platform === "win32" && /[^\x20-\x7e]/.test(os.homedir() + os.tmpdir())) {
  const pastaSemAcento = "C:\\Users\\Public\\jardins-do-lago-tmp";
  mkdirSync(pastaSemAcento, { recursive: true });
  const opcao = `-Djdk.net.unixdomain.tmpdir=${pastaSemAcento} -Djava.io.tmpdir=${pastaSemAcento}`;
  process.env.JAVA_TOOL_OPTIONS = [process.env.JAVA_TOOL_OPTIONS, opcao].filter(Boolean).join(" ");
}

const cli = path.join(import.meta.dirname, "..", "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
const processo = spawn(process.execPath, [cli, ...process.argv.slice(2)], { stdio: "inherit" });
processo.on("exit", (codigo) => process.exit(codigo ?? 1));
