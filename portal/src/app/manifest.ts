import type { MetadataRoute } from "next";

/**
 * Manifesto do app: nome e ícone (a flor do logo do condomínio) usados quando
 * o morador "adiciona à tela inicial" do celular.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Portal Jardins do Lago",
    short_name: "Jardins do Lago",
    description: "Portal do Residencial Jardins do Lago: contas, visitantes, reservas e comunicados.",
    start_url: "/inicio",
    display: "standalone",
    background_color: "#f4f3ea",
    theme_color: "#12382a",
    lang: "pt-BR",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
