"use client";

/**
 * Botão de LETRA GRANDE para as páginas sem login (link de voto, assinatura da ata).
 * Faz o mesmo que a chave "Letra grande" de Mais → Preferências: liga/desliga
 * data-letra="grande" no <html> e guarda a escolha neste aparelho (localStorage "letra").
 * O app/layout.tsx reaplica a escolha antes de pintar a tela.
 * O texto do botão diz o que ele FAZ ("A+ Letra grande" / "A Letra normal"), igual ao BotaoTema.
 */
import { useSyncExternalStore } from "react";
import { cx } from "@/lib/cx";

function letraGrandeAgora(): boolean {
  return document.documentElement.dataset.letra === "grande";
}

/** Avisa o React quando a letra muda (por aqui ou pelas Preferências). */
function observar(aoMudar: () => void) {
  const observador = new MutationObserver(aoMudar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ["data-letra"] });
  return () => observador.disconnect();
}

export function BotaoLetra({ className }: { className?: string }) {
  // null = ainda no servidor (não sabemos o que o aparelho escolheu): mostra "Letra grande".
  const grande = useSyncExternalStore<boolean | null>(observar, letraGrandeAgora, () => null);

  function alternar() {
    const nova = !letraGrandeAgora();
    const html = document.documentElement;
    if (nova) html.dataset.letra = "grande";
    else delete html.dataset.letra;
    try {
      if (nova) localStorage.setItem("letra", "grande");
      else localStorage.removeItem("letra");
    } catch {
      // navegação privada: vale só nesta visita
    }
  }

  const ligada = grande === true;
  return (
    <button
      type="button"
      onClick={alternar}
      className={cx(
        "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 font-bold transition-colors",
        className,
      )}
      title={ligada ? "Voltar a letra ao tamanho normal" : "Aumentar a letra"}
    >
      <span aria-hidden className="font-display text-[1.05rem] leading-none">
        {ligada ? "A" : "A+"}
      </span>
      <span className="text-[0.88rem]">{ligada ? "Letra normal" : "Letra grande"}</span>
    </button>
  );
}
