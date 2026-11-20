/**
 * Prepara a foto NO NAVEGADOR antes de enviar: reduz (lado maior de 1600 px) e
 * regrava em JPEG. Fica leve para o celular enviar e os dados escondidos da foto
 * (como a localização GPS) ficam para trás. Só roda no navegador (usa canvas).
 */
import { tamanhoReduzido } from "./fotos";

const QUALIDADE_JPEG = 0.82;

function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => erro(new Error("Não consegui abrir essa foto. Tente outra (JPG ou PNG)."));
    img.src = url;
  });
}

/** Devolve a foto reduzida, em JPEG. Lança erro com mensagem em português se não der. */
export async function reduzirFoto(arquivo: File): Promise<Blob> {
  if (!arquivo.type.startsWith("image/")) throw new Error("Escolha uma foto (imagem).");
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await carregarImagem(url);
    const { largura, altura } = tamanhoReduzido(img.naturalWidth, img.naturalHeight);
    if (!largura || !altura) throw new Error("Não consegui abrir essa foto. Tente outra.");
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const g = canvas.getContext("2d");
    if (!g) throw new Error("Seu navegador não conseguiu preparar a foto. Tente outro navegador.");
    // Fundo branco: PNG com partes transparentes não fica preto no JPEG.
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, largura, altura);
    // O navegador já desenha a foto "em pé" (respeita a rotação gravada pelo celular).
    g.drawImage(img, 0, 0, largura, altura);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", QUALIDADE_JPEG));
    if (!blob) throw new Error("Não consegui preparar essa foto. Tente outra.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
