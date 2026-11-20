"use client";

/**
 * Caixa de busca de "Moradores e equipe" que pesquisa ENQUANTO a pessoa digita
 * (espera um instante entre as teclas, para não pesquisar letra por letra).
 * Só números = a casa com aquele número. Enter e a lupa continuam funcionando.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { classeEntrada } from "@/components/ui/basicos";
import { cx } from "@/lib/cx";

/** Tempo de espera depois da última tecla antes de pesquisar. */
const ESPERA_MS = 300;

export function BuscaAoDigitar({ inicial, papel, ordem }: { inicial: string; papel: string | null; ordem: string }) {
  const router = useRouter();
  const caminho = usePathname();
  const [valor, setValor] = useState(inicial);
  const [pesquisando, iniciar] = useTransition();
  const espera = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(espera.current), []);

  function aoDigitar(texto: string) {
    setValor(texto);
    window.clearTimeout(espera.current);
    espera.current = window.setTimeout(() => {
      const qs = new URLSearchParams();
      if (papel) qs.set("papel", papel);
      const limpo = texto.trim().slice(0, 60);
      if (limpo) qs.set("busca", limpo);
      if (ordem !== "nome") qs.set("ordem", ordem);
      iniciar(() => router.replace(`${caminho}${qs.size ? `?${qs}` : ""}`, { scroll: false }));
    }, ESPERA_MS);
  }

  return (
    <input
      id="busca"
      name="busca"
      type="search"
      value={valor}
      onChange={(e) => aoDigitar(e.target.value)}
      placeholder="Buscar pelo nome ou número da casa"
      autoComplete="off"
      aria-busy={pesquisando}
      className={cx(classeEntrada, pesquisando && "opacity-70")}
    />
  );
}
