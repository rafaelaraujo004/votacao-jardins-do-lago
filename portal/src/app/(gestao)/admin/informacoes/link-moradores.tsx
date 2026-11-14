"use client";

/**
 * Link público dos moradores com os botões "Copiar link" e "Enviar pelo WhatsApp".
 * Se o navegador não deixar copiar, o link fica selecionado para copiar na mão.
 */
import { useRef } from "react";
import { Copy, ExternalLink, Link2, MessageCircle } from "lucide-react";
import { useAvisos } from "@/components/ui/avisos";
import { classesDoBotao } from "@/components/ui/botao";

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

export function LinkMoradores({ link, linkWhatsApp }: { link: string; linkWhatsApp: string }) {
  const { avisar } = useAvisos();
  const refLink = useRef<HTMLParagraphElement>(null);

  async function aoCopiar() {
    if (await copiar(link)) {
      avisar("sucesso", "Link copiado");
      return;
    }
    // Plano B: seleciona o texto para a pessoa copiar.
    const el = refLink.current;
    if (el) {
      const intervalo = document.createRange();
      intervalo.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(intervalo);
    }
    avisar("info", "Selecione e copie o link");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="afundado flex items-start gap-3 rounded-2xl px-4 py-3">
        <Link2 aria-hidden className="mt-0.5 size-5 shrink-0 text-plum" />
        <div className="min-w-0">
          <span className="rotulo-caixa block">Link dos moradores</span>
          <p ref={refLink} className="m-0 select-text break-all font-bold text-ink">
            {link}
          </p>
        </div>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-3">
        <button type="button" onClick={aoCopiar} className={classesDoBotao("primario")}>
          <Copy aria-hidden className="size-5" /> Copiar link
        </button>
        <a href={linkWhatsApp} target="_blank" rel="noopener noreferrer" className={classesDoBotao("secundario")}>
          <MessageCircle aria-hidden className="size-5" /> Enviar pelo WhatsApp
        </a>
        <a href={link} target="_blank" rel="noopener noreferrer" className={classesDoBotao("secundario")}>
          <ExternalLink aria-hidden className="size-5" /> Abrir o portal
        </a>
      </div>
    </div>
  );
}
