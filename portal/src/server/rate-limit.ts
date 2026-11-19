import "server-only";
import { createHash } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";

/**
 * Limite de tentativas, guardado no próprio Firestore (sem serviço extra).
 * Ex.: no máximo 10 logins por IP a cada 5 minutos.
 * A chave é um hash: o IP não fica gravado em texto no banco.
 * O campo `expiraEm` diz até quando a contagem vale; documento vencido é
 * reaproveitado na próxima tentativa (o projeto está no plano gratuito
 * Spark, sem política de expiração automática — TTL).
 */
export async function consumirTentativa(
  db: Firestore,
  acao: string,
  identificador: string,
  limite: number,
  janelaSegundos: number,
): Promise<{ permitido: boolean; restantes: number }> {
  const chave = createHash("sha256").update(`${acao}:${identificador}`).digest("hex");
  const ref = db.collection("rateLimits").doc(chave);
  const agora = Date.now();

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const dados = doc.data() as { inicio?: number; contagem?: number } | undefined;
    const dentroDaJanela =
      dados?.inicio !== undefined && agora - dados.inicio < janelaSegundos * 1000;
    const inicio = dentroDaJanela && dados?.inicio !== undefined ? dados.inicio : agora;
    const contagem = dentroDaJanela ? (dados?.contagem ?? 0) : 0;

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
  const chave = createHash("sha256").update(`${acao}:${identificador}`).digest("hex");
  const dados = (await db.collection("rateLimits").doc(chave).get()).data() as { inicio?: number; contagem?: number } | undefined;
  if (dados?.inicio === undefined || Date.now() - dados.inicio >= janelaSegundos * 1000) return false;
  return (dados.contagem ?? 0) >= limite;
}
