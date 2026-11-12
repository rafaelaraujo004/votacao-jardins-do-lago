"use client";

import { CircleAlert } from "lucide-react";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/basicos";

/** Tela mostrada quando algo inesperado acontece no servidor. Não mostra detalhes técnicos. */
export default function Erro({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
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
    </main>
  );
}
