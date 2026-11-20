import "server-only";
import { createHash } from "node:crypto";
import { Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";

/**
 * Limite de tentativas, guardado no próprio Firestore (sem serviço extra).
 * Ex.: no máximo 10 logins por IP a cada 5 minutos.
 * A chave é um hash: o IP não fica gravado em texto no banco.
 * O campo `expiraEm` diz até quando a contagem vale; documento vencido é
 * reaproveitado na próxima tentativa (sem política de expiração automática — TTL).
 */

/** Documento do limite de `acao` para `identificador` (a chave é um hash: nada em texto). */
export function refLimite(db: Firestore, acao: string, identificador: string): DocumentReference {
  const chave = createHash("sha256").update(`${acao}:${identificador}`).digest("hex");
  return db.collection("rateLimits").doc(chave);
}

/**
 * Janela atual do limite: início e quantas tentativas já contaram nela.
 * Documento vencido (ou que não existe) começa uma janela nova, com zero.
 */
export function janelaDoLimite(
  dados: { inicio?: unknown; contagem?: unknown } | undefined,
  agoraMs: number,
  janelaSegundos: number,
): { inicio: number; contagem: number } {
  const inicio = typeof dados?.inicio === "number" ? dados.inicio : undefined;
  const dentro = inicio !== undefined && agoraMs - inicio < janelaSegundos * 1000;
  if (!dentro) return { inicio: agoraMs, contagem: 0 };
  return { inicio, contagem: typeof dados?.contagem === "number" ? dados.contagem : 0 };
}

export async function consumirTentativa(
  db: Firestore,
  acao: string,
  identificador: string,
  limite: number,
  janelaSegundos: number,
): Promise<{ permitido: boolean; restantes: number }> {
  const ref = refLimite(db, acao, identificador);
  const agora = Date.now();

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const { inicio, contagem } = janelaDoLimite(doc.data(), agora, janelaSegundos);

    if (contagem >= limite) return { permitido: false, restantes: 0 };

    tx.set(ref, {
      acao,
      inicio,
      contagem: contagem + 1,
      expiraEm: Timestamp.fromMillis(inicio + janelaSegundos * 1000),
    });
    return { permitido: true, restantes: limite - contagem - 1 };
  });
}

/**
 * Só CONSULTA se a chave já passou do limite (não conta uma tentativa).
 * Use com consumirTentativa chamado só nas tentativas ERRADAS: assim acertar não gasta tentativas.
 */
export async function limiteEstourado(
  db: Firestore,
  acao: string,
  identificador: string,
  limite: number,
  janelaSegundos: number,
): Promise<boolean> {
  const dados = (await refLimite(db, acao, identificador).get()).data();
  return janelaDoLimite(dados, Date.now(), janelaSegundos).contagem >= limite;
}
