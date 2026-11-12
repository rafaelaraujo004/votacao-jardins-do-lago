import { MapPinned } from "lucide-react";
import { BotaoLink } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/basicos";

export default function NaoEncontrada() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
      <EstadoVazio
        icone={MapPinned}
        titulo="Página não encontrada"
        acao={<BotaoLink href="/">Ir para o início</BotaoLink>}
      >
        O endereço pode estar errado ou a página mudou de lugar.
      </EstadoVazio>
    </main>
  );
}
