import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { BotaoLink } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/basicos";

export const metadata: Metadata = { title: "Sem acesso" };

export default function SemAcesso() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
      <EstadoVazio
        icone={Lock}
        titulo="Esta área não faz parte do seu perfil"
        acao={<BotaoLink href="/">Voltar para o início</BotaoLink>}
      >
        Se você precisa usar esta parte do portal, peça à administração do condomínio para liberar o acesso.
      </EstadoVazio>
    </main>
  );
}
