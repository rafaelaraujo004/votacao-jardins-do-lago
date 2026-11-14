import { redirect } from "next/navigation";

/**
 * Endereço principal = LINK PÚBLICO dos moradores (sem login).
 * Leva para o Início mantendo o ?c= (ex.: "/?c=jardins-do-lago-demo").
 * A equipe (síndico, conselho, portaria) entra por /entrar.
 */
export default async function Raiz({ searchParams }: PageProps<"/">) {
  const { c } = await searchParams;
  const id = (Array.isArray(c) ? c[0] : c)?.trim().slice(0, 64);
  redirect(id ? `/inicio?c=${encodeURIComponent(id)}` : "/inicio");
}
