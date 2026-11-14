/**
 * Cria os dados de DEMONSTRAÇÃO no simulador local.
 * Recusa-se a rodar fora do simulador: nunca toca no Firebase real.
 *
 * Uso: npm run semear   (o "npm run dev:emu" já roda este script sozinho)
 *
 * A equipe demo (síndico, portaria, conselho) também entra com e-mail e senha.
 * A senha é nova a cada semeadura e fica em portal/.acesso-demo.txt
 * (arquivo ignorado pelo git). Ela nunca aparece na tela.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { CONDOMINIO_DEMO, OUTRO_CONDOMINIO_DEMO, USUARIOS_DEMO } from "../src/lib/demo";
import type { Papel } from "../src/lib/permissoes";
import { gerarSenhaProvisoria } from "../src/lib/senha";
import { hojeISO } from "../src/lib/formato";
import { hashDoCodigo, SEGREDO_CODIGO_DESENVOLVIMENTO } from "../src/lib/portaria";
import { AREAS_SUGERIDAS, idDaTrava, proximoMes, somarDias } from "../src/lib/reservas";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error("Este script só roda com o simulador ligado (FIRESTORE_EMULATOR_HOST e FIREBASE_AUTH_EMULATOR_HOST).");
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? "demo-jardins";
if (!projectId.startsWith("demo-")) {
  console.error(`Projeto "${projectId}" não é de demonstração. Use um ID que comece com "demo-".`);
  process.exit(1);
}

initializeApp({ projectId });
const db = getFirestore();
const auth = getAuth();

// E-mails fictícios da equipe demo (o domínio .local não existe de verdade).
const EMAILS_DEMO: Partial<Record<Papel, string>> = {
  admin: "sindico@demo.jardins.local",
  portaria: "portaria@demo.jardins.local",
  conselheiro: "conselho@demo.jardins.local",
};
const ARQUIVO_DEMO = path.resolve(import.meta.dirname, "..", ".acesso-demo.txt");
const senhaDemo = gerarSenhaProvisoria(); // nova a cada semeadura

async function main() {
  const lote = db.batch();
  const agora = FieldValue.serverTimestamp();

  for (const c of [CONDOMINIO_DEMO, OUTRO_CONDOMINIO_DEMO]) {
    lote.set(db.doc(`condominiums/${c.id}`), {
      nome: c.nome,
      status: "ativo",
      fuso: "America/Belem",
      moeda: "BRL",
      demo: true,
      criadoEm: agora,
    });
  }

  // Algumas casas fictícias (a numeração real vem do cadastro na Fase 2).
  for (const n of [1, 2, 12, 45, 120]) {
    const id = `casa-${String(n).padStart(3, "0")}`;
    lote.set(db.doc(`condominiums/${CONDOMINIO_DEMO.id}/units/${id}`), {
      rotulo: `Casa ${n}`,
      numero: n,
      quadra: null,
      status: "ativa",
      demo: true,
    });
  }

  for (const u of Object.values(USUARIOS_DEMO)) {
    await auth.deleteUser(u.uid).catch(() => undefined);
    const email = EMAILS_DEMO[u.papel];
    await auth.createUser({ uid: u.uid, displayName: u.nome, ...(email ? { email, password: senhaDemo } : {}) });

    lote.set(db.doc(`users/${u.uid}`), {
      nome: u.nome,
      condominioIds: [CONDOMINIO_DEMO.id],
      condominioAtivo: CONDOMINIO_DEMO.id,
      demo: true,
    });
    lote.set(db.doc(`condominiums/${CONDOMINIO_DEMO.id}/members/${u.uid}`), {
      nome: u.nome,
      papel: u.papel,
      unitId: u.unitId,
      status: "ativo",
      permissoesExtras: [],
      permissoesNegadas: [],
      // Na demonstração ninguém é obrigado a trocar a senha (atrapalharia os botões de entrada rápida).
      precisaTrocarSenha: false,
      demo: true,
      criadoEm: agora,
    });
  }

  const c = `condominiums/${CONDOMINIO_DEMO.id}`;
  const hoje = hojeISO(new Date(), "America/Belem");

  // ---------- Portaria: autorizações, uma pessoa dentro e 2 encomendas aguardando ----------
  const segredo = process.env.PORTARIA_SEGREDO_CODIGO || SEGREDO_CODIGO_DESENVOLVIMENTO;
  const morador = USUARIOS_DEMO.morador; // casa-012
  const porteiro = USUARIOS_DEMO.portaria;
  const visitas = [
    { id: "demo-visita-hoje", codigo: "K7M4PX", nome: "Maria Visitante", tipo: "visita", data: hoje, validaAte: hoje },
    { id: "demo-visita-prestador", codigo: "PRT3ZB", nome: "João Pedreiro", tipo: "prestador", data: hoje, validaAte: somarDias(hoje, 6) },
    { id: "demo-visita-amanha", codigo: "HGX7QW", nome: "Entrega do Mercado", tipo: "entrega", data: somarDias(hoje, 1), validaAte: somarDias(hoje, 1) },
  ];
  for (const v of visitas) {
    lote.set(db.doc(`${c}/visitors/${v.id}`), {
      unitId: morador.unitId,
      unidadeRotulo: "Casa 12",
      nome: v.nome,
      tipo: v.tipo,
      data: v.data,
      validaAte: v.validaAte,
      usoUnico: v.data === v.validaAte,
      usos: 0,
      observacao: "",
      codigoHash: await hashDoCodigo(segredo, CONDOMINIO_DEMO.id, v.codigo),
      status: "ativa",
      anonimizado: false,
      criadoPor: morador.uid,
      criadoPorNome: morador.nome,
      criadoEm: agora,
      demo: true,
    });
  }
  lote.set(db.doc(`${c}/accessEvents/demo-entrada-1`), {
    tipo: "entrada",
    origem: "sem_codigo",
    visitorId: null,
    unitId: "casa-045",
    unidadeRotulo: "Casa 45",
    nome: "Carla Diarista",
    tipoVisita: "prestador",
    confirmadoComMorador: true,
    data: hoje,
    quando: agora,
    dentro: true,
    saidaEm: null,
    saidaId: null,
    anonimizado: false,
    registradoPor: porteiro.uid,
    registradoPorNome: porteiro.nome,
    demo: true,
  });
  const encomendas = [
    ["demo-encomenda-1", "casa-012", "Casa 12", "Ana Demonstração", "caixa"],
    ["demo-encomenda-2", "casa-120", "Casa 120", "Pedro Morador", "envelope"],
  ] as const;
  for (const [id, unitId, unidadeRotulo, destinatario, tipo] of encomendas) {
    lote.set(db.doc(`${c}/packages/${id}`), {
      unitId,
      unidadeRotulo,
      destinatario,
      tipo,
      observacao: "",
      status: "aguardando",
      dataRecebimento: hoje,
      recebidoEm: agora,
      recebidoPor: porteiro.uid,
      recebidoPorNome: porteiro.nome,
      entregueEm: null,
      entreguePor: null,
      entreguePorNome: null,
      retiradoPor: null,
      demo: true,
    });
  }

  // ---------- Áreas de lazer e reservas de demonstração ----------
  for (const { id, ...area } of AREAS_SUGERIDAS) {
    lote.set(db.doc(`${c}/amenities/${id}`), { ...area, demo: true, criadoEm: agora });
  }
  const mesQueVem = proximoMes(hoje.slice(0, 7));
  const sindico = USUARIOS_DEMO.admin;
  const reservasDemo: {
    id: string;
    area: string;
    data: string;
    faixa: number;
    unitId: string | null;
    rotulo: string | null;
    status: "pendente" | "confirmada" | "bloqueada";
    origem: "morador" | "administracao";
    motivo?: string;
    observacao?: string;
  }[] = [
    { id: "demo-res-1", area: "salao-de-festas", data: somarDias(hoje, 6), faixa: 0, unitId: "casa-012", rotulo: "Casa 12", status: "confirmada", origem: "morador", observacao: "Aniversário" },
    { id: "demo-res-2", area: "churrasqueira", data: somarDias(hoje, 3), faixa: 1, unitId: "casa-045", rotulo: "Casa 45", status: "confirmada", origem: "administracao" },
    { id: "demo-res-3", area: "churrasqueira", data: somarDias(hoje, 10), faixa: 0, unitId: "casa-001", rotulo: "Casa 1", status: "pendente", origem: "morador", observacao: "Almoço de família" },
    { id: "demo-res-4", area: "quadra-poliesportiva", data: somarDias(hoje, 1), faixa: 11, unitId: "casa-002", rotulo: "Casa 2", status: "confirmada", origem: "morador" },
    { id: "demo-res-5", area: "quadra-poliesportiva", data: somarDias(hoje, 2), faixa: 0, unitId: null, rotulo: null, status: "bloqueada", origem: "administracao", motivo: "Pintura da quadra" },
    { id: "demo-res-6", area: "salao-de-festas", data: `${mesQueVem}-12`, faixa: 0, unitId: "casa-120", rotulo: "Casa 120", status: "confirmada", origem: "morador" },
    { id: "demo-res-7", area: "churrasqueira", data: `${mesQueVem}-19`, faixa: 1, unitId: "casa-012", rotulo: "Casa 12", status: "confirmada", origem: "morador" },
  ];
  for (const r of reservasDemo) {
    const area = AREAS_SUGERIDAS.find((a) => a.id === r.area)!;
    const faixa = area.faixas[r.faixa];
    lote.set(db.doc(`${c}/reservations/${r.id}`), {
      amenityId: area.id,
      areaNome: area.nome,
      unitId: r.unitId,
      unidadeRotulo: r.rotulo,
      data: r.data,
      mes: r.data.slice(0, 7),
      faixaId: faixa.id,
      faixaRotulo: faixa.rotulo,
      inicio: faixa.inicio,
      fim: faixa.fim,
      status: r.status,
      observacao: r.observacao ?? "",
      motivo: r.motivo ?? "",
      origem: r.origem,
      criadoPor: r.origem === "morador" ? morador.uid : sindico.uid,
      criadoPorNome: r.origem === "morador" ? "Morador (demonstração)" : sindico.nome,
      criadoEm: agora,
      decididoPor: r.status === "pendente" ? null : sindico.uid,
      decididoPorNome: r.status === "pendente" ? "" : sindico.nome,
      decididoEm: r.status === "pendente" ? null : agora,
      demo: true,
    });
    lote.set(db.doc(`${c}/reservationLocks/${idDaTrava(area.id, r.data, faixa.id)}`), {
      reservaId: r.id,
      amenityId: area.id,
      data: r.data,
      faixaId: faixa.id,
      criadoEm: agora,
    });
  }

  await lote.commit();

  // Credenciais da equipe demo: só no arquivo (nunca na tela).
  writeFileSync(
    ARQUIVO_DEMO,
    [
      "CONTAS DE DEMONSTRAÇÃO (só no simulador local)",
      "",
      ...Object.values(EMAILS_DEMO),
      "",
      `Senha (a mesma para todas): ${senhaDemo}`,
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o600 },
  );

  console.log(`Dados de demonstração prontos: ${CONDOMINIO_DEMO.nome}, 5 casas, 4 perfis, portaria e reservas.`);
  console.log(`Contas de e-mail/senha da equipe demo: veja ${ARQUIVO_DEMO}`);
  console.log("Códigos de visitante da demonstração: K7M-4PX (hoje, uso único), PRT-3ZB (prestador, 7 dias), HGX-7QW (amanhã).");
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
