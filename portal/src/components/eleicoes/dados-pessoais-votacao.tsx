/**
 * Tela da comissão, depois do resultado: APAGAR OS DADOS PESSOAIS DA VOTAÇÃO (LGPD).
 * Explica o que apaga (senhas e códigos dos links de voto) e o que fica (resultado, quem votou
 * sem o voto, ata, assinaturas e a lista de contatos, que a portaria também usa).
 * Pede confirmação antes.
 * Componente de servidor. Veja src/server/dados/limpeza-votacao.ts.
 */
import { ShieldCheck, Trash2 } from "lucide-react";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";
import { Cartao } from "@/components/ui/basicos";
import { apagarDadosPessoaisVotacao } from "@/server/acoes/limpeza-votacao";
import type { SituacaoLimpeza } from "@/server/dados/limpeza-votacao";
import { formatarDataHora } from "@/lib/formato";

export function DadosPessoaisVotacao({
  eleicaoId,
  situacao,
  fuso,
}: {
  eleicaoId: string;
  situacao: SituacaoLimpeza;
  fuso: string;
}) {
  if (situacao.apagadosEm && situacao.links === 0) {
    return (
      <Cartao className="flex items-start gap-3 text-ink-2">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-pine" />
        <p>
          <b className="text-ink">Senhas dos links de voto apagadas</b> em {formatarDataHora(situacao.apagadosEm, fuso)}.
          Os links antigos mostram que a votação terminou. O resultado, a ata e as assinaturas continuam guardados.
        </p>
      </Cartao>
    );
  }
  return (
    <Cartao className="flex flex-col gap-3">
      <div className="flex items-start gap-3 text-ink-2">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-lake" />
        <div className="flex flex-col gap-1">
          <p className="font-bold text-ink">Dados pessoais da votação (LGPD)</p>
          <p>
            Depois do resultado, as senhas e os códigos dos links de voto ({situacao.links}) não servem para mais nada.
            Apague quando a ata estiver pronta: os links antigos passam a mostrar que a votação terminou.
          </p>
          <p className="text-[0.9rem] text-muted">
            Continuam guardados: o resultado, quais casas votaram (nunca em quem), a ata, as assinaturas e a lista de
            contatos (a portaria usa para avisar das encomendas).
          </p>
        </div>
      </div>
      {situacao.podeApagar ? (
        <div>
          <AcaoConfirmada
            acao={apagarDadosPessoaisVotacao}
            campos={{ id: eleicaoId }}
            titulo="Apagar os dados pessoais da votação?"
            mensagem="Apaga as senhas e os códigos dos links de voto desta votação. Não dá para desfazer: os links antigos param de funcionar (passam a mostrar que a votação terminou). O resultado, a ata e as assinaturas ficam."
            textoConfirmar="Sim, apagar"
            perigo
            variante="perigo"
          >
            <Trash2 aria-hidden className="size-4" /> Apagar dados pessoais da votação
          </AcaoConfirmada>
        </div>
      ) : (
        <p className="text-[0.9rem] text-muted">Disponível depois que o resultado for divulgado a todos.</p>
      )}
    </Cartao>
  );
}
