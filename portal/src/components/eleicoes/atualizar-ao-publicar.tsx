"use client";

/**
 * Início/Painel SEM votação em destaque: quando a comissão publica uma votação (sinal
 * "eleicoes" do <Sincronizar>), atualiza a tela uma vez para o painel da votação aparecer no
 * topo. Com o painel já na tela, quem se atualiza é o próprio painel (painel-destaque.tsx) — por
 * isso o Início e o Painel não recarregam a cada voto (src/lib/sincronizacao.ts).
 * Não desenha nada.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EVENTO_SINAIS } from "@/lib/sincronizacao";

export function AtualizarAoPublicar() {
  const router = useRouter();
  useEffect(() => {
    const aoSinal = (e: Event) => {
      const modulos = (e as CustomEvent<{ modulos?: string[] }>).detail?.modulos ?? [];
      if (modulos.includes("eleicoes")) router.refresh();
    };
    window.addEventListener(EVENTO_SINAIS, aoSinal);
    return () => window.removeEventListener(EVENTO_SINAIS, aoSinal);
  }, [router]);
  return null;
}
