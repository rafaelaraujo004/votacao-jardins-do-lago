/* eslint-disable @typescript-eslint/no-require-imports -- arquivo CommonJS carregado com node --require */
/**
 * Deixa um script do terminal usar funções do portal marcadas "só servidor" (import "server-only").
 * O pacote "server-only" dá erro fora do Next; aqui ele vira um módulo vazio (como nos testes).
 * Uso: npx tsx --require ./scripts/apoio/sem-server-only.cjs scripts/<script>.ts
 */
const Module = require("node:module");
const original = Module._resolveFilename;
Module._resolveFilename = function (pedido, ...resto) {
  if (pedido === "server-only") return require.resolve("./vazio.cjs");
  return original.call(this, pedido, ...resto);
};
