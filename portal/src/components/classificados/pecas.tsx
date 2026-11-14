/**
 * Peças dos classificados: etiquetas (ícone + texto, nunca só cor), o botão
 * do WhatsApp e o "corpo" do anúncio (título, preço, texto) usado nas listas.
 */
import type { ReactNode } from "react";
import {
  Ban,
  CircleCheck,
  CircleX,
  Clock,
  Gift,
  Hourglass,
  MessageCircle,
  Search,
  ShoppingBag,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Etiqueta } from "@/components/ui/basicos";
import { formatarMoeda } from "@/lib/formato";
import {
  ROTULO_CATEGORIA,
  ROTULO_STATUS_CLASSIFICADO,
  formatarWhatsapp,
  linkWhatsapp,
  type CategoriaClassificado,
  type StatusClassificado,
} from "@/lib/classificados";
import { cx } from "@/lib/cx";

type Tom = "ok" | "info" | "aviso" | "erro" | "neutro" | "destaque";

export const ICONE_CATEGORIA: Record<CategoriaClassificado, LucideIcon> = {
  venda: ShoppingBag,
  servico: Wrench,
  doacao: Gift,
  procura: Search,
  outro: Sparkles,
};

const TOM_CATEGORIA: Record<CategoriaClassificado, Tom> = {
  venda: "info",
  servico: "destaque",
  doacao: "ok",
  procura: "aviso",
  outro: "neutro",
};

export function EtiquetaCategoria({ categoria }: { categoria: CategoriaClassificado }) {
  return (
    <Etiqueta tom={TOM_CATEGORIA[categoria]} icone={ICONE_CATEGORIA[categoria]}>
      {ROTULO_CATEGORIA[categoria]}
    </Etiqueta>
  );
}

const ESTILO_STATUS: Record<StatusClassificado, { tom: Tom; icone: LucideIcon }> = {
  pendente: { tom: "aviso", icone: Clock },
  aprovado: { tom: "ok", icone: CircleCheck },
  rejeitado: { tom: "erro", icone: CircleX },
  removido: { tom: "neutro", icone: Ban },
  expirado: { tom: "neutro", icone: Hourglass },
};

export function EtiquetaSituacao({ situacao }: { situacao: StatusClassificado }) {
  const { tom, icone } = ESTILO_STATUS[situacao];
  return (
    <Etiqueta tom={tom} icone={icone}>
      {ROTULO_STATUS_CLASSIFICADO[situacao]}
    </Etiqueta>
  );
}

/** Preço do anúncio: valor, "Grátis" (doação) ou nada. */
export function textoPreco(categoria: CategoriaClassificado, preco: number | null): string | null {
  if (categoria === "doacao") return "Grátis";
  return preco !== null ? formatarMoeda(preco) : null;
}

/** Link que abre a conversa no WhatsApp (só aparece se o autor quis mostrar o número). */
export function BotaoWhatsapp({ numero, titulo }: { numero: string; titulo: string }) {
  return (
    <a
      href={linkWhatsapp(numero, titulo)}
      target="_blank"
      rel="noopener noreferrer"
      className="botao-verde inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-transparent px-4 text-[0.92rem] font-bold hover:brightness-110"
    >
      <MessageCircle aria-hidden className="size-5" />
      WhatsApp {formatarWhatsapp(numero)}
      <span className="sr-only">(abre o WhatsApp)</span>
    </a>
  );
}

/** Título, etiquetas, preço e texto do anúncio. `extra` vai no fim (ex.: botões). */
export function CorpoAnuncio({
  titulo,
  texto,
  categoria,
  preco,
  etiquetas,
  rodape,
  className,
}: {
  titulo: string;
  texto: string;
  categoria: CategoriaClassificado;
  preco: number | null;
  /** Etiquetas além da categoria (ex.: situação, "Seu anúncio"). */
  etiquetas?: ReactNode;
  rodape?: ReactNode;
  className?: string;
}) {
  const valor = textoPreco(categoria, preco);
  return (
    <article className={cx("flex flex-col gap-2.5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <EtiquetaCategoria categoria={categoria} />
        {etiquetas}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="min-w-0 break-words text-[1.1rem] font-bold text-ink">{titulo}</h3>
        {valor ? <span className="font-display text-[1.15rem] font-extrabold text-destaque tabular-nums">{valor}</span> : null}
      </div>
      <p className="whitespace-pre-line break-words text-ink-2">{texto}</p>
      {rodape}
    </article>
  );
}
