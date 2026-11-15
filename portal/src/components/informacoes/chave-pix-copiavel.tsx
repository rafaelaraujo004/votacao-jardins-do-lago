"use client";

/**
 * Chave PIX com o botão "Copiar chave PIX".
 * Mostra a chave formatada (ex.: 29.711.278/0001-59), mas copia do jeito que o
 * banco aceita (CNPJ/CPF só com números). Se o navegador não deixar copiar,
 * a chave fica selecionada para a pessoa copiar na mão.
 */
import { useRef } from "react";
import { Copy, KeyRound } from "lucide-react";
import { useAvisos } from "@/components/ui/avisos";
import { classesDoBotao } from "@/components/ui/botao";

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

export function ChavePixCopiavel({
  rotulo,
  exibicao,
  paraCopiar,
}: {
  /** Ex.: "Chave PIX (CNPJ)". */
  rotulo: string;
  /** Chave formatada para ler. */
  exibicao: string;
  /** Chave exatamente como vai para a área de transferência. */
  paraCopiar: string;
}) {
  const { avisar } = useAvisos();
  const refChave = useRef<HTMLParagraphElement>(null);

  async function aoCopiar() {
    if (await copiar(paraCopiar)) {
      avisar("sucesso", "Chave PIX copiada");
      return;
    }
    // Plano B: seleciona a chave para a pessoa copiar.
    const el = refChave.current;
    if (el) {
      const intervalo = document.createRange();
      intervalo.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(intervalo);
    }
    avisar("info", "Selecione e copie a chave");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="afundado flex items-start gap-3 rounded-2xl px-4 py-3">
        <KeyRound aria-hidden className="mt-0.5 size-5 shrink-0 text-plum" />
        <div className="min-w-0">
          <span className="rotulo-caixa block">{rotulo}</span>
          <p
            ref={refChave}
            className="m-0 select-text break-all font-display text-[1.15rem] font-extrabold tabular-nums text-destaque"
          >
            {exibicao}
          </p>
        </div>
      </div>
      <button type="button" onClick={aoCopiar} className={classesDoBotao("primario", "normal", true)}>
        <Copy aria-hidden className="size-5" /> Copiar chave PIX
      </button>
    </div>
  );
}
