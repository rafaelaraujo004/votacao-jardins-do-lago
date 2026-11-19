/**
 * Cartão do Início do morador: a votação oficial em destaque.
 * - Aberta e a casa não votou: convida a votar.
 * - Aberta e a casa já votou: confirma (nunca diz em quem).
 * - Agendada: quando abre. Encerrada há poucos dias: ver o resultado.
 * Sem votação publicada: o cartão não aparece.
 * Componente de servidor. Uso: <WidgetEleicao ctx={ctx} />
 */
import Link from "next/link";
import { ChevronRight, Vote } from "lucide-react";
import type { Contexto } from "@/server/contexto";
import { eleicaoDoInicio, type EleicaoMorador } from "@/server/dados/eleicoes";
import { formatarDataHora } from "@/lib/formato";

export async function WidgetEleicao({ ctx }: { ctx: Contexto }) {
  if (!ctx.permissoes.has("eleicoes.votar")) return null;

  let e: EleicaoMorador | null = null;
  try {
    e = await eleicaoDoInicio(ctx);
  } catch (erro) {
    // Se a votação falhar, o Início continua abrindo.
    console.error("Início: não foi possível carregar a votação oficial", erro);
    return null;
  }
  if (!e) return null;

  let sobretitulo: string;
  let linha: string;
  let chamada: string;
  if (e.situacao !== "encerrada" && e.casaBloqueada && !e.casaVotou) {
    sobretitulo = "Votação oficial";
    linha = "Sua casa não está liberada para votar. Fale com a comissão.";
    chamada = "Ver votação";
  } else if (e.situacao === "aberta" && !e.casaVotou) {
    sobretitulo = "Votação oficial aberta";
    linha = `Vote até ${formatarDataHora(e.fechaEm, ctx.fuso)}. Um voto por casa, secreto.`;
    chamada = "Votar agora";
  } else if (e.situacao === "aberta") {
    sobretitulo = "Votação oficial aberta";
    linha = "Sua casa já votou. O resultado sai no encerramento.";
    chamada = "Ver votação";
  } else if (e.situacao === "agendada") {
    sobretitulo = "Votação oficial";
    linha = `Abre ${formatarDataHora(e.abreEm, ctx.fuso)}. Conheça os candidatos.`;
    chamada = "Ver candidatos";
  } else {
    sobretitulo = "Votação oficial encerrada";
    linha = e.resultado
      ? "O resultado já está disponível."
      : "Apurando os votos. O resultado sai em instantes.";
    chamada = "Ver resultado";
  }

  return (
    <Link
      href={`/votacao/${e.id}`}
      className="flex items-center gap-3.5 rounded-[var(--radius-card)] bg-linear-135 from-vinho-de to-vinho-ate p-4 text-white shadow-card transition-shadow active:shadow-afundado"
    >
      <span className="grid size-[46px] shrink-0 place-items-center rounded-[14px] bg-[rgb(255_255_255/0.16)]">
        <Vote aria-hidden className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.72rem] font-bold uppercase tracking-wide text-vinho-fg-suave">
          {sobretitulo}
        </span>
        <b className="block break-words font-display text-[1.1rem] leading-snug">
          {e.titulo}
        </b>
        <span className="text-[0.9rem] text-vinho-fg-suave">{linha}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[rgb(255_255_255/0.18)] p-2 text-[0.85rem] font-bold min-[420px]:px-3">
        <span className="sr-only min-[420px]:not-sr-only">{chamada}</span>
        <ChevronRight aria-hidden className="size-4" />
      </span>
    </Link>
  );
}
