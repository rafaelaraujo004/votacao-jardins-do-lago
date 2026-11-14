/** Etiqueta da situação do login do morador: "Sem acesso", "Senha provisória" ou "Acesso ativo". */
import { CircleCheck, KeyRound, UserRoundX } from "lucide-react";
import { Etiqueta } from "@/components/ui/basicos";
import type { SituacaoLoginMorador } from "@/lib/usuario-morador";

export function EtiquetaLoginMorador({ situacao }: { situacao: SituacaoLoginMorador }) {
  if (situacao === "sem-acesso") {
    return (
      <Etiqueta tom="neutro" icone={UserRoundX}>
        Sem acesso
      </Etiqueta>
    );
  }
  if (situacao === "provisoria") {
    return (
      <Etiqueta tom="info" icone={KeyRound}>
        Senha provisória
      </Etiqueta>
    );
  }
  return (
    <Etiqueta tom="ok" icone={CircleCheck}>
      Acesso ativo
    </Etiqueta>
  );
}
