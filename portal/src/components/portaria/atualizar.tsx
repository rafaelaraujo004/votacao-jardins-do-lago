"use client";

/**
 * Mantém a tela da portaria em dia: recarrega as listas a cada minuto
 * (só quando a tela está visível) e oferece o botão "Atualizar agora".
 */
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Botao } from "@/components/ui/botao";

export function AtualizarPortaria({ segundos = 60 }: { segundos?: number }) {
  const router = useRouter();
  const [atualizando, iniciar] = useTransition();

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, segundos * 1000);
    return () => window.clearInterval(id);
  }, [router, segundos]);

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
