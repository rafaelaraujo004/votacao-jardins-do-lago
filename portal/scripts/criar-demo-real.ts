/**
 * Cria (ou recria) o condomínio de DEMONSTRAÇÃO no Firebase REAL, separado do condomínio verdadeiro.
 * Serve para mostrar e testar o portal sem tocar nos dados reais do Jardins do Lago.
 *
 * - Condomínio "jardins-do-lago-demo" (marcado demo: true → o portal mostra "dados fictícios").
 * - Uma conta demo com papel de administrador SÓ desse condomínio (não vê o condomínio real).
 * - Um MORADOR demo da Casa 12, que entra na aba "Sou morador" com o usuário DEMA22
 *   e a MESMA senha (DEMO_SENHA), sem troca obrigatória. ("DEMO12" não serve: o usuário
 *   não pode ter O nem 1 — veja src/lib/usuario-morador.ts.)
 * - Informações fictícias (telefones de mentira). Como todo o portal, só abrem com login:
 *   o morador demo entra por "/entrar?c=jardins-do-lago-demo" (o ?c= só monta o login).
 * - Casas, visitantes, encomendas e reservas fictícias; áreas com as MESMAS regras do condomínio real.
 * - Comunicados, solicitações, documentos (links de exemplo), enquetes e classificados fictícios.
 * - Áreas antigas da demonstração (salão, churrasqueira...) ficam desativadas (nada é apagado).
 *
 * Uso (na pasta portal), com a senha numa variável de ambiente (não fica no histórico do git):
 *   DEMO_SENHA="..." npx tsx --env-file=.env.production.local scripts/criar-demo-real.ts --email demo@exemplo.test
 */
import { parseArgs } from "node:util";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { hojeISO } from "../src/lib/formato";
import { INFORMACOES_DEMO, USUARIO_MORADOR_DEMO } from "../src/lib/demo";
import { emailDoMorador } from "../src/lib/usuario-morador";
import { hashDoCodigo } from "../src/lib/portaria";
import { somarDias } from "../src/lib/reservas";
import { AREAS_JARDINS_DO_LAGO } from "../src/lib/areas-jardins";
import { semearAreasDemo, semearModulosDemo } from "./demo-modulos";

const ID = "jardins-do-lago-demo";
const NOME = "Jardins do Lago — DEMONSTRAÇÃO";
/** uid fixo do morador demo no Firebase real. */
const UID_MORADOR = "demo-real-morador-casa-012";
const NOME_MORADOR = "Ana Demonstração";

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

  // Morador demo (Casa 12): e-mail sintético do usuário DEMA22 + a mesma senha da conta demo.
  const emailMorador = emailDoMorador(USUARIO_MORADOR_DEMO, ID);
  try {
    const existente = await auth.getUser(UID_MORADOR);
    await auth.updateUser(existente.uid, { email: emailMorador, password: senha, displayName: NOME_MORADOR, disabled: false });
  } catch (erro) {
    if ((erro as { code?: string }).code !== "auth/user-not-found") throw erro;
    await auth.createUser({ uid: UID_MORADOR, email: emailMorador, password: senha, displayName: NOME_MORADOR });
  }

  const lote = db.batch();
  lote.set(db.doc(c), {
    nome: NOME,
    status: "ativo",
    fuso: "America/Belem",
    moeda: "BRL",
    demo: true,
    informacoes: INFORMACOES_DEMO,
    criadoEm: agora,
  });
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

  lote.set(db.doc(`users/${UID_MORADOR}`), { nome: NOME_MORADOR, condominioIds: [ID], condominioAtivo: ID, demo: true });
  lote.set(db.doc(`${c}/members/${UID_MORADOR}`), {
    nome: NOME_MORADOR,
    papel: "morador",
    unitId: "casa-012",
    status: "ativo",
    permissoesExtras: [],
    permissoesNegadas: [],
    usuario: USUARIO_MORADOR_DEMO,
    usuarioCriadoEm: agora,
    precisaTrocarSenha: false, // conta de testes: senha combinada, sem troca obrigatória
    demo: true,
    criadoEm: agora,
  });
  // Índice de unicidade do usuário (usernames/{codigo} → uid).
  lote.set(db.doc(`${c}/usernames/${USUARIO_MORADOR_DEMO}`), { uid: UID_MORADOR, criadoEm: agora, criadoPor: uid });

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

  // Áreas (as regras reais), reservas e módulos novos, com dados fictícios.
  const pessoas = { hoje, adminUid: uid, adminNome: nomeConta, moradorUid: UID_MORADOR, moradorNome: NOME_MORADOR };
  semearAreasDemo(db, lote, c, pessoas);
  semearModulosDemo(db, lote, c, pessoas);

  // Áreas antigas da demonstração: desativa e libera as travas de horário delas.
  const idsReais = new Set(AREAS_JARDINS_DO_LAGO.map((a) => a.id));
  const antigas = (await db.collection(`${c}/amenities`).get()).docs.filter((d) => !idsReais.has(d.id));
  for (const d of antigas) {
    lote.update(d.ref, { ativa: false });
    const travas = await db.collection(`${c}/reservationLocks`).where("amenityId", "==", d.id).get();
    for (const t of travas.docs) lote.delete(t.ref);
  }

  await lote.commit();
  console.log(`Pronto: "${NOME}" com a conta demo ${email} (administrador só da demonstração).`);
  console.log(`Morador demo (Casa 12): aba "Sou morador", usuário ${USUARIO_MORADOR_DEMO}, a mesma senha (DEMO_SENHA). Link: /entrar?c=${ID}`);
  console.log("Códigos de visitante: K7M-4PX (hoje) e PRT-3ZB (prestador, 7 dias).");
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
