"use client";

/**
 * Barra fina no topo que aparece NO MESMO INSTANTE do toque em qualquer link
 * interno, antes de o servidor responder. Some quando a nova tela chega.
 * Assim a pessoa sabe na hora que o toque funcionou.
 */
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Estado = "parada" | "andando" | "terminando";

export function BarraNavegacao() {
  const caminho = usePathname();
  const busca = useSearchParams();
  const [estado, setEstado] = useState<Estado>("parada");
  const limite = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A nova tela chegou: completa a barra (ajuste durante a renderização, sem efeito extra).
  const rota = `${caminho}?${busca.toString()}`;
  const [rotaAnterior, setRotaAnterior] = useState(rota);
  if (rota !== rotaAnterior) {
    setRotaAnterior(rota);
    if (estado === "andando") setEstado("terminando");
  }

  // Link com âncora (ex.: "/contatos#titulo-pix"): a tela chega por partes, então
  // rola até a âncora depois que ela existir (tenta algumas vezes, por pouco tempo).
  useEffect(() => {
    const ancora = decodeURIComponent(location.hash.slice(1));
    if (!ancora) return;
    let tentativas = 0;
    const id = setInterval(() => {
      const alvo = document.getElementById(ancora);
      if (alvo || ++tentativas > 20) {
        clearInterval(id);
        alvo?.scrollIntoView({ block: "start" });
      }
    }, 100);
    return () => clearInterval(id);
  }, [rota]);

  // ...e some logo depois.
  useEffect(() => {
    if (estado !== "terminando") return;
    if (limite.current) clearTimeout(limite.current);
    const t = setTimeout(() => setEstado((e) => (e === "terminando" ? "parada" : e)), 250);
    return () => clearTimeout(t);
  }, [estado]);

  useEffect(() => {
    function aoClicar(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as HTMLElement | null)?.closest?.("a");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const destino = new URL(link.href, location.href);
      if (destino.origin !== location.origin) return;
      // Mesmo endereço (ou só uma âncora #): não há tela nova a esperar.
      if (destino.pathname === location.pathname && destino.search === location.search) return;
      setEstado("andando");
      if (limite.current) clearTimeout(limite.current);
      // Segurança: nunca fica presa na tela.
      limite.current = setTimeout(() => setEstado("parada"), 10000);
    }
    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, []);

  return (
    <div
      aria-hidden
      data-estado={estado}
      className="barra-navegacao pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
    />
  );
}
