/**
 * DIAGNÓSTICO (só leitura) da votação oficial no Firebase real.
 * Mostra, para o condomínio real e o de demonstração: as eleições (situação e datas),
 * as últimas ações da votação na auditoria e quem está ligado à casa pedida.
 * Não grava nada e não mostra nomes nem telefones de moradores.
 *
 * Uso:  npx tsx scripts/diagnostico-votacao.ts --casa 144
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, type Timestamp } from "firebase-admin/firestore";

const { values } = parseArgs({ options: { casa: { type: "string" } } });
const ARQUIVO_ENV = path.resolve(import.meta.dirname, "..", ".env.production.local");
if (existsSync(ARQUIVO_ENV)) process.loadEnvFile?.(ARQUIVO_ENV);
const projectId = process.env.FIREBASE_PROJECT_ID ?? "";
if (!projectId || process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Configure o Firebase real (.env.production.local) e desligue o simulador.");
  process.exit(1);
}
initializeApp({
  projectId,
  credential: cert({
    projectId,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();
const hora = (t: unknown) =>
  t && typeof (t as Timestamp).toDate === "function"
    ? (t as Timestamp).toDate().toLocaleString("pt-BR", { timeZone: "America/Belem" })
    : "—";

async function main() {
  console.log(`\nProjeto ${projectId} · agora ${new Date().toLocaleString("pt-BR", { timeZone: "America/Belem" })}`);
  for (const c of ["jardins-do-lago", "jardins-do-lago-demo"]) {
    const ref = db.collection("condominiums").doc(c);
    console.log(`\n=== ${c} ===`);
    const eleicoes = await ref.collection("elections").get();
    console.log(`Eleições: ${eleicoes.size}`);
    for (const d of eleicoes.docs) {
      const e = d.data();
      console.log(
        `  • ${d.id} | "${e.titulo}" | status=${e.status} | modo=${e.modo} | abre ${hora(e.abreEm)} | fecha ${hora(e.fechaEm)} | casasAptas=${e.casasAptas ?? "—"} | publicadaEm ${hora(e.publicadaEm)} | candidatos=${Array.isArray(e.candidatos) ? e.candidatos.length : "?"}`,
      );
    }
    const logs = await ref.collection("auditLogs").where("acao", ">=", "eleicao.").where("acao", "<", "eleicao/").get();
    const ultimos = logs.docs
      .map((d) => d.data())
      .sort((a, b) => (b.criadoEm?.toMillis?.() ?? 0) - (a.criadoEm?.toMillis?.() ?? 0))
      .slice(0, 8);
    console.log(`Auditoria da votação (últimas ${ultimos.length}):`);
    for (const l of ultimos) console.log(`  - ${hora(l.criadoEm)} | ${l.acao} | ${l.alvo} | papel=${l.papel ?? "script"}`);
    if (values.casa) {
      const unitId = `casa-${String(Number(values.casa)).padStart(3, "0")}`;
      const unidade = await ref.collection("units").doc(unitId).get();
      const membros = await ref.collection("members").where("unitId", "==", unitId).get();
      console.log(`Casa ${values.casa} (${unitId}): ${unidade.exists ? `status=${unidade.get("status")}` : "não existe"} · ${membros.size} acesso(s) ligado(s): ${membros.docs.map((m) => `papel=${m.get("papel")} ativo=${m.get("ativo") ?? "?"}`).join("; ") || "nenhum"}`);
    }
  }
  console.log("\n(Só leitura: nada foi alterado.)\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
