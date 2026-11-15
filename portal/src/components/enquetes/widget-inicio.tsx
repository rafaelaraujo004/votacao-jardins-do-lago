/**
 * Cartão do Início do morador: a enquete ABERTA mais recente.
 * - Casa ainda não votou: convida a votar.
 * - Casa já votou: mostra em qual opção e quando.
 * - Nenhuma aberta: o cartão leva para a lista de enquetes (resultados anteriores).
 * Componente de servidor. Uso: <WidgetEnquetes ctx={ctx} />
 */
import Link from "next/link";
import { ChevronRight, Vote } from "lucide-react";
import type { Contexto } from "@/server/contexto";
import { enqueteAbertaDoInicio, type EnqueteMorador } from "@/server/dados/enquetes";
import { diaMes } from "@/lib/enquetes";
import { formatarDataHora } from "@/lib/formato";

export async function WidgetEnquetes({ ctx }: { ctx: Contexto }) {
  // Perfil sem acesso às enquetes: o cartão simplesmente não aparece.
  if (!ctx.permissoes.has("enquetes.votar")) return null;

  let enquete: EnqueteMorador | null = null;
  try {
    enquete = await enqueteAbertaDoInicio(ctx);
  } catch (erro) {
    // Se as enquetes falharem, o Início continua abrindo.
    console.error("Início: não foi possível carregar as enquetes", erro);
    return null;
  }

  const href = enquete ? `/enquetes/${enquete.id}` : "/enquetes";
  let linha: string;
  let chamada: string;
  if (!enquete) {
    linha = "Nenhuma votação aberta agora. Veja os resultados anteriores.";
    chamada = "Ver enquetes";
  } else if (enquete.meuVoto) {
    const quando = enquete.meuVoto.votadoEm ? ` em ${diaMes(enquete.meuVoto.votadoEm, ctx.fuso)}` : "";
    linha = `Sua casa já votou em “${enquete.meuVoto.opcaoTexto}”${quando}.`;
    chamada = "Ver enquete";
  } else {
    linha = `Vote até ${formatarDataHora(enquete.fechaEm, ctx.fuso)}. Um voto por casa.`;
    chamada = "Votar agora";
  }

  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 rounded-[var(--radius-card)] bg-linear-135 from-vinho-de to-vinho-ate p-4 text-white shadow-card transition-shadow active:shadow-afundado"
    >
      <span className="grid size-[46px] shrink-0 place-items-center rounded-[14px] bg-[rgb(255_255_255/0.16)]">
        <Vote aria-hidden className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.72rem] font-bold uppercase tracking-wide text-vinho-fg-suave">
          {enquete ? "Enquete aberta" : "Enquetes"}
        </span>
        <b className="block break-words font-display text-[1.1rem] leading-snug">{enquete ? enquete.pergunta : "Votações do condomínio"}</b>
        <span className="text-[0.9rem] text-vinho-fg-suave">{linha}</span>
      </span>
      {/* Em telas estreitas fica só a setinha; o texto continua para leitores de tela. */}
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[rgb(255_255_255/0.18)] p-2 text-[0.85rem] font-bold min-[420px]:px-3">
        <span className="sr-only min-[420px]:not-sr-only">{chamada}</span>
        <ChevronRight aria-hidden className="size-4" />
      </span>
    </Link>
  );
}
