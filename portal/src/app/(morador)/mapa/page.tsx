import type { Metadata } from "next";
import { exigirPermissao } from "@/server/contexto";
import { MapaInterativo } from "./mapa-interativo";
import { TOTAL_LOTES } from "@/lib/planta";

export const metadata: Metadata = { title: "Mapa das casas" };

/** Mapa do morador (com login): só o desenho das quadras e números (sem nomes de moradores). */
export default async function MapaMorador() {
  await exigirPermissao("mapa.ver", "/mapa");

  return (
    // O mapa é o principal: título curto e o resto da tela para o desenho.
    <div className="flex flex-col gap-3">
      <header className="surgir flex flex-wrap items-baseline justify-between gap-x-3 rounded-[var(--radius-card)] border border-borda-luz bg-surface px-4 py-3 shadow-card">
        <h1 className="text-[1.45rem] font-bold text-destaque">Mapa das casas</h1>
        <p className="text-[0.88rem] text-muted">{TOTAL_LOTES} lotes · planta oficial</p>
      </header>
      <MapaInterativo />
    </div>
  );
}
