/**
 * Marca casas como INATIVAS no condomínio REAL (ex.: números que não são casas, como um
 * lote sem construção) e recalcula as "casas aptas" das eleições publicadas que ainda não
 * encerraram — o mesmo cálculo do "Bloquear casas" da comissão (ativas − bloqueadas).
 * Nada é apagado: dá para reativar a casa depois em Unidades.
 *
 * Recusa se alguma dessas casas tiver alguém cadastrado (morador ou equipe) ou já tiver votado.
 *
 * Uso (na pasta portal, com as credenciais do .env.production.local):
 *   npx tsx scripts/inativar-casas.ts --casas 194-198 --motivo "Lote sem casa" --conferir
 *   npx tsx scripts/inativar-casas.ts --casas 194-198 --motivo "Lote sem casa"
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { faixasDeCasas } from "../src/lib/importar-moradores";
import { situacaoEleicao, type StatusEleicao } from "../src/lib/eleicoes";

const { values } = parseArgs({
  options: { id: { type: "string" }, casas: { type: "string" }, motivo: { type: "string" }, conferir: { type: "boolean" } },
});
const ID = values.id ?? "jardins-do-lago";
const SO_CONFERIR = values.conferir === true;
const MOTIVO = (values.motivo ?? "").trim().slice(0, 300);
const QUEM = { uid: "script:inativar-casas", nome: "Ajuste do cadastro de casas (a pedido da administração)" };

function falhar(mensagem: string): never {
  console.error(`\n✖ ${mensagem}\n`);
  process.exit(1);
}

/** "194-198,201" → [194,195,196,197,198,201] */
function lerNumeros(texto: string): number[] {
  const nums = new Set<number>();
  for (const parte of texto.split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = parte.match(/^(\d{1,4})(?:-(\d{1,4}))?$/);
    if (!m) falhar(`Não entendi "${parte}". Use números e faixas, ex.: 194-198,201`);
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (b < a || b - a > 50) falhar(`Faixa inválida: ${parte}`);
    for (let n = a; n <= b; n++) nums.add(n);
  }
  return [...nums].sort((x, y) => x - y);
}

if (!values.casas) falhar('Informe as casas: --casas 194-198');
if (!MOTIVO) falhar('Informe o motivo (vai na observação da casa): --motivo "Lote sem casa"');
const NUMEROS = lerNumeros(values.casas);

if (process.env.FIRESTORE_EMULATOR_HOST) falhar("Este script é para o Firebase REAL; desligue o simulador (FIRESTORE_EMULATOR_HOST).");
const ARQUIVO_ENV = path.resolve(import.meta.dirname, "..", ".env.production.local");
if (existsSync(ARQUIVO_ENV)) process.loadEnvFile?.(ARQUIVO_ENV);
const projectId = process.env.FIREBASE_PROJECT_ID ?? "";
if (!projectId || projectId.startsWith("demo-")) falhar("Configure o Firebase real (.env.production.local).");
initializeApp({
  projectId,
  credential: cert({
    projectId,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();

async function main() {
  const cond = db.collection("condominiums").doc(ID);
  if (!(await cond.get()).exists) falhar(`O condomínio "${ID}" não existe.`);

  const resultado = await db.runTransaction(async (tx) => {
    const agora = new Date();
    const unidades = await tx.get(cond.collection("units"));
    const porNumero = new Map(unidades.docs.map((d) => [Number(d.get("numero")), d]));
    const alvos = NUMEROS.map((n) => porNumero.get(n) ?? falhar(`A casa ${n} não existe no cadastro.`));
    const idsAlvo = new Set(alvos.map((d) => d.id));

    // Nenhuma dessas casas pode ter alguém cadastrado (morador ou equipe ligada à casa).
    const moradores = await tx.get(cond.collection("members"));
    const casasComMorador = moradores.docs
      .filter((m) => idsAlvo.has(String(m.get("unitId"))))
      .map((m) => Number(alvos.find((a) => a.id === m.get("unitId"))?.get("numero")));
    if (casasComMorador.length) falhar(`Casa ${faixasDeCasas(casasComMorador)} tem pessoa cadastrada: confira antes de inativar.`);

    // Eleições publicadas que ainda não encerraram: nenhuma dessas casas pode ter votado.
    const eleicoes = await tx.get(cond.collection("elections").where("status", "==", "publicada"));
    const abertas = eleicoes.docs.filter((e) => {
      const st = e.get("status") as StatusEleicao;
      const abreEm = e.get("abreEm")?.toDate?.() as Date | undefined;
      const fechaEm = e.get("fechaEm")?.toDate?.() as Date | undefined;
      return abreEm && fechaEm && situacaoEleicao({ status: st, abreEm, fechaEm }, agora) !== "encerrada";
    });
    for (const e of abertas) {
      const votos = await tx.getAll(...alvos.map((a) => e.ref.collection("votantes").doc(a.id)));
      const votaram = votos.filter((v) => v.exists).map((v) => Number(alvos.find((a) => a.id === v.id)?.get("numero")));
      if (votaram.length) falhar(`Casa ${faixasDeCasas(votaram)} já votou em "${e.get("titulo")}": não dá para inativar.`);
    }

    const jaInativas = alvos.filter((a) => a.get("status") === "inativa").map((a) => Number(a.get("numero")));
    const mudar = alvos.filter((a) => a.get("status") !== "inativa");
    const ativasDepois = unidades.docs.filter((d) => d.get("status") !== "inativa" && !idsAlvo.has(d.id)).length;
    const novasAptas = abertas.map((e) => {
      const bloqueadas = new Set<string>(Array.isArray(e.get("casasBloqueadas")) ? (e.get("casasBloqueadas") as string[]) : []);
      const aptasIds = unidades.docs
        .filter((d) => d.get("status") !== "inativa" && !idsAlvo.has(d.id) && !bloqueadas.has(d.id))
        .map((d) => d.id)
        .sort();
      return { e, antes: Number(e.get("casasAptas") ?? 0), aptas: aptasIds.length, aptasIds };
    });

    console.log(`\nProjeto ${projectId} · condomínio ${ID}`);
    console.log(`Casas: ${unidades.size} no cadastro · ficam ativas: ${ativasDepois}`);
    console.log(`Inativar agora: ${mudar.length ? faixasDeCasas(mudar.map((a) => Number(a.get("numero")))) : "nenhuma"}${jaInativas.length ? ` (já estavam inativas: ${faixasDeCasas(jaInativas)})` : ""} · observação: "${MOTIVO}"`);
    for (const x of novasAptas) console.log(`Eleição "${x.e.get("titulo")}": casas aptas ${x.antes} → ${x.aptas}`);
    if (SO_CONFERIR) return { gravou: false };

    for (const a of mudar) {
      tx.update(a.ref, { status: "inativa", observacao: MOTIVO, atualizadoEm: FieldValue.serverTimestamp(), atualizadoPor: QUEM.uid });
      tx.create(cond.collection("auditLogs").doc(), {
        condominioId: ID,
        uid: QUEM.uid,
        nome: QUEM.nome,
        papel: "admin",
        acao: "unidade.alterar",
        alvo: `units/${a.id}`,
        detalhes: { rotulo: String(a.get("rotulo") ?? a.id), statusAntes: String(a.get("status") ?? ""), status: "inativa", observacao: MOTIVO },
        criadoEm: FieldValue.serverTimestamp(),
      });
    }
    for (const x of novasAptas) {
      if (x.antes === x.aptas) continue;
      tx.update(x.e.ref, {
        casasAptas: x.aptas,
        // Lista congelada das casas aptas (eleições publicadas a partir de 21/11/2026): acompanha.
        ...(Array.isArray(x.e.get("casasAptasIds")) ? { casasAptasIds: x.aptasIds } : {}),
        atualizadoEm: FieldValue.serverTimestamp(),
        atualizadoPor: QUEM.uid,
      });
      tx.create(cond.collection("auditLogs").doc(), {
        condominioId: ID,
        uid: QUEM.uid,
        nome: QUEM.nome,
        papel: "admin",
        acao: "eleicao.bloqueio",
        alvo: `elections/${x.e.id}`,
        detalhes: { titulo: String(x.e.get("titulo") ?? ""), casasAptas: x.aptas, motivo: `Casas inativas: ${faixasDeCasas(NUMEROS)} (${MOTIVO})` },
        criadoEm: FieldValue.serverTimestamp(),
      });
    }
    // Sinais: as telas abertas (Unidades, Pessoas, Votação) se atualizam sozinhas.
    tx.set(cond.collection("sistema").doc("sinais"), { pessoas: FieldValue.serverTimestamp(), eleicoes: FieldValue.serverTimestamp() }, { merge: true });
    return { gravou: true, casas: mudar.length };
  });

  console.log(resultado.gravou ? `\n✔ Gravado: ${resultado.casas} casa(s) inativada(s).\n` : "\n(só conferência: nada foi gravado)\n");
}

main().catch((e) => falhar(e instanceof Error ? e.message : String(e)));
