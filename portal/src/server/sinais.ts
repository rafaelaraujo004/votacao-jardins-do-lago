import "server-only";
/**
 * Sinais de mudança (veja src/lib/sincronizacao.ts).
 *
 * Documento: condominiums/{c}/sistema/sinais = { reservas: <data>, portaria: <data>, ... }
 * - GRAVADO junto com a auditoria, na mesma transação/lote da alteração;
 * - LIDO pelas telas abertas (GET /api/sinais) para saber se precisam se atualizar.
 * Não guarda nenhum dado pessoal: só "o módulo X mudou às HH:MM:SS".
 */
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Transaction,
  type WriteBatch,
} from "firebase-admin/firestore";
import type { ModuloSinc } from "@/lib/sincronizacao";

export function refSinais(db: Firestore, condominioId: string): DocumentReference {
  return db.collection("condominiums").doc(condominioId).collection("sistema").doc("sinais");
}

/**
 * Cada transação/lote marca cada módulo uma vez só (algumas ações gravam duas auditorias juntas).
 * WeakMap: some sozinho da memória quando a transação termina.
 */
const jaMarcados = new WeakMap<Transaction | WriteBatch, Set<string>>();

/** Marca "o módulo mudou agora", dentro da mesma gravação da alteração. */
export function marcarMudanca(
  db: Firestore,
  escrita: Transaction | WriteBatch,
  condominioId: string,
  modulo: ModuloSinc,
): void {
  const chave = `${condominioId}/${modulo}`;
  const marcados = jaMarcados.get(escrita) ?? new Set<string>();
  if (marcados.has(chave)) return;
  marcados.add(chave);
  jaMarcados.set(escrita, marcados);
  const ref = refSinais(db, condominioId);
  const dados = { [modulo]: FieldValue.serverTimestamp() };
  // (O TypeScript não junta as duas assinaturas de "set"; por isso o if.)
  if ("get" in escrita) escrita.set(ref, dados, { merge: true });
  else escrita.set(ref, dados, { merge: true });
}
