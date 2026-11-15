import "server-only";
/**
 * Leitura dos sinais de mudança para as telas abertas (GET /api/sinais).
 * Veja src/lib/sincronizacao.ts e src/server/sinais.ts.
 */
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { carregarContexto } from "../contexto";
import { refSinais } from "../sinais";
import { MODULOS_SINC, type Sinais } from "@/lib/sincronizacao";

/**
 * Condomínio de cada pessoa, guardado por 2 minutos em cada servidor: as telas perguntam
 * os sinais a cada poucos segundos e não precisamos reler o cadastro toda vez.
 * (Suspender alguém continua valendo na hora nas páginas, que conferem tudo a cada pedido.)
 */
const VALIDADE_MS = 2 * 60 * 1000;
const condominioDaPessoa = new Map<string, { condominioId: string; ate: number }>();

async function condominioDe(uid: string): Promise<string | null> {
  const agora = Date.now();
  const guardado = condominioDaPessoa.get(uid);
  if (guardado && guardado.ate > agora) return guardado.condominioId;
  const ctx = await carregarContexto(adminDb(), uid);
  if (!ctx) {
    condominioDaPessoa.delete(uid);
    return null;
  }
  if (condominioDaPessoa.size > 5000) condominioDaPessoa.clear();
  condominioDaPessoa.set(uid, { condominioId: ctx.condominioId, ate: agora + VALIDADE_MS });
  return ctx.condominioId;
}

/** Sinais do condomínio da pessoa (null = sem acesso ativo). */
export async function sinaisDaPessoa(uid: string): Promise<Sinais | null> {
  const condominioId = await condominioDe(uid);
  if (!condominioId) return null;
  const doc = await refSinais(adminDb(), condominioId).get();
  const sinais: Sinais = {};
  for (const m of MODULOS_SINC) {
    const v = doc.get(m);
    if (v instanceof Timestamp) sinais[m] = v.toMillis();
  }
  return sinais;
}
