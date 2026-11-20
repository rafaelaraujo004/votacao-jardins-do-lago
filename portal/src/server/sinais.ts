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

/** Estado das marcas "depois" deste servidor, por condomínio/módulo. */
type EstadoMarca = { ultima: number; rodando: Promise<void> | null; sujo: boolean };
const marcasDepois = new Map<string, EstadoMarca>();

const esperar = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/**
 * Marca "o módulo mudou" FORA da transação, DEPOIS que a gravação deu certo.
 * Usado pelo voto (chamado com after(), sem atrasar a resposta): no dia da eleição muitas
 * casas votam juntas, e o documento de sinais (um só por condomínio) não deve ser disputado
 * por cada transação de voto.
 * - no máximo uma marca a cada `intervaloMs` em cada servidor; votos em rajada viram uma marca;
 * - a ÚLTIMA mudança da rajada sempre ganha uma marca posterior a ela ("sujo"), para a tela
 *   da comissão nunca ficar sem o último voto;
 * - se a gravação falhar, só registra no log: o voto já está gravado, e as telas se
 *   atualizam na próxima marca (ou sozinhas, a cada 30 min).
 */
export function marcarMudancaDepois(
  db: Firestore,
  condominioId: string,
  modulo: ModuloSinc,
  intervaloMs = 1000,
): Promise<void> {
  const chave = `${condominioId}/${modulo}`;
  if (!marcasDepois.has(chave) && marcasDepois.size > 1000) marcasDepois.clear();
  const estado = marcasDepois.get(chave) ?? { ultima: 0, rodando: null, sujo: false };
  marcasDepois.set(chave, estado);
  if (estado.rodando) {
    // Já há uma marca a caminho: ela grava de novo no fim, depois desta mudança.
    estado.sujo = true;
    return estado.rodando;
  }
  estado.rodando = (async () => {
    do {
      estado.sujo = false;
      const espera = estado.ultima + intervaloMs - Date.now();
      if (espera > 0) await esperar(espera);
      estado.ultima = Date.now();
      try {
        await refSinais(db, condominioId).set({ [modulo]: FieldValue.serverTimestamp() }, { merge: true });
      } catch (erro) {
        estado.ultima = 0;
        console.error("Sinais: marca depois da gravação falhou", chave, erro);
      }
    } while (estado.sujo);
  })().finally(() => {
    estado.rodando = null;
  });
  return estado.rodando;
}
