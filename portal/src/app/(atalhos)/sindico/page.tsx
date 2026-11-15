import type { Metadata } from "next";
import { abrirModulo } from "@/server/modulos";

export const metadata: Metadata = { title: "Painel do síndico" };

/** Link curto /sindico: leva cada pessoa para a versão do módulo do perfil dela (src/lib/modulos.ts). */
export default async function LinkSindico() {
  return abrirModulo("/sindico");
}
