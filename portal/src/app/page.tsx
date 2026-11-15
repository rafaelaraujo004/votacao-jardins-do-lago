import { redirect } from "next/navigation";
import { getContexto } from "@/server/contexto";
import { destinoDaRaiz } from "@/lib/destino-seguro";

/**
 * Endereço principal. Nada aqui é aberto sem login:
 * - sem sessão → /entrar;
 * - com sessão → início do papel (morador /inicio, síndico e conselho /admin, portaria /portaria).
 */
export default async function Raiz() {
  redirect(destinoDaRaiz(await getContexto()));
}
