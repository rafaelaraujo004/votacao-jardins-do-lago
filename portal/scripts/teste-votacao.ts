/**
 * TESTE DE VOTAÇÃO — cria uma votação CURTA de teste no condomínio de DEMONSTRAÇÃO, vota por
 * algumas casas e mostra a situação. Serve para ver, antes do dia, tudo funcionando: o painel
 * no topo do Início (casas que votaram / faltam), o encerramento, o aviso no celular para todos
 * e a animação do resultado.
 *
 * SEGURANÇA: só roda num condomínio de DEMONSTRAÇÃO (documento com demo: true ou id terminando
 * em "-demo"). NUNCA no condomínio real: publicar ou encerrar lá manda aviso para todos os moradores.
 * Usa as MESMAS funções do portal (criar, publicar, gerar links, votar), então testa o caminho real.
 *
 * Uso (na pasta portal):
 *   Simulador do computador (npm run dev:emu ligado):
 *     FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_PROJECT_ID=demo-jardins \
 *       npx tsx --require ./scripts/apoio/sem-server-only.cjs scripts/teste-votacao.ts criar --minutos 10
 *   Firebase REAL, condomínio de demonstração (lê o .env.production.local):
 *     npx tsx --require ./scripts/apoio/sem-server-only.cjs scripts/teste-votacao.ts criar --real --minutos 10
 *
 * Comandos:
 *   criar     [--minutos 10] [--abre-em 0]  cria e publica a votação de teste (chapa fictícia),
 *                                           gera os links e mostra o link e a senha de cada casa
 *   votar     --sim 2 --nao 1               vota por casas que ainda não votaram (na de teste aberta)
 *   situacao                                fase, casas que votaram / faltam e, no fim, o resultado
 * Opções: --condominio jardins-do-lago-demo · --base https://... (endereço do portal para os links)
 *
 * O "--require ./scripts/apoio/sem-server-only.cjs" é obrigatório: as funções do portal são marcadas "só servidor".
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    real: { type: "boolean", default: false },
    condominio: { type: "string", default: "jardins-do-lago-demo" },
    minutos: { type: "string", default: "10" },
    "abre-em": { type: "string", default: "0" },
    sim: { type: "string", default: "0" },
    nao: { type: "string", default: "0" },
    base: { type: "string" },
  },
});

function falhar(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

const comando = positionals[0] ?? "";
if (!["criar", "votar", "situacao"].includes(comando)) falhar("Use: criar | votar | situacao (veja o começo do arquivo).");

if (values.real) {
  if (process.env.FIRESTORE_EMULATOR_HOST) falhar("--real com o simulador ligado: tire FIRESTORE_EMULATOR_HOST.");
  const ARQUIVO_ENV = path.resolve(import.meta.dirname, "..", ".env.production.local");
  if (existsSync(ARQUIVO_ENV)) process.loadEnvFile?.(ARQUIVO_ENV);
} else if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  falhar("Sem --real, este script usa o SIMULADOR: defina FIRESTORE_EMULATOR_HOST e FIREBASE_AUTH_EMULATOR_HOST.");
}
if (!process.env.FIREBASE_PROJECT_ID) process.env.FIREBASE_PROJECT_ID = values.real ? "" : "demo-jardins";
if (!process.env.FIREBASE_PROJECT_ID) falhar("Configure FIREBASE_PROJECT_ID (arquivo .env.production.local).");

const condominioId = values.condominio!;
const base = (values.base ?? (values.real ? "https://portal-jardins-do-lago.vercel.app" : "http://localhost:3000")).replace(/\/+$/, "");

async function main() {
  // Importa depois de conferir o ambiente (o portal lê as variáveis ao conectar).
  const { adminDb } = await import("../src/server/firebase-admin");
  const { calcularPermissoes } = await import("../src/lib/permissoes");
  const { montarCandidatos, situacaoEleicao } = await import("../src/lib/eleicoes");
  const dados = await import("../src/server/dados/eleicoes");
  const links = await import("../src/server/dados/votacao-links");
  type Contexto = import("../src/server/contexto").Contexto;

  const db = adminDb();
  const cond = await db.collection("condominiums").doc(condominioId).get();
  if (!cond.exists) falhar(`O condomínio "${condominioId}" não existe.`);
  if (cond.get("demo") !== true && !condominioId.endsWith("-demo"))
    falhar(`"${condominioId}" NÃO é um condomínio de demonstração. Teste só no de demonstração.`);
  const fuso = typeof cond.get("fuso") === "string" ? (cond.get("fuso") as string) : "America/Belem";
  const hora = (d: Date) => d.toLocaleString("pt-BR", { timeZone: fuso });

  const ctx: Contexto = {
    uid: "script:teste-votacao",
    nome: "Teste de votação (script)",
    condominioId,
    condominioNome: String(cond.get("nome") ?? condominioId),
    fuso,
    papel: "admin",
    unitId: null,
    unidadeRotulo: null,
    permissoes: calcularPermissoes("admin"),
    demo: true,
    precisaTrocarSenha: false,
  };

  /** A votação de teste mais recente (criada por este script). */
  async function ultimaDeTeste() {
    const snap = await dados.eleicoesDe(ctx, db).where("criadoPor", "==", ctx.uid).get();
    const lista = snap.docs.map((d) => dados.paraEleicao(d.id, d.data()));
    return lista.sort((a, b) => (b.criadoEm?.getTime() ?? 0) - (a.criadoEm?.getTime() ?? 0))[0] ?? null;
  }

  if (comando === "criar") {
    const minutos = Number(values.minutos);
    const abreEm = Number(values["abre-em"]);
    if (!Number.isFinite(minutos) || minutos < 3 || minutos > 24 * 60) falhar("--minutos entre 3 e 1440.");
    if (!Number.isFinite(abreEm) || abreEm < 0 || abreEm > 24 * 60) falhar("--abre-em entre 0 e 1440 minutos.");
    const aberta = await dados.eleicaoEmDestaque(condominioId);
    if (aberta && situacaoEleicao(aberta, new Date()) === "aberta")
      falhar(`Já existe uma votação aberta neste condomínio ("${aberta.titulo}"). Espere ela encerrar.`);
    const candidatos = montarCandidatos(
      [
        ["Maria Teste", "Síndica"],
        ["João Teste", "Vice-síndico"],
        ["Ana Teste", "Tesoureira"],
        ["Pedro Teste", "Fiscal"],
      ].map(([nome, funcao]) => ({ nome, funcao, casa: "", apresentacao: "", nascimento: "" })),
    );
    if (typeof candidatos === "string") falhar(candidatos);
    // Começa 5 s à frente para a publicação aceitar mesmo com --abre-em 0.
    const inicio = new Date(Date.now() + abreEm * 60_000 + 5_000);
    const fim = new Date(inicio.getTime() + minutos * 60_000);
    const id = await dados.gravarEleicao(db, ctx, {
      id: null,
      titulo: `TESTE — Votação de demonstração (${hora(inicio).slice(0, 17)})`,
      cargo: "Teste da votação",
      modo: "chapa",
      vagas: 1,
      escolhasPorCasa: 1,
      permiteBranco: false,
      regraDesempate: "comissao",
      abreEm: inicio,
      fechaEm: fim,
      candidatos,
    });
    await dados.mudarStatusEleicao(db, ctx, id, "publicar");
    await links.gerarLinksFaltantes(db, ctx, id);
    const envios = await links.listarEnvios(ctx, id, db);
    console.log(`\n✔ Votação de TESTE publicada em "${ctx.condominioNome}".`);
    console.log(`  Abre: ${hora(inicio)} · Encerra: ${hora(fim)} · Resultado ~2 min depois.`);
    console.log(`  Tela da comissão: ${base}/admin/votacao/${id}\n`);
    console.log("  Links de voto (casa · senha · link):");
    for (const l of envios.filter((x) => x.ativa && x.codigo))
      console.log(`   - ${l.rotulo.padEnd(10)} senha ${l.senha} · ${base}/votar/${l.codigo}`);
    console.log("\n  Para votar por algumas casas:  ... scripts/teste-votacao.ts votar --sim 2 --nao 1");
    console.log("  Para ver como está:            ... scripts/teste-votacao.ts situacao\n");
    return;
  }

  const e = await ultimaDeTeste();
  if (!e) falhar("Nenhuma votação de teste criada por este script. Rode primeiro: criar");

  if (comando === "votar") {
    const sim = Math.max(0, Math.floor(Number(values.sim) || 0));
    const nao = Math.max(0, Math.floor(Number(values.nao) || 0));
    if (sim + nao === 0) falhar("Diga quantos votos: --sim 2 --nao 1");
    if (situacaoEleicao(e, new Date()) !== "aberta") falhar(`A votação de teste não está aberta (abre ${hora(e.abreEm)}, encerra ${hora(e.fechaEm)}).`);
    const envios = await links.listarEnvios(ctx, e.id, db);
    const livres = envios.filter((l) => l.ativa && !l.votou && !l.bloqueada);
    if (livres.length < sim + nao) falhar(`Só ${livres.length} casas ainda podem votar.`);
    const escolhas = [...Array(sim).fill("sim"), ...Array(nao).fill("nao")] as string[];
    for (const [i, voto] of escolhas.entries()) {
      const casa = livres[i];
      await dados.gravarVotoDaCasa(
        db,
        { condominioId, unitId: casa.unitId, uid: `script:${casa.unitId}`, nome: `Teste · ${casa.rotulo}`, papel: "morador", via: "link" },
        e.id,
        [voto],
      );
      console.log(`  ✔ ${casa.rotulo} votou`);
    }
    // Avisa as telas abertas (como o portal faz depois de cada voto).
    const { marcarMudancaDepois } = await import("../src/server/sinais");
    await marcarMudancaDepois(db, condominioId, "eleicoes", 0);
    console.log(`\n✔ ${sim + nao} voto(s) registrados. O painel do Início atualiza em até 20 s.\n`);
    return;
  }

  // situacao — divulga ANTES (com espera), para o aviso no celular não ser cortado ao sair.
  const divulgacao = await dados.finalizarEleicao(db, condominioId, e.id);
  const painel = await dados.montarPainel(condominioId, { ...e, resultadoDivulgadoEm: e.resultadoDivulgadoEm ?? (divulgacao.divulgou ? new Date() : null) });
  console.log(`\n"${e.titulo}" — fase: ${painel.fase}`);
  console.log(`  Abre ${hora(e.abreEm)} · Encerra ${hora(e.fechaEm)} · Resultado a partir de ${hora(new Date(painel.resultadoEm))}`);
  console.log(`  Casas: ${painel.votaram} votaram de ${painel.casasAptas} (${painel.participacao}%) · faltam ${painel.faltam}`);
  if (painel.resultado?.modo === "chapa") {
    const r = painel.resultado;
    console.log(`  Resultado: ${r.eleita ? "CHAPA ELEITA" : "CHAPA NÃO ELEITA"} — Sim ${r.sim} · Não ${r.nao} · Nulos ${r.nulos} (mínimo ${r.minimo} de ${r.validos} válidos)`);
    if (divulgacao.divulgou) console.log("  ✔ Resultado divulgado agora (aviso no celular para todos do condomínio de demonstração).");
    else console.log("  Resultado já tinha sido divulgado a todos.");
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
