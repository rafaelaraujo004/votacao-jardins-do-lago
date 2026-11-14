/**
 * Grava a configuração REAL do Residencial Jardins do Lago — USO REAL.
 *
 * O que faz (pode rodar quantas vezes quiser: o resultado é sempre o mesmo):
 *  1. Informações do condomínio: PIX da taxa, telefone da ronda noturna e
 *     responsável pelas reservas. Grava SÓ esses campos: os telefones, o
 *     horário e o aviso que o síndico já pôs em /admin/informacoes continuam.
 *     O link da votação fica vazio na 1ª vez (o síndico cola em /admin/informacoes);
 *     rodar de novo não apaga o link que ele colou.
 *  2. Áreas e equipamentos reais (src/lib/areas-jardins.ts), por id fixo:
 *     área de lazer, quadra, roçadeira e carrinho de mão.
 *  3. Desativa (ativa = false, nada é apagado) as áreas antigas que não estão nessa lista.
 *  4. Registra tudo na auditoria (sem dados pessoais).
 *
 * Uso (na pasta portal), com as credenciais do .env.production.local:
 *   npx tsx scripts/configurar-jardins-do-lago.ts --conferir   (só mostra o que mudaria)
 *   npx tsx scripts/configurar-jardins-do-lago.ts               (grava)
 * Outro id de condomínio (raro): --id outro-id
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { AREAS_JARDINS_DO_LAGO, problemasDasAreasJardins } from "../src/lib/areas-jardins";
import { cnpjValido, ehCelular, normalizarChavePix, normalizarTelefone } from "../src/lib/validacao-informacoes";

const ARQUIVO_ENV = path.resolve(import.meta.dirname, "..", ".env.production.local");
if (existsSync(ARQUIVO_ENV)) process.loadEnvFile?.(ARQUIVO_ENV);

const { values } = parseArgs({ options: { id: { type: "string" }, conferir: { type: "boolean" } } });
const ID = values.id ?? "jardins-do-lago";
const SO_CONFERIR = values.conferir === true;

/** Informações reais passadas pela administração. */
const INFORMACOES_REAIS = {
  pix: { chave: "29711278000159", tipo: "cnpj" as const, favorecido: "Condomínio Jardins do Lago" },
  telefoneRonda: "94992221384",
  responsavelReservas: { nome: "Shirley", telefone: "94991900906", horario: "8h às 20h" },
  linkVotacao: null,
};

function falhar(mensagem: string): never {
  console.error(mensagem);
  process.exit(1);
}

// ---------- Conferências antes de tocar no banco ----------

if (process.env.FIRESTORE_EMULATOR_HOST) falhar("Este script é para o Firebase REAL; desligue o simulador (FIRESTORE_EMULATOR_HOST).");
if (!/^[a-z0-9-]{3,40}$/.test(ID)) falhar("Confira o --id (letras minúsculas, números e hífen).");
if (ID.endsWith("-demo")) falhar("Este script é do condomínio REAL. A demonstração usa scripts/criar-demo-real.ts.");

const { pix, telefoneRonda, responsavelReservas } = INFORMACOES_REAIS;
if (!cnpjValido(pix.chave) || normalizarChavePix(pix.tipo, pix.chave) !== pix.chave) falhar("CNPJ da chave PIX inválido.");
for (const tel of [telefoneRonda, responsavelReservas.telefone]) {
  if (normalizarTelefone(tel) !== tel || !ehCelular(tel)) falhar("Um dos telefones está em formato inválido (use DDD + número, só dígitos).");
}
const problemas = problemasDasAreasJardins();
if (problemas.length) falhar(`Áreas com problema:\n- ${problemas.join("\n- ")}`);

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) falhar("Configure FIREBASE_PROJECT_ID (arquivo .env.production.local).");
if (projectId.startsWith("demo-")) falhar(`O projeto "${projectId}" é de demonstração; este script é para o Firebase real.`);
initializeApp({
  projectId,
  credential: cert({
    projectId,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});

async function main() {
  const db = getFirestore();
  const refCondominio = db.doc(`condominiums/${ID}`);
  const condominio = await refCondominio.get();
  if (!condominio.exists) falhar(`O condomínio "${ID}" não existe. Crie antes com: npm run criar-condominio`);
  if (condominio.get("demo") === true) falhar(`"${ID}" está marcado como demonstração. Este script é do condomínio real.`);

  const areasAtuais = await refCondominio.collection("amenities").get();
  const idsReais = new Set(AREAS_JARDINS_DO_LAGO.map((a) => a.id));
  const existentes = new Set(areasAtuais.docs.map((d) => d.id));
  const paraDesativar = areasAtuais.docs.filter((d) => !idsReais.has(d.id) && d.get("ativa") !== false);

  // Resumo (sem chave PIX, telefones ou nomes).
  console.log(`Condomínio: ${ID}${SO_CONFERIR ? " (só conferindo: nada será gravado)" : ""}`);
  console.log(
    `Informações: PIX (tipo CNPJ), ronda noturna e responsável pelas reservas${
      condominio.get("informacoes.linkVotacao") === undefined ? "; link da votação vazio" : "; link da votação mantido"
    }.`,
  );
  console.log("  Telefones da portaria/administração, horário e aviso já cadastrados são mantidos.");
  for (const a of AREAS_JARDINS_DO_LAGO) {
    console.log(`Área "${a.nome}" (${a.id}): ${existentes.has(a.id) ? "atualizar" : "criar"}`);
  }
  for (const d of paraDesativar) console.log(`Área antiga "${String(d.get("nome") ?? d.id)}" (${d.id}): desativar`);
  if (SO_CONFERIR) return;

  const agora = FieldValue.serverTimestamp();
  const auditoria = (acao: string, alvo: string, detalhes: Record<string, string | number | boolean | null>) => ({
    condominioId: ID,
    uid: "script:configurar-jardins-do-lago",
    nome: "Configuração inicial (script)",
    papel: null,
    acao,
    alvo,
    detalhes,
    criadoEm: agora,
  });

  const lote = db.batch();
  // 1. Só os campos novos, por caminho "informacoes.<campo>": o resto do mapa continua.
  //    O link da votação só é criado (vazio) se ainda não existir: rodar de novo
  //    NUNCA apaga um link que o síndico já colou em /admin/informacoes.
  const criarLink = condominio.get("informacoes.linkVotacao") === undefined;
  lote.update(refCondominio, {
    "informacoes.pix": pix,
    "informacoes.telefoneRonda": telefoneRonda,
    "informacoes.responsavelReservas": responsavelReservas,
    ...(criarLink ? { "informacoes.linkVotacao": null } : {}),
    "informacoes.atualizadoEm": agora,
  });
  lote.create(
    refCondominio.collection("auditLogs").doc(),
    auditoria("informacoes.alterar", `condominiums/${ID}`, {
      camposAlterados: `pix, telefoneRonda, responsavelReservas${criarLink ? ", linkVotacao" : ""}`,
      pixTipo: pix.tipo,
      origem: "script",
    }),
  );

  // 2. Áreas reais (merge por id fixo).
  for (const { id, ...area } of AREAS_JARDINS_DO_LAGO) {
    const novo = !existentes.has(id);
    lote.set(
      refCondominio.collection("amenities").doc(id),
      {
        ...area,
        antecedenciaMinDias: FieldValue.delete(), // campo antigo (em dias)
        atualizadoEm: agora,
        atualizadoPor: "script:configurar-jardins-do-lago",
        ...(novo ? { criadoEm: agora } : {}),
      },
      { merge: true },
    );
    lote.create(
      refCondominio.collection("auditLogs").doc(),
      auditoria(novo ? "area.criar" : "area.editar", `amenities/${id}`, { nome: area.nome, tipo: area.tipo, origem: "script" }),
    );
  }

  // 3. Áreas antigas: só desativa (o histórico de reservas continua).
  for (const d of paraDesativar) {
    lote.update(d.ref, { ativa: false, atualizadoEm: agora, atualizadoPor: "script:configurar-jardins-do-lago" });
    lote.create(
      refCondominio.collection("auditLogs").doc(),
      auditoria("area.editar", `amenities/${d.id}`, { ativa: false, origem: "script" }),
    );
  }

  await lote.commit();
  console.log(
    `Pronto: informações gravadas, ${AREAS_JARDINS_DO_LAGO.length} áreas/equipamentos configurados e ${paraDesativar.length} área(s) antiga(s) desativada(s).`,
  );
  console.log("Confira em /admin/informacoes e /admin/reservas/areas (entre com a conta do síndico).");
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
