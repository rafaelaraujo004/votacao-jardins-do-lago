import { CircleCheck, CirclePause } from "lucide-react";
import { Etiqueta } from "@/components/ui/basicos";

export function EtiquetaSituacaoPessoa({ status }: { status: "ativo" | "suspenso" }) {
  return status === "ativo" ? (
    <Etiqueta tom="ok" icone={CircleCheck}>Ativo</Etiqueta>
  ) : (
    <Etiqueta tom="aviso" icone={CirclePause}>Suspenso</Etiqueta>
  );
}
