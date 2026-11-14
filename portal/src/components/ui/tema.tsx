"use client";

/** Botão de modo claro/escuro. A escolha fica guardada neste aparelho. */
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cx } from "@/lib/cx";

type Tema = "light" | "dark";

function temaAtual(): Tema {
  const escolhido = document.documentElement.dataset.theme;
  if (escolhido === "light" || escolhido === "dark") return escolhido;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Avisa o React quando o tema muda (pelo botão ou pelo aparelho). */
function observar(aoMudar: () => void) {
  const observador = new MutationObserver(aoMudar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const midia = window.matchMedia("(prefers-color-scheme: dark)");
  midia.addEventListener("change", aoMudar);
  return () => {
    observador.disconnect();
    midia.removeEventListener("change", aoMudar);
  };
}

export function BotaoTema({ className }: { className?: string }) {
  const tema = useSyncExternalStore<Tema | null>(observar, temaAtual, () => null);

  function alternar() {
    const novo: Tema = temaAtual() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = novo;
    try {
      localStorage.setItem("tema", novo);
    } catch {
      // navegação privada: o tema vale só nesta visita
    }
  }

  const escuro = tema === "dark";
  return (
    <button
      type="button"
      onClick={alternar}
      className={cx("grid size-11 place-items-center rounded-full transition-colors", className)}
      aria-label={escuro ? "Usar modo claro" : "Usar modo escuro"}
      title={escuro ? "Modo claro" : "Modo escuro"}
    >
      {escuro ? <Sun aria-hidden className="size-5" /> : <Moon aria-hidden className="size-5" />}
    </button>
  );
}
