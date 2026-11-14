"use client";

/**
 * Endereço do condomínio com os botões "Copiar CEP" e "Copiar endereço".
 * Se o navegador não deixar copiar, o texto fica selecionado para a pessoa copiar na mão.
 */
import { useRef } from "react";
import { Copy, MapPin } from "lucide-react";
import { useAvisos } from "@/components/ui/avisos";
import { ENDERECO, ENDERECO_CIDADE, ENDERECO_COMPLETO, ENDERECO_LINHA } from "@/lib/condominio";
import { cx } from "@/lib/cx";

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Navegadores antigos ou páginas sem permissão: tenta o jeito clássico.
    try {
      const area = document.createElement("textarea");
      area.value = texto;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function selecionar(el: HTMLElement | null) {
  if (!el) return;
  const intervalo = document.createRange();
  intervalo.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(intervalo);
}

export function EnderecoCopiavel({ className }: { className?: string }) {
  const { avisar } = useAvisos();
  const refTexto = useRef<HTMLParagraphElement>(null);
  const refCep = useRef<HTMLSpanElement>(null);

  async function aoCopiar(texto: string, quem: "CEP" | "Endereço", alvo: HTMLElement | null) {
    if (await copiar(texto)) {
      avisar("sucesso", `${quem} copiado`);
    } else {
      selecionar(alvo);
      avisar("info", "Selecione e copie o texto");
    }
  }

  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div className="afundado flex gap-3 rounded-2xl px-4 py-3">
        <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-plum" />
        <div className="min-w-0">
          <span className="rotulo-caixa block">Endereço</span>
          <p ref={refTexto} className="m-0 select-text text-[0.95rem] leading-snug text-ink">
            {ENDERECO_LINHA}
            <br />
            {ENDERECO_CIDADE}
            <span className="mt-1 block font-bold text-destaque">
              CEP <span ref={refCep}>{ENDERECO.cep}</span>
            </span>
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => aoCopiar(ENDERECO.cep, "CEP", refCep.current)}
          className="botao-verde inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full px-2 text-[0.92rem] font-bold active:shadow-afundado"
        >
          <Copy aria-hidden className="size-[18px] shrink-0" /> Copiar CEP
        </button>
        <button
          type="button"
          onClick={() => aoCopiar(ENDERECO_COMPLETO, "Endereço", refTexto.current)}
          className="saltado inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full px-2 text-[0.92rem] font-bold text-ink active:shadow-afundado"
        >
          <Copy aria-hidden className="size-[18px] shrink-0" /> Copiar endereço
        </button>
      </div>
    </div>
  );
}
