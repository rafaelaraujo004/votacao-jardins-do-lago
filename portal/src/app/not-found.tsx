import { MapPinned } from "lucide-react";
import { BotaoLink } from "@/components/ui/botao";
import { Cartao, EstadoVazio } from "@/components/ui/basicos";
import { Logo } from "@/components/ui/marca";
import { FaixaPetalas } from "@/components/ui/painel";

export default function NaoEncontrada() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-4 py-10">
      <Logo largura={120} />
      {/* Cartão em relevo com a faixa de pétalas, no visual do portal. */}
      <Cartao semEspaco className="w-full overflow-hidden">
        <FaixaPetalas />
        <div className="p-4">
          <EstadoVazio
            icone={MapPinned}
            titulo="Página não encontrada"
            acao={<BotaoLink href="/">Ir para o início</BotaoLink>}
          >
            O endereço pode estar errado ou a página mudou de lugar.
          </EstadoVazio>
        </div>
      </Cartao>
    </main>
  );
}
