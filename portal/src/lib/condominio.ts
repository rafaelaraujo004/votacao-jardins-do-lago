/**
 * Informações fixas do Residencial Jardins do Lago.
 * (Quando houver mais de um condomínio, isto passa a vir do cadastro do condomínio.)
 */
export const ENDERECO = {
  logradouro: "Rodovia PA-160",
  bairro: "Serra Dourada II",
  cidade: "Canaã dos Carajás",
  uf: "PA",
  cep: "68352-193",
} as const;

/** "Rodovia PA-160, Serra Dourada II" */
export const ENDERECO_LINHA = `${ENDERECO.logradouro}, ${ENDERECO.bairro}`;

/** "Canaã dos Carajás – PA" */
export const ENDERECO_CIDADE = `${ENDERECO.cidade} – ${ENDERECO.uf}`;

/** Endereço completo, do jeito que se cola num aplicativo de entrega ou mapa. */
export const ENDERECO_COMPLETO = `Residencial Jardins do Lago, ${ENDERECO_LINHA}, ${ENDERECO_CIDADE}, ${ENDERECO.cep}`;

/** Telefones de emergência (números nacionais reais). */
export const EMERGENCIAS = [
  { numero: "190", nome: "Polícia", detalhe: "Militar" },
  { numero: "192", nome: "SAMU", detalhe: "Ambulância" },
  { numero: "193", nome: "Bombeiros", detalhe: "Incêndio e resgate" },
] as const;
