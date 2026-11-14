/**
 * Faixa verde do topo: logo no selo claro, nome do condomínio, endereço curto,
 * quem está usando e os botões redondos de tema e sair.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { KeyRound, LogOut } from "lucide-react";
import { Logo, Petalas } from "@/components/ui/marca";
import { BotaoTema } from "@/components/ui/tema";
import { sair } from "@/server/acoes-sessao";
import { ENDERECO_LINHA } from "@/lib/condominio";
import { cx } from "@/lib/cx";

/** Classes dos botões redondos sobre a faixa verde (a faixa é escura nos dois temas). */
export const classeBotaoFaixa = "border border-white/15 bg-white/10 text-band-fg hover:bg-white/20";

/**
 * Botão de sair. Com `redondo`, mostra só o ícone (o texto fica para leitores de tela).
 */
export function BotaoSair({ className, redondo = false }: { className?: string; redondo?: boolean }) {
  return (
    <form action={sair}>
      <button
        type="submit"
        title={redondo ? "Sair do portal" : undefined}
        className={cx(
          "flex min-h-11 items-center gap-2 rounded-full font-bold transition-colors",
          redondo ? "size-11 justify-center" : "px-3",
          className,
        )}
      >
        <LogOut aria-hidden className="size-5" />
        <span className={redondo ? "sr-only" : undefined}>Sair</span>
      </button>
    </form>
  );
}

export function FaixaTopo({
  titulo,
  subtitulo,
  demo,
  largura = "max-w-5xl",
  contaHref,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  demo?: boolean;
  largura?: string;
  /** Endereço da tela "Trocar senha" (só para a equipe). Sem ele, o botão não aparece. */
  contaHref?: string;
  children?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden bg-band pt-[env(safe-area-inset-top)] text-band-fg">
      <Petalas tamanho={180} className="absolute -right-10 -top-12 opacity-20" />
      {demo ? (
        <p className="relative mx-auto mt-2 w-fit rounded-full bg-sand px-3 py-0.5 text-[0.75rem] font-bold text-ink">
          Demonstração · dados fictícios
        </p>
      ) : null}
      <div className={cx("relative mx-auto flex items-center gap-3 px-4 pb-16", demo ? "pt-2" : "pt-4", largura)}>
        <Logo largura={70} className="shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate font-display text-[1.06rem] font-bold tracking-tight">{titulo}</span>
          <span className="mt-0.5 truncate text-[0.8rem] text-band-muted">{ENDERECO_LINHA}</span>
          {subtitulo ? <span className="mt-0.5 truncate text-[0.84rem] font-bold text-band-fg/90">{subtitulo}</span> : null}
        </div>
        {contaHref ? (
          <Link href={contaHref} title="Trocar senha" className={cx("grid size-11 place-items-center rounded-full", classeBotaoFaixa)}>
            <KeyRound aria-hidden className="size-5" />
            <span className="sr-only">Trocar senha</span>
          </Link>
        ) : null}
        <BotaoTema className={classeBotaoFaixa} />
        <BotaoSair redondo className={classeBotaoFaixa} />
      </div>
      {children}
    </header>
  );
}
