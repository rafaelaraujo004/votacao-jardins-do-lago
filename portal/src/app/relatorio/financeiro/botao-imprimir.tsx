"use client";

import { Printer } from "lucide-react";
import { Botao } from "@/components/ui/botao";

export function BotaoImprimir() {
  return (
    <Botao onClick={() => window.print()} icone={<Printer aria-hidden className="size-5" />}>
      Imprimir / PDF
    </Botao>
  );
}
