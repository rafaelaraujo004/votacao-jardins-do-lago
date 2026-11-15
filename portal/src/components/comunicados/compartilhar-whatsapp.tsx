"use client";

/**
 * "Compartilhar no WhatsApp": abre o WhatsApp com o texto pronto
 * (título + resumo + link do portal). A pessoa escolhe o grupo.
 * "Copiar texto" serve para colar em outro lugar.
 */
import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Botao, classesDoBotao } from "@/components/ui/botao";
import { useAvisos } from "@/components/ui/avisos";
import { linkCompartilharWhatsApp } from "@/lib/comunicados";

export function CompartilharWhatsApp({ mensagem }: { mensagem: string }) {
  const { avisar } = useAvisos();
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiado(true);
      avisar("sucesso", "Texto copiado. É só colar no WhatsApp.");
      window.setTimeout(() => setCopiado(false), 3000);
    } catch {
      avisar("erro", "Não foi possível copiar. Use o botão do WhatsApp.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <pre className="afundado max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-2xl p-4 font-sans text-[0.95rem] text-ink-2">
        {mensagem}
      </pre>
      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href={linkCompartilharWhatsApp(mensagem)}
          target="_blank"
          rel="noopener noreferrer"
          className={classesDoBotao("primario")}
        >
          <MessageCircle aria-hidden className="size-5" />
          Compartilhar no WhatsApp
        </a>
        <Botao
          variante="secundario"
          onClick={copiar}
          icone={copiado ? <Check aria-hidden className="size-5" /> : <Copy aria-hidden className="size-5" />}
        >
          {copiado ? "Copiado" : "Copiar texto"}
        </Botao>
      </div>
    </div>
  );
}
