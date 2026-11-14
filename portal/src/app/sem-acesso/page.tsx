import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { BotaoLink } from "@/components/ui/botao";
import { Cartao, EstadoVazio } from "@/components/ui/basicos";
import { Logo } from "@/components/ui/marca";
import { FaixaPetalas } from "@/components/ui/painel";

export const metadata: Metadata = { title: "Sem acesso" };

export default function SemAcesso() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-4 py-10">
      <Logo largura={120} />
      {/* Cartão em relevo com a faixa de pétalas, no visual do portal. */}
      <Cartao semEspaco className="w-full overflow-hidden">
        <FaixaPetalas />
        <div className="p-4">
          <EstadoVazio
            icone={Lock}
            titulo="Esta área não faz parte do seu perfil"
            acao={<BotaoLink href="/">Voltar para o início</BotaoLink>}
          >
            Se você precisa usar esta parte do portal, peça à administração do condomínio para liberar o acesso.
          </EstadoVazio>
        </div>
      </Cartao>
    </main>
  );
}
