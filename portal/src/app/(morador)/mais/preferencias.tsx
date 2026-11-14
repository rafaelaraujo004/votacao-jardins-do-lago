"use client";

/**
 * Preferências deste aparelho: modo escuro e letra grande.
 * As escolhas ficam guardadas no navegador (localStorage), não na conta.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { cx } from "@/lib/cx";

// ---------- Modo escuro (mesma lógica de components/ui/tema.tsx) ----------

function escuroAgora(): boolean {
  const escolhido = document.documentElement.dataset.theme;
  if (escolhido === "light" || escolhido === "dark") return escolhido === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// ---------- Letra grande ----------

// O tamanho fica no globals.css: normal 106,25% (17px); com data-letra="grande", 118,75% (19px).
// O app/layout.tsx reaplica a escolha guardada antes de pintar qualquer tela.

function letraGrandeAgora(): boolean {
  return document.documentElement.dataset.letra === "grande";
}

function aplicarLetra(grande: boolean) {
  const html = document.documentElement;
  if (grande) html.dataset.letra = "grande";
  else delete html.dataset.letra;
}

/** Avisa o React quando o tema ou a letra mudam (por aqui, pelo botão do topo ou pelo aparelho). */
function observar(aoMudar: () => void) {
  const observador = new MutationObserver(aoMudar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-letra"] });
  const midia = window.matchMedia("(prefers-color-scheme: dark)");
  midia.addEventListener("change", aoMudar);
  return () => {
    observador.disconnect();
    midia.removeEventListener("change", aoMudar);
  };
}

function guardar(chave: string, valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, valor);
  } catch {
    // navegação privada: vale só nesta visita
  }
}

export function Preferencias() {
  // null = ainda no servidor (não sabemos o que o aparelho escolheu)
  const escuro = useSyncExternalStore<boolean | null>(observar, escuroAgora, () => null);
  const letraGrande = useSyncExternalStore<boolean | null>(observar, letraGrandeAgora, () => null);

  function alternarTema() {
    const novo = escuroAgora() ? "light" : "dark";
    document.documentElement.dataset.theme = novo;
    guardar("tema", novo);
  }

  function alternarLetra() {
    const nova = !letraGrandeAgora();
    aplicarLetra(nova);
    guardar("letra", nova ? "grande" : null);
  }

  return (
    <ul className="flex flex-col divide-y divide-line">
      <li>
        <Chave ligada={escuro} aoTrocar={alternarTema} titulo="Modo escuro" descricao="Tela escura, melhor à noite" />
      </li>
      <li>
        <Chave ligada={letraGrande} aoTrocar={alternarLetra} titulo="Letra grande" descricao="Aumenta textos e botões" />
      </li>
    </ul>
  );
}

/** Chave liga/desliga: trilho afundado com bolinha em relevo. */
function Chave({
  ligada,
  aoTrocar,
  titulo,
  descricao,
}: {
  ligada: boolean | null;
  aoTrocar: () => void;
  titulo: string;
  descricao: ReactNode;
}) {
  const on = ligada === true;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={aoTrocar}
      disabled={ligada === null}
      className="flex min-h-16 w-full items-center gap-4 rounded-xl py-2 text-left"
    >
      <span className="min-w-0 flex-1">
        <b className="block text-ink">{titulo}</b>
        <span className="text-[0.86rem] text-muted">{descricao}</span>
      </span>
      <span
        aria-hidden
        className={cx(
          "relative h-8 w-14 shrink-0 rounded-full transition-colors",
          on ? "bg-pine shadow-[inset_3px_3px_6px_rgb(0_0_0/0.28)]" : "afundado",
        )}
      >
        <span
          className={cx(
            "absolute left-1 top-1 size-6 rounded-full bg-surface-clara shadow-relevo transition-transform",
            on && "translate-x-6",
          )}
        />
      </span>
    </button>
  );
}
