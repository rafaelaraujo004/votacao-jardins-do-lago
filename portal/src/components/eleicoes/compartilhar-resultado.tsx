"use client";

/**
 * Comissão: mandar o RESULTADO da votação no grupo do condomínio pelo WhatsApp.
 * O texto vem pronto do servidor (só totais: Sim, Não, Sem votar e participação — nunca
 * quais casas votaram). O link do WhatsApp vai SEM número: a pessoa escolhe o grupo.
 * "Copiar texto" serve para colar em outro lugar (ou se o WhatsApp não abrir).
 */
import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Botao, classesDoBotao } from "@/components/ui/botao";
import { useAvisos } from "@/components/ui/avisos";
import { linkCompartilharWhatsApp } from "@/lib/comunicados";

export function CompartilharResultado({ texto }: { texto: string }) {
  const { avisar } = useAvisos();
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      avisar("sucesso", "Texto copiado. É só colar no grupo.");
      window.setTimeout(() => setCopiado(false), 3000);
    } catch {
      avisar(
        "erro",
        "Não foi possível copiar. Use o botão do WhatsApp ou segure o dedo no texto para copiar.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <a
          href={linkCompartilharWhatsApp(texto)}
          target="_blank"
          rel="noopener noreferrer"
          className={classesDoBotao("primario")}
        >
          <MessageCircle aria-hidden className="size-5 shrink-0" />
          Mandar o resultado no grupo (WhatsApp)
        </a>
        <Botao
          variante="secundario"
          onClick={copiar}
          icone={
            copiado ? (
              <Check aria-hidden className="size-5" />
            ) : (
              <Copy aria-hidden className="size-5" />
            )
          }
        >
          {copiado ? "Copiado" : "Copiar texto"}
        </Botao>
      </div>
      <details className="text-[0.92rem] text-ink-2">
        <summary className="min-h-11 w-fit cursor-pointer py-2.5 font-bold text-lake">
          Ver o texto que vai no grupo
        </summary>
        <pre className="afundado mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-2xl p-4 font-sans text-[0.92rem] text-ink-2">
          {texto}
        </pre>
      </details>
    </div>
  );
}
