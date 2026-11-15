import type { Metadata } from "next";
import { exigirPermissao } from "@/server/contexto";
import { Cartao } from "@/components/ui/basicos";
import { CabecalhoPagina } from "@/components/ui/painel";
import { MapaInterativo } from "./mapa-interativo";
import { TOTAL_LOTES } from "@/lib/planta";

export const metadata: Metadata = { title: "Mapa das casas" };

/** Mapa do morador (com login): só o desenho das quadras e números (sem nomes de moradores). */
export default async function MapaMorador() {
  await exigirPermissao("mapa.ver", "/mapa");

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        sobretitulo="Mapa"
        titulo="Mapa das casas"
        subtitulo={`${TOTAL_LOTES} lotes · desenhado a partir da planta oficial`}
      />

      <Cartao className="p-3 sm:p-5">
        <MapaInterativo />
      </Cartao>

      <p className="text-center text-[0.88rem] text-muted">Desenho feito a partir da planta oficial do condomínio, sem escala.</p>
    </div>
  );
}
