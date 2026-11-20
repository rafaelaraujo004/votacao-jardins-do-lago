import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import webpush from "web-push";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { calcularPermissoes, ehPapel, type Papel, type Permissao } from "@/lib/permissoes";
import { emPedacos, inscricaoExpirou, montarMensagem, type InscricaoPush, type MensagemPush } from "@/lib/push";

/**
 * NOTIFICAÇÕES NO CELULAR (Web Push) — servidor. Veja src/lib/push.ts.
 *
 * - Chaves VAPID (a "assinatura" do portal nas notificações): criadas sozinhas na
 *   primeira vez e guardadas em config/webpush (só o servidor lê; as regras negam tudo).
 * - Inscrições: condominiums/{c}/pushInscricoes/{hash do endereço} → { uid, endpoint, keys }.
 * - O envio roda DEPOIS de responder à pessoa (after): salvar nunca fica lento nem
 *   falha por causa de uma notificação. Erros só vão para o log.
 */

/** Contato que vai junto das notificações (exigência do padrão). */
const ASSUNTO = process.env.PUSH_ASSUNTO || "https://www.jardinsdolago.com.br";

type Chaves = { publicKey: string; privateKey: string };
let chavesEmMemoria: Chaves | null = null;

/** Chaves VAPID do portal (cria e guarda na primeira vez). */
export async function chavesPush(db: Firestore = adminDb()): Promise<Chaves> {
  if (chavesEmMemoria) return chavesEmMemoria;
  const ref = db.collection("config").doc("webpush");
  const chaves = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const publicKey = doc.get("publicKey");
    const privateKey = doc.get("privateKey");
    if (typeof publicKey === "string" && typeof privateKey === "string") return { publicKey, privateKey };
    const novas = webpush.generateVAPIDKeys();
    tx.create(ref, { ...novas, criadoEm: FieldValue.serverTimestamp() });
    return novas;
  });
  chavesEmMemoria = chaves;
  return chaves;
}

const inscricoes = (db: Firestore, condominioId: string) => db.collection("condominiums").doc(condominioId).collection("pushInscricoes");
const idDaInscricao = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex").slice(0, 40);

/** Guarda (ou atualiza) a inscrição deste aparelho para quem está logado. */
export async function guardarInscricao(condominioId: string, uid: string, inscricao: InscricaoPush, navegador: string): Promise<void> {
  const db = adminDb();
  await inscricoes(db, condominioId)
    .doc(idDaInscricao(inscricao.endpoint))
    .set({
      uid,
      endpoint: inscricao.endpoint,
      keys: inscricao.keys,
      navegador: navegador.slice(0, 160),
      atualizadoEm: FieldValue.serverTimestamp(),
    });
}

/** Tira a inscrição (a pessoa desligou as notificações ou saiu deste aparelho). */
export async function apagarInscricao(condominioId: string, uid: string, endpoint: string): Promise<void> {
  const ref = inscricoes(adminDb(), condominioId).doc(idDaInscricao(endpoint));
  const doc = await ref.get();
  if (doc.exists && doc.get("uid") === uid) await ref.delete();
}

// ---------- Para quem mandar ----------

/** Alvo de uma notificação: pessoas, uma casa, um papel ou quem tem uma permissão. */
export type AlvoPush =
  | { uids: string[] }
  | { casa: string }
  | { papeis: Papel[] }
  | { permissao: Permissao; papeis?: Papel[] };

async function resolverAlvo(db: Firestore, condominioId: string, alvo: AlvoPush): Promise<string[]> {
  if ("uids" in alvo) return [...new Set(alvo.uids.filter(Boolean))];
  const membros = db.collection("condominiums").doc(condominioId).collection("members");
  if ("casa" in alvo) {
    const snap = await membros.where("unitId", "==", alvo.casa).get();
    return snap.docs.filter((d) => d.get("status") === "ativo").map((d) => d.id);
  }
  const snap = await membros.where("status", "==", "ativo").get();
  return snap.docs
    .filter((d) => {
      const papel = d.get("papel");
      if (!ehPapel(papel)) return false;
      if (alvo.papeis && !alvo.papeis.includes(papel)) return false;
      if (!("permissao" in alvo)) return true;
      const extras = Array.isArray(d.get("permissoesExtras")) ? d.get("permissoesExtras") : [];
      const negadas = Array.isArray(d.get("permissoesNegadas")) ? d.get("permissoesNegadas") : [];
      return calcularPermissoes(papel, extras, negadas).has(alvo.permissao);
    })
    .map((d) => d.id);
}

// ---------- Envio ----------

/** Manda a notificação para os aparelhos inscritos do alvo. Nunca lança erro. */
export async function enviarPush(condominioId: string, alvo: AlvoPush, mensagem: MensagemPush, excetoUid?: string): Promise<number> {
  try {
    const db = adminDb();
    const uids = (await resolverAlvo(db, condominioId, alvo)).filter((u) => u !== excetoUid);
    if (!uids.length) return 0;
    const docs = (await Promise.all(emPedacos(uids).map((p) => inscricoes(db, condominioId).where("uid", "in", p).get()))).flatMap((s) => s.docs);
    if (!docs.length) return 0;
    const { publicKey, privateKey } = await chavesPush(db);
    const corpo = JSON.stringify(montarMensagem(mensagem));
    let entregues = 0;
    await Promise.all(
      docs.map(async (d) => {
        try {
          await webpush.sendNotification({ endpoint: d.get("endpoint"), keys: d.get("keys") }, corpo, {
            TTL: 24 * 60 * 60,
            urgency: "normal",
            vapidDetails: { subject: ASSUNTO, publicKey, privateKey },
          });
          entregues++;
        } catch (erro) {
          const status = (erro as { statusCode?: number }).statusCode;
          if (inscricaoExpirou(status)) await d.ref.delete().catch(() => undefined);
          else console.error("Push: falha ao entregar", status ?? "", (erro as Error).message);
        }
      }),
    );
    return entregues;
  } catch (erro) {
    console.error("Push: não foi possível enviar", erro);
    return 0;
  }
}

/**
 * Agenda o envio para DEPOIS da resposta (a tela não espera a notificação).
 * Use nas ações, depois que a gravação deu certo.
 */
export function avisarNoCelular(condominioId: string, alvo: AlvoPush, mensagem: MensagemPush, excetoUid?: string): void {
  try {
    after(() => enviarPush(condominioId, alvo, mensagem, excetoUid).then(() => undefined));
  } catch {
    // Fora de um pedido (ex.: script): manda na hora.
    void enviarPush(condominioId, alvo, mensagem, excetoUid);
  }
}
