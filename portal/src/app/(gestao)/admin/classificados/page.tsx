import type { Metadata } from "next";
import { exigirPermissao } from "@/server/contexto";
import { filaModeracao } from "@/server/dados/classificados";
import { DIAS_VALIDADE } from "@/lib/classificados";
import { TituloPagina, Alerta } from "@/components/ui/basicos";
import { BlocoNumero } from "@/components/ui/painel";
import { FilaDeModeracao } from "@/components/classificados/fila-moderacao";

export const metadata: Metadata = { title: "Classificados" };

/** Moderação dos classificados pelo síndico (permissão "classificados.moderar"). */
export default async function ClassificadosGestao() {
  const ctx = await exigirPermissao("classificados.moderar", "/admin/classificados");
  const agora = new Date();
  const fila = await filaModeracao(ctx, agora);

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Comunicação"
        titulo="Classificados"
        descricao={`Os moradores anunciam vendas, serviços e doações. Nada aparece sem a sua aprovação, e cada anúncio aprovado fica no ar por ${DIAS_VALIDADE} dias.`}
      />

      <div className="grid grid-cols-3 gap-2.5">
        <BlocoNumero
          rotulo="Aguardando"
          valor={fila.pendentes.length}
          detalhe="para decidir"
          cor={fila.pendentes.length ? "laranja" : "ink"}
        />
        <BlocoNumero rotulo="No ar" valor={fila.publicados.length} detalhe="publicados" cor="pine" />
        <BlocoNumero rotulo="Histórico" valor={fila.historico.length} detalhe="últimas decisões" cor="lake" />
      </div>

      <Alerta tipo="info" titulo="O que os moradores veem">
        Só o primeiro nome do autor e o WhatsApp que ele escolheu mostrar. A casa aparece apenas aqui, para a moderação.
      </Alerta>

      <FilaDeModeracao fila={fila} fuso={ctx.fuso} agora={agora} />
    </div>
  );
}
