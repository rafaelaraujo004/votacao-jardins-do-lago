"use client";

/**
 * Botão da portaria para AVISAR A CASA pelo WhatsApp:
 * - "encomenda": chegou uma encomenda para a casa;
 * - "visita": o visitante já passou pela portaria e está a caminho (texto que a portaria já usa).
 * Abre a conversa com o telefone da casa e a mensagem já escrita (é só tocar em enviar).
 * O WhatsApp abre uma conversa por vez: com mais de um telefone, o próximo toque abre o
 * 2º contato (e assim por diante). Cada abertura fica anotada ("avisado 21/11 14:32").
 */
import { useState, useTransition } from "react";
import { Check, MessageCircle } from "lucide-react";
import { marcarAvisoEncomenda, marcarAvisoVisita } from "@/server/acoes/portaria";
import { formatarTelefone } from "@/lib/contatos-votacao";
import { linkWhatsAppPara, mensagemEncomenda, mensagemVisitaACaminho } from "@/lib/portaria";
import { useAvisos } from "@/components/ui/avisos";
import { cx } from "@/lib/cx";

export type AvisoCasa =
  | { tipo: "encomenda"; id: string; destinatario: string; unidadeRotulo: string; tipoEncomenda: string; observacao: string }
  | { tipo: "visita"; id: string };

function mensagemDo(aviso: AvisoCasa, nomeContato: string, condominio: string): string {
  if (aviso.tipo === "visita") return mensagemVisitaACaminho();
  return mensagemEncomenda({
    nomeContato,
    destinatario: aviso.destinatario,
    unidadeRotulo: aviso.unidadeRotulo,
    tipo: aviso.tipoEncomenda,
    observacao: aviso.observacao,
    condominio,
  });
}

export function AvisarWhatsApp({
  aviso,
  contatos,
  condominio,
  avisado,
  rotulo: rotuloBase = "Avisar no WhatsApp",
  grande = false,
}: {
  aviso: AvisoCasa;
  contatos: { nome: string; telefone: string }[];
  condominio: string;
  /** Texto "avisado 21/11 14:32 por Carlos" (null = ainda não avisou). */
  avisado: string | null;
  /** Texto do botão com um telefone só (ex.: "Avisar: está a caminho"). */
  rotulo?: string;
  /** Botão maior (logo depois de registrar). */
  grande?: boolean;
}) {
  const [proximo, setProximo] = useState(0);
  const [, iniciar] = useTransition();
  const { avisar } = useAvisos();
  const todos = proximo >= contatos.length;
  const indice = todos ? 0 : proximo;
  const contato = contatos[indice];

  function abrir() {
    if (!contato) return;
    window.open(linkWhatsAppPara(contato.telefone, mensagemDo(aviso, contato.nome, condominio)), "_blank", "noopener,noreferrer");
    setProximo(todos ? 1 : proximo + 1);
    iniciar(async () => {
      const r = aviso.tipo === "visita" ? await marcarAvisoVisita(aviso.id) : await marcarAvisoEncomenda(aviso.id);
      if (r && !r.ok) avisar("erro", r.erro);
    });
  }

  const rotulo = !contatos.length
    ? "Sem telefone da casa"
    : todos && proximo > 0
      ? "Avisar de novo"
      : contatos.length === 1
        ? rotuloBase
        : `${rotuloBase} · ${indice + 1}º contato`;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={abrir}
        disabled={!contatos.length}
        title={contato ? `${contato.nome ? `${contato.nome} · ` : ""}${formatarTelefone(contato.telefone)}` : "Cadastre o telefone do morador em Moradores e equipe."}
        className={cx(
          "inline-flex items-center justify-center gap-2 rounded-full bg-[#1f8f4e] px-4 font-bold text-white shadow-relevo transition-shadow active:shadow-afundado disabled:cursor-not-allowed disabled:opacity-50",
          grande ? "min-h-12 text-[1rem]" : "min-h-11 text-[0.92rem]",
        )}
      >
        <MessageCircle aria-hidden className="size-5 shrink-0" />
        <span>{rotulo}</span>
        {contatos.length > 1 && !(todos && proximo > 0) ? (
          <span className="rounded-full bg-white/20 px-1.5 text-[0.75rem]">
            {Math.min(proximo, contatos.length)}/{contatos.length}
          </span>
        ) : null}
      </button>
      {contato && !(todos && proximo > 0) ? (
        <span className="text-[0.8rem] text-muted">
          Para {contato.nome ? `${contato.nome.split(/[\s/]+/)[0]} · ` : ""}
          {formatarTelefone(contato.telefone)}
        </span>
      ) : null}
      {proximo > 0 || avisado ? (
        <span className="inline-flex items-center gap-1 text-[0.8rem] font-bold text-pine">
          <Check aria-hidden className="size-3.5" /> {proximo > 0 ? "aviso aberto no WhatsApp" : avisado}
        </span>
      ) : null}
      {!contatos.length ? (
        <span className="text-[0.8rem] text-muted">Sem telefone no cadastro desta casa. Ligue ou cadastre o telefone.</span>
      ) : null}
    </div>
  );
}
