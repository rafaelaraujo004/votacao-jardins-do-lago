import type { Metadata } from "next";
import { Info } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { Cartao } from "@/components/ui/basicos";
import { CabecalhoPagina } from "@/components/ui/painel";
import { MapaInterativo } from "./mapa-interativo";

export const metadata: Metadata = { title: "Mapa das casas" };

/** Mapa do morador (com login): só o desenho das quadras e números (sem nomes de moradores). */
export default async function MapaMorador() {
  await exigirPermissao("mapa.ver", "/mapa");

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina sobretitulo="Mapa" titulo="Mapa das casas" subtitulo="220 casas · Quadras A a H">
        {/* A planta real ainda não existe (Fase 5): deixamos isso bem claro. */}
        <p className="mt-3 inline-flex items-start gap-2 rounded-2xl bg-sand px-3 py-2 text-[0.9rem] font-bold text-ink">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-texto-areia" />
          Planta ilustrativa — a planta oficial do condomínio entra depois
        </p>
      </CabecalhoPagina>

      <Cartao>
        <MapaInterativo />
      </Cartao>

      <p className="text-center text-[0.88rem] text-muted">Desenho esquemático, fora de escala.</p>
    </div>
  );
}
