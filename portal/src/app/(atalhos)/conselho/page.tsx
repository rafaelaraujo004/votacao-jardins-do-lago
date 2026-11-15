import type { Metadata } from "next";
import { abrirModulo } from "@/server/modulos";

export const metadata: Metadata = { title: "Painel do conselho" };

/** Link curto /conselho: leva cada pessoa para a versão do módulo do perfil dela (src/lib/modulos.ts). */
export default async function LinkConselho() {
  return abrirModulo("/conselho");
}
