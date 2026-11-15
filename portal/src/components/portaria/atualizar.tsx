"use client";

/**
 * Botão "Atualizar agora" da portaria.
 * A tela já se atualiza sozinha quando alguém muda algo (componente Sincronizar, na moldura
 * da portaria); o botão fica para quem quiser conferir na hora.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Botao } from "@/components/ui/botao";

export function AtualizarPortaria() {
  const router = useRouter();
  const [atualizando, iniciar] = useTransition();

  return (
    <Botao
      variante="secundario"
      tamanho="pequeno"
      carregando={atualizando}
      onClick={() => iniciar(() => router.refresh())}
      icone={<RefreshCw aria-hidden className="size-4" />}
    >
      Atualizar agora
    </Botao>
  );
}
