/**
 * Faixa verde do topo: logo no selo claro, nome do condomínio, endereço curto,
 * quem está usando e os botões redondos de tema e sair.
 * Na área PÚBLICA dos moradores (informações gerais abertas pelo link):
 * - sem login: botão "Entrar" (→ /entrar);
 * - com login: "Casa 12" e o botão "Sair".
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { House, KeyRound, LockKeyhole, LogIn, LogOut, CloudOff } from "lucide-react";
import { Logo, Petalas } from "@/components/ui/marca";
import { FaixaPetalas } from "@/components/ui/painel";
import { Cartao, EstadoVazio } from "@/components/ui/basicos";
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
  publico = false,
  sessao = null,
  entrarHref = "/entrar",
  children,
}: {
  titulo: string;
  subtitulo?: string;
  demo?: boolean;
  largura?: string;
  /** Endereço da tela "Trocar senha" (só para a equipe). Sem ele, o botão não aparece. */
  contaHref?: string;
  /** true = área pública dos moradores: "Entrar" quando ninguém está logado. */
  publico?: boolean;
  /** Na área pública: quem está logado ("Casa 12"), ou null se ninguém. */
  sessao?: { rotulo: string } | null;
  /** Na área pública: link do botão "Entrar" (com o ?c= do condomínio). */
  entrarHref?: string;
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
        {publico && !sessao ? <LinkEntrar href={entrarHref} /> : null}
        {publico && sessao ? <ChipCasa rotulo={sessao.rotulo} /> : null}
        {!publico || sessao ? <BotaoSair redondo className={classeBotaoFaixa} /> : null}
      </div>
      {children}
    </header>
  );
}

/** Botão "Entrar" da área pública (morador ou equipe escolhem na tela de entrada). */
function LinkEntrar({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className={cx("flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3.5 text-[0.9rem] font-bold", classeBotaoFaixa)}
    >
      <LogIn aria-hidden className="size-[18px] shrink-0" />
      {/* Em telas bem estreitas o texto fica só para leitores de tela (o ícone continua). */}
      <span className="max-[360px]:sr-only">Entrar</span>
    </Link>
  );
}

/** "Casa 12": mostra de quem é a sessão aberta neste aparelho. Toque → "Minha conta" (trocar senha). */
function ChipCasa({ rotulo }: { rotulo: string }) {
  return (
    <Link
      href="/conta/senha"
      title="Minha conta (trocar senha)"
      className={cx("flex min-h-11 min-w-0 max-w-[9.5rem] items-center gap-1.5 rounded-full px-3 text-[0.9rem] font-bold", classeBotaoFaixa)}
    >
      <House aria-hidden className="size-4 shrink-0 max-[380px]:hidden" />
      <span className="truncate">
        <span className="sr-only">Você entrou como </span>
        {rotulo}
        <span className="sr-only">. Abrir minha conta</span>
      </span>
    </Link>
  );
}

/** Tela simples para quando o condomínio do link não está disponível ao público. */
export function PortalIndisponivel() {
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-4 py-10">
      <Logo largura={120} />
      <Cartao semEspaco className="w-full overflow-hidden">
        <FaixaPetalas />
        <div className="p-4">
          <EstadoVazio icone={CloudOff} titulo="Portal indisponível">
            O portal deste condomínio não está aberto ao público agora. Confira o link com a administração ou tente de novo mais tarde.
          </EstadoVazio>
        </div>
      </Cartao>
      <Link href="/entrar" className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 font-bold text-pine">
        <LockKeyhole aria-hidden className="size-4" /> Entrar no portal
      </Link>
    </main>
  );
}
