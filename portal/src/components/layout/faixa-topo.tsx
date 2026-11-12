/**
 * Faixa verde do topo: logo, quem está usando e os botões de tema e sair.
 */
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Logo, Petalas } from "@/components/ui/marca";
import { BotaoTema } from "@/components/ui/tema";
import { sair } from "@/server/acoes-sessao";
import { cx } from "@/lib/cx";

export function BotaoSair({ className }: { className?: string }) {
  return (
    <form action={sair}>
      <button
        type="submit"
        className={cx("flex min-h-11 items-center gap-2 rounded-full px-3 font-bold", className)}
      >
        <LogOut aria-hidden className="size-5" />
        <span>Sair</span>
      </button>
    </form>
  );
}

export function FaixaTopo({
  titulo,
  subtitulo,
  demo,
  largura = "max-w-5xl",
  children,
}: {
  titulo: string;
  subtitulo?: string;
  demo?: boolean;
  largura?: string;
  children?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden bg-band pt-[env(safe-area-inset-top)] text-band-fg">
      <Petalas tamanho={180} className="absolute -right-10 -top-12 opacity-25" />
      {demo ? (
        <p className="relative mx-auto mt-2 w-fit rounded-full bg-sand px-3 py-0.5 text-[0.75rem] font-bold text-ink">
          Demonstração · dados fictícios
        </p>
      ) : null}
      <div className={cx("relative mx-auto flex items-center gap-3 px-4 pb-16", demo ? "pt-2" : "pt-4", largura)}>
        <Logo largura={84} />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate font-display text-[1.1rem] font-bold">{titulo}</span>
          {subtitulo ? <span className="truncate text-[0.88rem] text-band-muted">{subtitulo}</span> : null}
        </div>
        <BotaoTema className="text-band-fg hover:bg-white/10" />
        <BotaoSair className="text-band-fg hover:bg-white/10 max-sm:[&>span]:sr-only" />
      </div>
      {children}
    </header>
  );
}
