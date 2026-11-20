/**
 * Assinatura de quem desenvolveu o portal, no rodapé das telas principais
 * (entrada, área do morador, painel da administração e portaria).
 */
import { cx } from "@/lib/cx";

export const DESENVOLVEDOR = "Rafael Araújo";

export function Assinatura({ className, sobreFaixa = false }: { className?: string; /** Sobre a faixa verde escura. */ sobreFaixa?: boolean }) {
  return (
    <p className={cx("text-center text-[0.8rem]", sobreFaixa ? "text-band-muted" : "text-muted", className)}>
      Desenvolvido por <span className={cx("font-bold", sobreFaixa ? "text-band-fg" : "text-ink-2")}>{DESENVOLVEDOR}</span>
    </p>
  );
}
