/**
 * Cria (ou recria) o condomínio de DEMONSTRAÇÃO no Firebase REAL, separado do condomínio verdadeiro.
 * Serve para mostrar e testar o portal sem tocar nos dados reais do Jardins do Lago.
 *
 * - Condomínio "jardins-do-lago-demo" (marcado demo: true → o portal mostra "dados fictícios").
 * - Uma conta demo com papel de administrador SÓ desse condomínio (não vê o condomínio real).
 * - Casas, visitantes, encomendas, áreas de lazer e reservas fictícias.
 *
 * Uso (na pasta portal), com a senha numa variável de ambiente (não fica no histórico do git):
 *   DEMO_SENHA="..." npx tsx --env-file=.env.production.local scripts/criar-demo-real.ts --email demo@exemplo.test
 */
import { parseArgs } from "node:util";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { hojeISO } from "../src/lib/formato";
import { hashDoCodigo } from "../src/lib/portaria";
import { AREAS_SUGERIDAS, idDaTrava, proximoMes, somarDias } from "../src/lib/reservas";

const ID = "jardins-do-lago-demo";
const NOME = "Jardins do Lago — DEMONSTRAÇÃO";

const { values } = parseArgs({ options: { email: { type: "string" }, nome: { type: "string" } } });
const email = (values.email ?? "").trim().toLowerCase();
const nomeConta = values.nome ?? "Conta Demonstração";
const senha = process.env.DEMO_SENHA ?? "";
const segredo = process.env.PORTARIA_SEGREDO_CODIGO ?? "";

if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Informe --email da conta demo.");
if (senha.length < 6) throw new Error("Informe a senha em DEMO_SENHA (mínimo 6 caracteres, regra do Firebase).");
if (segredo.length < 32) throw new Error("PORTARIA_SEGREDO_CODIGO precisa ter 32+ caracteres (o mesmo que o portal usa).");
if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Este script é para o Firebase REAL; desligue o simulador.");

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) throw new Error("Configure FIREBASE_PROJECT_ID.");
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
  const auth = getAuth();
  const agora = FieldValue.serverTimestamp();
  const c = `condominiums/${ID}`;
  const hoje = hojeISO(new Date(), "America/Belem");

  // Conta demo: cria ou atualiza a senha. Recusa se o e-mail já for de alguém do condomínio real.
  let uid: string;
  try {
    const existente = await auth.getUserByEmail(email);
    const vinculo = await db.doc(`users/${existente.uid}`).get();
    const outros = ((vinculo.get("condominioIds") as string[] | undefined) ?? []).filter((x) => x !== ID);
    if (outros.length) throw new Error("Esse e-mail já tem acesso a outro condomínio. Use um e-mail só para a demonstração.");
    await auth.updateUser(existente.uid, { password: senha, displayName: nomeConta, disabled: false });
    uid = existente.uid;
  } catch (erro) {
    if ((erro as { code?: string }).code !== "auth/user-not-found") throw erro;
    uid = (await auth.createUser({ email, password: senha, displayName: nomeConta })).uid;
  }

  const lote = db.batch();
  lote.set(db.doc(c), { nome: NOME, status: "ativo", fuso: "America/Belem", moeda: "BRL", demo: true, criadoEm: agora });
  lote.set(db.doc(`users/${uid}`), { nome: nomeConta, condominioIds: [ID], condominioAtivo: ID, demo: true });
  lote.set(db.doc(`${c}/members/${uid}`), {
    nome: nomeConta,
    papel: "admin",
    unitId: null,
    status: "ativo",
    permissoesExtras: [],
    permissoesNegadas: [],
    precisaTrocarSenha: false, // conta de testes: senha combinada, sem troca obrigatória
    demo: true,
    criadoEm: agora,
  });

  for (const n of [1, 2, 12, 45, 120]) {
    lote.set(db.doc(`${c}/units/casa-${String(n).padStart(3, "0")}`), {
      rotulo: `Casa ${n}`,
      numero: n,
      quadra: null,
      status: "ativa",
      demo: true,
    });
  }

  // Portaria: autorizações, uma pessoa dentro e duas encomendas.
  const visitas = [
    { id: "demo-visita-hoje", codigo: "K7M4PX", nome: "Maria Visitante", tipo: "visita", data: hoje, validaAte: hoje },
    { id: "demo-visita-prestador", codigo: "PRT3ZB", nome: "João Pedreiro", tipo: "prestador", data: hoje, validaAte: somarDias(hoje, 6) },
  ];
  for (const v of visitas) {
    lote.set(db.doc(`${c}/visitors/${v.id}`), {
      unitId: "casa-012",
      unidadeRotulo: "Casa 12",
      nome: v.nome,
      tipo: v.tipo,
      data: v.data,
      validaAte: v.validaAte,
      usoUnico: v.data === v.validaAte,
      usos: 0,
      observacao: "",
      codigoHash: await hashDoCodigo(segredo, ID, v.codigo),
      status: "ativa",
      anonimizado: false,
      criadoPor: uid,
      criadoPorNome: "Morador (demonstração)",
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
    registradoPor: uid,
    registradoPorNome: nomeConta,
    demo: true,
  });
  for (const [id, unitId, unidadeRotulo, destinatario, tipo] of [
    ["demo-encomenda-1", "casa-012", "Casa 12", "Ana Demonstração", "caixa"],
    ["demo-encomenda-2", "casa-120", "Casa 120", "Pedro Morador", "envelope"],
  ] as const) {
    lote.set(db.doc(`${c}/packages/${id}`), {
      unitId,
      unidadeRotulo,
      destinatario,
      tipo,
      observacao: "",
      status: "aguardando",
      dataRecebimento: hoje,
      recebidoEm: agora,
      recebidoPor: uid,
      recebidoPorNome: nomeConta,
      entregueEm: null,
      entreguePor: null,
      entreguePorNome: null,
      retiradoPor: null,
      demo: true,
    });
  }

  // Áreas de lazer e reservas.
  for (const { id, ...area } of AREAS_SUGERIDAS) {
    lote.set(db.doc(`${c}/amenities/${id}`), { ...area, demo: true, criadoEm: agora });
  }
  const mesQueVem = proximoMes(hoje.slice(0, 7));
  const reservas = [
    { id: "demo-res-1", area: "salao-de-festas", data: somarDias(hoje, 6), faixa: 0, unitId: "casa-012", rotulo: "Casa 12", status: "confirmada" },
    { id: "demo-res-2", area: "churrasqueira", data: somarDias(hoje, 3), faixa: 1, unitId: "casa-045", rotulo: "Casa 45", status: "confirmada" },
    { id: "demo-res-3", area: "churrasqueira", data: somarDias(hoje, 10), faixa: 0, unitId: "casa-001", rotulo: "Casa 1", status: "pendente" },
    { id: "demo-res-4", area: "quadra-poliesportiva", data: somarDias(hoje, 1), faixa: 11, unitId: "casa-002", rotulo: "Casa 2", status: "confirmada" },
    { id: "demo-res-5", area: "salao-de-festas", data: `${mesQueVem}-12`, faixa: 0, unitId: "casa-120", rotulo: "Casa 120", status: "confirmada" },
  ] as const;
  for (const r of reservas) {
    const area = AREAS_SUGERIDAS.find((a) => a.id === r.area)!;
    const faixa = area.faixas[r.faixa];
    const pendente = r.status === "pendente";
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
      observacao: "",
      motivo: "",
      origem: "morador",
      criadoPor: uid,
      criadoPorNome: "Morador (demonstração)",
      criadoEm: agora,
      decididoPor: pendente ? null : uid,
      decididoPorNome: pendente ? "" : nomeConta,
      decididoEm: pendente ? null : agora,
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
  console.log(`Pronto: "${NOME}" com a conta demo ${email} (administrador só da demonstração).`);
  console.log("Códigos de visitante: K7M-4PX (hoje) e PRT-3ZB (prestador, 7 dias).");
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
