"use client";

/**
 * Logo depois de registrar uma ENTRADA (com ou sem código): cartão "Entrada registrada" com o
 * botão para avisar a casa pelo WhatsApp que a visita está a caminho (texto que a portaria já usa).
 * A entrada é procurada entre "quem está dentro" pelo nome do visitante e pela casa.
 */
import { DoorOpen, X } from "lucide-react";
import type { ContatoDaCasa } from "@/server/dados/portaria";
import { AvisarWhatsApp } from "./avisar-whatsapp";

/** Entrada de quem está dentro (só o que o cartão precisa). */
export type EntradaDentro = { id: string; nome: string; unitId: string; unidadeRotulo: string; quando: Date | null; avisadoEm: Date | null };

/** O que acabou de ser registrado: nome do visitante e a casa (pelo id ou pelo nome da casa). */
export type EntradaProcurada = { nome: string; unitId?: string; unidadeRotulo?: string };

const limpar = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

export function acharEntrada(dentro: readonly EntradaDentro[], p: EntradaProcurada | null): EntradaDentro | undefined {
  if (!p) return undefined;
  return dentro
    .filter(
      (e) =>
        limpar(e.nome) === limpar(p.nome) &&
        (p.unitId ? e.unitId === p.unitId : p.unidadeRotulo ? e.unidadeRotulo === p.unidadeRotulo : false),
    )
    .sort((a, b) => (b.quando?.getTime() ?? 0) - (a.quando?.getTime() ?? 0))[0];
}

export function AvisoDepoisDaEntrada({
  entrada,
  contatos,
  condominio,
  aoFechar,
}: {
  entrada: EntradaDentro;
  contatos: Record<string, ContatoDaCasa[]>;
  condominio: string;
  aoFechar: () => void;
}) {
  return (
    <div role="status" className="surgir flex flex-col gap-2.5 rounded-2xl border-2 border-pine bg-ok-soft p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 font-bold text-pine">
          <DoorOpen aria-hidden className="size-5 shrink-0" /> Entrada registrada: {entrada.nome} ({entrada.unidadeRotulo})
        </p>
        <button type="button" onClick={aoFechar} aria-label="Fechar" className="grid size-9 shrink-0 place-items-center rounded-full text-ink-2 hover:shadow-afundado">
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <p className="text-[0.92rem] text-ink-2">Avise a casa que a visita está a caminho:</p>
      <AvisarWhatsApp
        grande
        aviso={{ tipo: "visita", id: entrada.id }}
        contatos={contatos[entrada.unitId] ?? []}
        condominio={condominio}
        avisado={null}
        rotulo="Avisar: a visita está a caminho"
      />
    </div>
  );
}
