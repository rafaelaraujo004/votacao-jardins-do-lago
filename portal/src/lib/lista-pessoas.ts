/**
 * Ordem da lista de "Moradores e equipe" (código puro, testado em tests/unit/lista-pessoas.test.ts).
 * - "nome": de A a Z (sem diferença de acentos e maiúsculas);
 * - "casa": pelo NÚMERO da casa (Casa 2 antes da Casa 10); na mesma casa, por nome;
 *   quem não tem casa (equipe) vai para o fim.
 */

export const ORDENS_PESSOAS = ["nome", "casa"] as const;
export type OrdemPessoas = (typeof ORDENS_PESSOAS)[number];

export function ehOrdemPessoas(v: unknown): v is OrdemPessoas {
  return typeof v === "string" && (ORDENS_PESSOAS as readonly string[]).includes(v);
}

/** "Casa 135" → 135; "Lote 12-B" → 12; sem número → null. */
export function numeroDoRotulo(rotulo: string | null | undefined): number | null {
  const m = rotulo?.match(/\d+/);
  return m ? Number(m[0]) : null;
}

const porNome = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });

/** Devolve uma lista NOVA na ordem pedida (não mexe na original). */
export function ordenarPessoas<T extends { nome: string; unitId: string | null }>(
  lista: readonly T[],
  ordem: OrdemPessoas,
  numeroDaCasa: (unitId: string) => number | null,
): T[] {
  if (ordem === "nome") return [...lista].sort((a, b) => porNome(a.nome, b.nome));
  const numero = (p: T) => (p.unitId ? numeroDaCasa(p.unitId) : null) ?? Number.POSITIVE_INFINITY;
  return [...lista].sort((a, b) => numero(a) - numero(b) || porNome(a.nome, b.nome));
}

/** Quantas casas diferentes aparecem na lista. */
export function contarCasas(lista: readonly { unitId: string | null }[]): number {
  return new Set(lista.map((p) => p.unitId).filter(Boolean)).size;
}
