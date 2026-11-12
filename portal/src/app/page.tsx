import { redirect } from "next/navigation";
import { getContexto } from "@/server/contexto";
import { inicioDoPapel } from "@/lib/permissoes";

/** Endereço principal: leva cada pessoa para a sua tela inicial. */
export default async function Raiz() {
  const ctx = await getContexto();
  redirect(ctx ? inicioDoPapel(ctx.papel) : "/entrar");
}
