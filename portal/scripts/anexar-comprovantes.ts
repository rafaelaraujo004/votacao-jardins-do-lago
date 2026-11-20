/**
 * Anexa comprovantes (PDF/foto) a lançamentos de UM MÊS a partir de uma lista em JSON — o mesmo
 * que o botão "Anexar comprovante" da tela "Prestação de contas": o arquivo vai para o Storage
 * (condominiums/{id}/finance/{envio}/{nome}) e o comprovante entra no lançamento com auditoria.
 *
 * Arquivo de entrada (fora do git: comprovantes têm dados pessoais e o repositório é público):
 *   { "mes": "2026-10", "comprovantes": [ { "descricao": "Gasolina para serviços em geral", "arquivo": "C:/.../gasolina.pdf" } ] }
 * "descricao" precisa ser IGUAL à do lançamento no portal (um só lançamento valendo no mês).
 * Rodar de novo não duplica: arquivo com o mesmo nome já anexado ao lançamento é pulado.
 *
 * Uso (na pasta portal):
 *   Simulador:  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 npx tsx scripts/anexar-comprovantes.ts --arquivo anexos.json --id jardins-do-lago-demo
 *   Real:       npx tsx scripts/anexar-comprovantes.ts --arquivo anexos.json --conferir   (só mostra o plano)
 *               npx tsx scripts/anexar-comprovantes.ts --arquivo anexos.json
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { lerComprovantes, MAXIMO_COMPROVANTES, pastaComprovantes, TAMANHO_MAXIMO_COMPROVANTE } from "../src/lib/comprovantes";
import { nomeArquivoSeguro } from "../src/lib/documentos";
import { REGEX_MES } from "../src/lib/financeiro";
import { formatarMoeda } from "../src/lib/formato";

const { values } = parseArgs({
  options: {
    arquivo: { type: "string" },
    id: { type: "string" },
    conferir: { type: "boolean" },
  },
});
const ID = values.id ?? "jardins-do-lago";
const SO_CONFERIR = values.conferir === true;
const SIMULADOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const QUEM = { uid: "script:anexar-comprovantes", nome: "Comprovantes anexados a pedido da administração", papel: "admin" };
const TIPOS: Record<string, string> = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function falhar(mensagem: string): never {
  console.error(`\n✖ ${mensagem}\n`);
  process.exit(1);
}

// ---- Lê e confere a lista (antes de tocar no banco) ----
if (!values.arquivo) falhar("Informe a lista: --arquivo anexos.json");
const lista = JSON.parse(readFileSync(path.resolve(values.arquivo), "utf8")) as { mes: string; comprovantes: { descricao: string; arquivo: string }[] };
if (!REGEX_MES.test(lista.mes)) falhar(`Mês inválido: ${lista.mes}`);
const itens = lista.comprovantes.map((c, i) => {
  const onde = `item ${i + 1} ("${c.descricao}")`;
  if (!existsSync(c.arquivo)) falhar(`Arquivo não encontrado em ${onde}: ${c.arquivo}`);
  const tipo = TIPOS[path.extname(c.arquivo).toLowerCase()] ?? falhar(`Tipo não aceito em ${onde} (PDF, JPG, PNG ou WebP).`);
  const tamanho = statSync(c.arquivo).size;
  if (!(tamanho > 0) || tamanho > TAMANHO_MAXIMO_COMPROVANTE) falhar(`Tamanho inválido em ${onde} (até 20 MB).`);
  return { descricao: c.descricao.trim(), caminhoLocal: c.arquivo, nome: nomeArquivoSeguro(path.basename(c.arquivo)), tipo, tamanho };
});

// ---- Conecta (simulador ou Firebase real) ----
let projectId: string;
if (SIMULADOR) {
  projectId = "demo-jardins";
  initializeApp({ projectId });
} else {
  const ARQUIVO_ENV = path.resolve(import.meta.dirname, "..", ".env.production.local");
  if (existsSync(ARQUIVO_ENV)) process.loadEnvFile?.(ARQUIVO_ENV);
  projectId = process.env.FIREBASE_PROJECT_ID ?? "";
  if (!projectId || projectId.startsWith("demo-")) falhar("Configure o Firebase real (.env.production.local).");
  initializeApp({
    projectId,
    credential: cert({
      projectId,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore();
// Mesmo balde que o portal usa (src/server/firebase-admin.ts → nomeDoBalde).
const nomeBalde = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
const balde = getStorage().bucket(nomeBalde);

async function main() {
  const c = db.collection("condominiums").doc(ID);
  const mes = lista.mes;
  console.log(`\nProjeto ${projectId}${SIMULADOR ? " (SIMULADOR)" : ""} · condomínio ${ID} · mês ${mes} · balde ${nomeBalde}`);

  // O balde é o mesmo dos documentos que já funcionam no portal?
  // (O simulador não responde a "o balde existe?": lá os baldes existem implicitamente.)
  if (!SIMULADOR) {
    const [existe] = await balde.exists();
    if (!existe) falhar(`O balde ${nomeBalde} não existe.`);
  }
  const [docs] = await balde.getFiles({ prefix: `condominiums/${ID}/documents/`, maxResults: 5 });
  console.log(`  Balde ok (${docs.length ? "já tem arquivos de documentos do portal" : "sem documentos ainda"}).`);

  const snap = await c.collection("financialEntries").where("mes", "==", mes).get();
  const valendo = snap.docs.filter((d) => !d.get("estornadoPor") && !d.get("estornaId"));
  const plano = itens.map((item) => {
    const achados = valendo.filter((d) => d.get("descricao") === item.descricao);
    if (achados.length !== 1) falhar(`"${item.descricao}": ${achados.length === 0 ? "não achei esse lançamento" : `${achados.length} lançamentos com essa descrição`} em ${mes}.`);
    const d = achados[0];
    const ja = lerComprovantes(d.get("comprovantes"));
    return { item, ref: d.ref, valor: Number(d.get("valorCentavos")), ja: ja.some((x) => x.nome === item.nome), quantidade: ja.length };
  });
  // Mais de um arquivo para o mesmo lançamento conta junto no limite.
  const porLancamento = new Map<string, number>();
  for (const p of plano) {
    if (p.ja) continue;
    const n = (porLancamento.get(p.ref.id) ?? p.quantidade) + 1;
    if (n > MAXIMO_COMPROVANTES) falhar(`"${p.item.descricao}" passaria de ${MAXIMO_COMPROVANTES} comprovantes.`);
    porLancamento.set(p.ref.id, n);
  }

  for (const p of plano) {
    console.log(`  ${p.ja ? "já anexado, pula" : "anexar"} · ${p.item.descricao} (${formatarMoeda(p.valor)}) ← ${p.item.nome} (${Math.ceil(p.item.tamanho / 1024)} KB)`);
  }
  const fazer = plano.filter((p) => !p.ja);
  if (SO_CONFERIR || !fazer.length) return console.log(SO_CONFERIR ? "\n(Só conferência: nada foi gravado.)\n" : "\nNada a anexar.\n");

  for (const p of fazer) {
    const caminho = `${pastaComprovantes(ID)}${randomUUID()}/${p.item.nome}`;
    const arquivo = balde.file(caminho);
    await arquivo.save(readFileSync(p.item.caminhoLocal), { contentType: p.item.tipo, resumable: false });
    try {
      await db.runTransaction(async (tx) => {
        const atual = await tx.get(p.ref);
        if (!atual.exists) throw new Error(`Lançamento sumiu: ${p.item.descricao}`);
        const comprovante = { id: randomUUID(), caminho, nome: p.item.nome, tipo: p.item.tipo, tamanho: p.item.tamanho };
        tx.update(p.ref, {
          comprovantes: FieldValue.arrayUnion({ ...comprovante, enviadoEm: Date.now(), enviadoPor: QUEM.uid, enviadoPorNome: QUEM.nome }),
        });
        tx.create(c.collection("auditLogs").doc(), {
          condominioId: ID,
          uid: QUEM.uid,
          nome: QUEM.nome,
          papel: QUEM.papel,
          acao: "financeiro.comprovante",
          alvo: `financialEntries/${p.ref.id}`,
          detalhes: { operacao: "anexar", comprovante: comprovante.id, arquivo: comprovante.nome, mes, lancamento: p.item.descricao },
          criadoEm: FieldValue.serverTimestamp(),
        });
        // Avisa as telas abertas que o financeiro mudou (mesmo documento que o portal usa).
        tx.set(c.collection("sistema").doc("sinais"), { financeiro: FieldValue.serverTimestamp() }, { merge: true });
      });
    } catch (erro) {
      await arquivo.delete({ ignoreNotFound: true });
      throw erro;
    }
    console.log(`  ✔ ${p.item.descricao}`);
  }
  console.log(`\n✔ ${fazer.length} comprovante(s) anexado(s) em ${mes}.\n`);
}

main().catch((e) => falhar(e instanceof Error ? e.message : String(e)));
