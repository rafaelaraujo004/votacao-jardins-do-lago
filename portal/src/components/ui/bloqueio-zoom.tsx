"use client";

/**
 * Bloqueia o zoom de pinça e o zoom por duplo toque no celular.
 * O iPhone (Safari) ignora o "user-scalable=no" da página, por isso é preciso
 * barrar o gesto aqui também. Ctrl + roda do mouse / Ctrl + "+" no computador
 * também ficam bloqueados.
 */
import { useEffect } from "react";

export function BloqueioZoom() {
  useEffect(() => {
    const impedir = (e: Event) => e.preventDefault();

    // Pinça com dois dedos.
    const aoMover = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };

    // Duplo toque rápido.
    let ultimoToque = 0;
    const aoSoltar = (e: TouchEvent) => {
      const agora = Date.now();
      if (agora - ultimoToque < 300 && !(e.target as HTMLElement | null)?.closest("input, textarea, select")) {
        e.preventDefault();
      }
      ultimoToque = agora;
    };

    // Computador: Ctrl + roda do mouse e Ctrl + "+" / "-" / "0".
    const aoRolar = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0"].includes(e.key)) e.preventDefault();
    };

    document.addEventListener("gesturestart", impedir, { passive: false } as AddEventListenerOptions);
    document.addEventListener("gesturechange", impedir, { passive: false } as AddEventListenerOptions);
    document.addEventListener("touchmove", aoMover, { passive: false });
    document.addEventListener("touchend", aoSoltar, { passive: false });
    window.addEventListener("wheel", aoRolar, { passive: false });
    window.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("gesturestart", impedir);
      document.removeEventListener("gesturechange", impedir);
      document.removeEventListener("touchmove", aoMover);
      document.removeEventListener("touchend", aoSoltar);
      window.removeEventListener("wheel", aoRolar);
      window.removeEventListener("keydown", aoTeclar);
    };
  }, []);

  return null;
}
