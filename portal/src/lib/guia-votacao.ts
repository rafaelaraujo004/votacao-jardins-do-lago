/**
 * PASSO A PASSO DA VOTAÇÃO (imagens): as 9 imagens que ensinam a votar pelo celular.
 * Ficam em public/guia-votacao/ (1080×1350, JPG). Mostram uma casa de exemplo ("Casa 12",
 * senha 482913, morador "Maria"). O passo 3 mostra os nomes da CHAPA real (José Amaral, Iza
 * Rabelo, Aliny, Bruno, Andrey), que são públicos para quem vota e já estão no
 * scripts/cadastrar-votacao.ts; se a chapa mudar, refaça as imagens (guia-votacao/fonte/).
 * Nenhum dado pessoal de morador. A fonte (PNG e PDF) fica na pasta guia-votacao/ da raiz.
 *
 * Usadas em:
 * - envio pelo WhatsApp (a comissão manda as imagens junto com o link de cada casa);
 * - o guia "Como votar" na página do link de voto e na votação do morador;
 * - a prévia do link no WhatsApp (og:image = capa).
 */

export type ImagemGuia = {
  /** Caminho público (começa com /). */
  src: string;
  /** Nome do arquivo ao compartilhar/baixar. */
  arquivo: string;
  /** Título curto do passo. */
  titulo: string;
  /** Texto alternativo (leitores de tela) — descreve o que a imagem ensina. */
  alt: string;
  /**
   * A instrução do passo em letra normal, embaixo da imagem: no celular a imagem fica pequena
   * (e o zoom do portal é bloqueado), então quem não abrir a imagem ainda lê o que fazer.
   */
  texto: string;
};

export const LARGURA_GUIA = 1080;
export const ALTURA_GUIA = 1350;

export const IMAGENS_GUIA: readonly ImagemGuia[] = [
  {
    src: "/guia-votacao/00-capa.jpg",
    arquivo: "como-votar-00-capa.jpg",
    titulo: "Como votar pelo celular",
    alt: "Capa: como votar pelo celular. Link e senha chegam no WhatsApp, um voto por casa, sem login, e o voto é secreto. Leva menos de 2 minutos.",
    texto: "O link e a senha da sua casa chegam no WhatsApp. Um voto por casa, sem login, e o voto é secreto.",
  },
  {
    src: "/guia-votacao/01-passo-1.jpg",
    arquivo: "como-votar-01-abra-a-mensagem.jpg",
    titulo: "Passo 1: abra a mensagem",
    alt: "Passo 1 de 7: abra a mensagem da comissão no WhatsApp. Ela traz a senha de 6 números da sua casa e o link. Toque no link.",
    texto: "Abra a mensagem da comissão no WhatsApp. Ela traz a senha de 6 números da sua casa e o link. Toque no link.",
  },
  {
    src: "/guia-votacao/02-passo-2.jpg",
    arquivo: "como-votar-02-digite-a-senha.jpg",
    titulo: "Passo 2: digite a senha",
    alt: "Passo 2 de 7: digite a senha de 6 números no campo indicado e toque em Entrar para votar.",
    texto: "Digite a senha de 6 números e toque em Entrar para votar.",
  },
  {
    src: "/guia-votacao/03-passo-3.jpg",
    arquivo: "como-votar-03-escolha.jpg",
    titulo: "Passo 3: confira a chapa e escolha",
    alt: "Passo 3 de 7: confira os integrantes da chapa e toque em SIM se aprova a chapa ou em NÃO se não aprova.",
    texto: "Confira a chapa. Toque em SIM se aprova ou em NÃO se não aprova.",
  },
  {
    src: "/guia-votacao/04-passo-4.jpg",
    arquivo: "como-votar-04-revisar.jpg",
    titulo: "Passo 4: toque em Revisar meu voto",
    alt: "Passo 4 de 7: o botão escolhido fica verde; para mudar, toque no outro. Depois toque em Revisar meu voto.",
    texto: "O botão escolhido fica verde (para mudar, toque no outro). Depois toque em Revisar meu voto.",
  },
  {
    src: "/guia-votacao/05-passo-5.jpg",
    arquivo: "como-votar-05-confirmar.jpg",
    titulo: "Passo 5: confira e confirme",
    alt: "Passo 5 de 7: confira o seu voto na janela e toque em Confirmar voto. Para mudar, toque em Voltar e mudar.",
    texto: "Confira o seu voto e toque em Confirmar voto. Para mudar, toque em Voltar e mudar.",
  },
  {
    src: "/guia-votacao/06-passo-6.jpg",
    arquivo: "como-votar-06-pronto.jpg",
    titulo: "Passo 6: pronto, voto registrado",
    alt: "Passo 6 de 7: aparece Voto já realizado. Se quiser, toque em Baixar comprovante (PDF).",
    texto: "Pronto! Aparece Voto já realizado. Se quiser, baixe o comprovante.",
  },
  {
    src: "/guia-votacao/07-passo-7.jpg",
    arquivo: "como-votar-07-comprovante.jpg",
    titulo: "Passo 7: o comprovante",
    alt: "Passo 7 de 7: o comprovante mostra a casa, a data e a hora e um código. Ele não mostra em quem você votou.",
    texto: "O comprovante mostra a casa, a data, a hora e um código. Ele não mostra em quem você votou.",
  },
  {
    src: "/guia-votacao/08-dicas.jpg",
    arquivo: "como-votar-08-dicas.jpg",
    titulo: "Dicas importantes",
    alt: "Dicas: um voto por casa; o voto é secreto; errou a senha 5 vezes, espere 15 minutos; não repasse o link nem a senha; fora do horário o link não deixa votar; dúvidas, fale com a comissão eleitoral.",
    texto: "Um voto por casa. Errou a senha 5 vezes? Espere 15 minutos. Não repasse o link nem a senha. Dúvidas: fale com a comissão.",
  },
];

/** Capa (usada como prévia do link no WhatsApp). */
export const CAPA_GUIA = IMAGENS_GUIA[0];

/**
 * O MESMO passo a passo num PDF só (as 9 imagens acima, uma por página, ~1 MB).
 * Serve quando o celular ou o WhatsApp não aceita mandar as 9 imagens juntas: vai 1 arquivo.
 * Também é o que a pessoa baixa para guardar ou imprimir. Se as imagens mudarem, refaça o PDF
 * (fonte na pasta guia-votacao/ da raiz) e ajuste `paginas`.
 */
export const PDF_GUIA = {
  /** Caminho público (começa com /). */
  src: "/guia-votacao/como-votar-jardins-do-lago.pdf",
  /** Nome do arquivo ao compartilhar/baixar. */
  arquivo: "Como votar - Jardins do Lago.pdf",
  /** Número de páginas (uma por imagem). */
  paginas: 9,
} as const;

/** Texto geral para mandar junto com as imagens no grupo do condomínio (sem link nem senha). */
export function textoGuiaGrupo(o: { condominio?: string; titulo?: string; periodo?: string }): string {
  return [
    `🗳️ *Como votar pelo celular* — ${o.titulo || "Votação oficial"} do ${o.condominio || "Residencial Jardins do Lago"}.`,
    o.periodo ? `📅 Votação: ${o.periodo}.` : "",
    "",
    "Cada casa vai receber no WhatsApp uma mensagem da comissão com o *link* e a *senha de 6 números*. É só seguir os passos das imagens:",
    "1. Toque no link.",
    "2. Digite a senha.",
    "3. Escolha e toque em Revisar meu voto.",
    "4. Toque em Confirmar voto. Pronto!",
    "",
    "Vale *um voto por casa* e o voto é *secreto*. Não repasse o link nem a senha.",
  ]
    .filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""))
    .join("\n");
}
