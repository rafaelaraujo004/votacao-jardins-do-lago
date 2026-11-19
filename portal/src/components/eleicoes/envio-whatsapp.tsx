"use client";

/**
 * Botões da comissão para enviar o LINK DE VOTO de uma casa pelo WhatsApp.
 * O WhatsApp só abre uma conversa por vez: o botão abre o 1º contato e, no próximo toque,
 * o 2º (e o 3º). Cada abertura fica anotada (para saber quem já recebeu).
 * Também dá para copiar o link e trocá-lo (se vazou).
 */
import { useState, useTransition } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { marcarEnvioWhatsApp } from "@/server/acoes/votacao-links";
import { formatarTelefone } from "@/lib/contatos-votacao";
import { useAvisos } from "@/components/ui/avisos";
import { cx } from "@/lib/cx";

export function EnvioWhatsApp({
  eleicaoId,
  unitId,
  telefones,
  link,
  mensagem,
  enviado,
}: {
  eleicaoId: string;
  unitId: string;
  telefones: string[];
  link: string;
  mensagem: string;
  enviado: boolean;
}) {
  const [proximo, setProximo] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const [, iniciar] = useTransition();
  const { avisar } = useAvisos();
  const todos = proximo >= telefones.length;
  const indice = todos ? 0 : proximo;

  function abrir() {
    const tel = telefones[indice];
    window.open(
      `https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}`,
      "_blank",
      "noopener,noreferrer",
    );
    setProximo(todos ? 1 : proximo + 1);
    iniciar(async () => {
      const r = await marcarEnvioWhatsApp(eleicaoId, unitId);
      if (r && !r.ok) avisar("erro", r.erro);
    });
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      avisar("erro", "Não deu para copiar. Segure o dedo no link para copiar.");
    }
  }

  const rotulo = !telefones.length
    ? "Sem telefone"
    : todos && proximo > 0
      ? "Enviar de novo"
      : telefones.length === 1
        ? "Enviar no WhatsApp"
        : `WhatsApp · ${indice + 1}º contato`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={abrir}
        disabled={!telefones.length}
        className={cx(
          "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[0.92rem] font-bold shadow-relevo transition-shadow active:shadow-afundado disabled:cursor-not-allowed disabled:opacity-50",
          "bg-[#1f8f4e] text-white",
        )}
        title={
          telefones[indice] ? formatarTelefone(telefones[indice]) : undefined
        }
      >
        <MessageCircle aria-hidden className="size-4" />
        {rotulo}
        {telefones.length > 1 && !(todos && proximo > 0) ? (
          <span className="rounded-full bg-white/20 px-1.5 text-[0.75rem]">
            {Math.min(proximo, telefones.length)}/{telefones.length}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={copiar}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[0.88rem] font-bold text-lake hover:shadow-afundado"
      >
        {copiado ? (
          <Check aria-hidden className="size-4" />
        ) : (
          <Copy aria-hidden className="size-4" />
        )}
        {copiado ? "Copiado" : "Copiar link"}
      </button>
      {enviado || proximo > 0 ? (
        <span className="inline-flex items-center gap-1 text-[0.8rem] font-bold text-pine">
          <Check aria-hidden className="size-3.5" /> enviado
        </span>
      ) : null}
    </div>
  );
}
