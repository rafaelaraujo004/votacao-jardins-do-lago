"use client";

import { CircleAlert } from "lucide-react";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { Cartao, EstadoVazio } from "@/components/ui/basicos";
import { Logo } from "@/components/ui/marca";
import { FaixaPetalas } from "@/components/ui/painel";

/** Tela mostrada quando algo inesperado acontece no servidor. Não mostra detalhes técnicos. */
export default function Erro({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-4 py-10">
      <Logo largura={120} />
      {/* Cartão em relevo com a faixa de pétalas, no visual do portal. */}
      <Cartao semEspaco className="w-full overflow-hidden">
        <FaixaPetalas />
        <div className="p-4">
          <EstadoVazio
            icone={CircleAlert}
            titulo="Algo não saiu como esperado"
            acao={
              <div className="flex flex-wrap justify-center gap-2">
                <Botao onClick={reset}>Tentar de novo</Botao>
                <BotaoLink href="/" variante="secundario">
                  Ir para o início
                </BotaoLink>
              </div>
            }
          >
            Tente de novo em alguns instantes. Se continuar, avise a administração do condomínio.
          </EstadoVazio>
        </div>
      </Cartao>
    </main>
  );
}
