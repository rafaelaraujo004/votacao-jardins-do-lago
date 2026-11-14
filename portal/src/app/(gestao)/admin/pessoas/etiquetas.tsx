import { CircleCheck, CirclePause, KeyRound } from "lucide-react";
import { Etiqueta } from "@/components/ui/basicos";

export function EtiquetaSituacaoPessoa({ status }: { status: "ativo" | "suspenso" }) {
  return status === "ativo" ? (
    <Etiqueta tom="ok" icone={CircleCheck}>Ativo</Etiqueta>
  ) : (
    <Etiqueta tom="aviso" icone={CirclePause}>Suspenso</Etiqueta>
  );
}

/** Equipe que recebeu senha provisória e ainda não criou a própria. */
export function EtiquetaSenhaProvisoria() {
  return (
    <Etiqueta tom="info" icone={KeyRound}>
      Senha provisória
    </Etiqueta>
  );
}
