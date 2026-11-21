"use client";

/**
 * Tela do LINK DE ASSINATURA DA ATA quando a página não abriu (internet fraca, site sendo atualizado,
 * servidor demorou). Quem chega pelo link NÃO tem login: nunca mandar para a tela de entrada.
 * O botão recarrega o MESMO link (o link de assinatura vale uma vez). Se a casa já votou,
 * a assinatura já feita continua valendo.
 */
import { useEffect } from "react";
import { RotateCw, WifiOff } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Logo } from "@/components/ui/marca";
import { FaixaPetalas } from "@/components/ui/painel";

export default function ErroLinkDeAssinatura({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error("Link de assinatura: a página não abriu", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-5 px-4 py-10">
      <Logo largura={120} />
      <div className="w-full overflow-hidden rounded-[26px] border border-borda-luz bg-surface shadow-float">
        <FaixaPetalas />
        <div className="flex flex-col items-center gap-4 p-6 text-center">
          <span className="grid size-14 place-items-center rounded-2xl text-pine shadow-relevo">
            <WifiOff aria-hidden className="size-7" />
          </span>
          <h1 className="text-[1.35rem] font-bold leading-tight">Não deu para abrir agora</h1>
          <p className="max-w-sm text-ink-2">
            Pode ser a internet fraca ou o site sendo atualizado. Confira a internet e toque no botão abaixo.
          </p>
          <Botao largo icone={<RotateCw aria-hidden className="size-5" />} onClick={() => window.location.reload()}>
            Abrir o link de novo
          </Botao>
          <p className="text-[0.9rem] text-muted">
            Se você já assinou, a assinatura continua guardada. Se precisar, fale com a comissão eleitoral.
          </p>
        </div>
      </div>
    </main>
  );
}
