"use client";

import { Botao } from "@/components/ui/botao";
import { Cartao } from "@/components/ui/basicos";
import { BotaoComConfirmacao } from "@/components/ui/confirmacao";
import { useAvisos } from "@/components/ui/avisos";

/** Peças que respondem ao clique: avisos e confirmação. */
export function VitrineInterativa() {
  const { avisar } = useAvisos();
  return (
    <Cartao className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">Retorno e confirmação</h2>
      <p className="text-ink-2">Depois de cada operação aparece um aviso. Antes de ações importantes, uma confirmação.</p>
      <div className="flex flex-wrap gap-2">
        <Botao variante="secundario" onClick={() => avisar("sucesso", "Reserva confirmada.")}>
          Mostrar aviso de sucesso
        </Botao>
        <Botao variante="secundario" onClick={() => avisar("erro", "Sem conexão. Confira a internet e tente de novo.")}>
          Mostrar aviso de erro
        </Botao>
        <BotaoComConfirmacao
          variante="perigo"
          perigo
          titulo="Cancelar a autorização?"
          mensagem="O visitante não vai mais conseguir entrar com este código. Você pode criar outra autorização depois."
          textoConfirmar="Sim, cancelar"
          aoConfirmar={() => avisar("sucesso", "Autorização cancelada.")}
        >
          Cancelar autorização
        </BotaoComConfirmacao>
      </div>
    </Cartao>
  );
}
