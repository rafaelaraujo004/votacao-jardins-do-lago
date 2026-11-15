import type { Metadata } from "next";
import { abrirModulo } from "@/server/modulos";

export const metadata: Metadata = { title: "Portal do morador" };

/** Link curto /morador: leva cada pessoa para a versão do módulo do perfil dela (src/lib/modulos.ts). */
export default async function LinkMorador() {
  return abrirModulo("/morador");
}
