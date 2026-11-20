"use client";

/**
 * Cartões do mês + gráfico, ligados: tocar num mês do gráfico troca o
 * cabeçalho e os cartões de cima para aquele mês. O servidor já manda o
 * cabeçalho e os cartões de cada mês do gráfico prontos; aqui só se escolhe
 * qual mostrar.
 */
import { useState, type ReactNode } from "react";
import { Undo2 } from "lucide-react";
import { nomeDoMes } from "@/lib/financeiro";
import { GraficoSaldo, type PontoSaldo } from "./grafico-saldo";

export type PainelDoMes = { cabecalho: ReactNode; cartoes: ReactNode };

export function ResumoDosMeses({
  paineis,
  inicial,
  pontos,
  mensagemVazia,
}: {
  /** Cabeçalho e cartões de cada mês ("AAAA-MM"). */
  paineis: Record<string, PainelDoMes>;
  /** Mês mostrado ao abrir (tem que estar em `paineis`). */
  inicial: string;
  pontos: PontoSaldo[];
  mensagemVazia: string;
}) {
  const [mes, setMes] = useState(inicial);
  const painel = paineis[mes] ?? paineis[inicial];
  const voltar = mes !== inicial && paineis[mes];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {painel.cabecalho}
        {voltar ? (
          <button
            type="button"
            onClick={() => setMes(inicial)}
            className="ml-auto inline-flex min-h-11 items-center gap-1.5 font-bold text-lake underline-offset-2 hover:underline"
          >
            <Undo2 aria-hidden className="size-4" />
            Voltar para {nomeDoMes(inicial).split(" ")[0]}
          </button>
        ) : null}
      </div>

      {painel.cartoes}

      <h3 className="sr-only">Saldo nos últimos meses</h3>
      <GraficoSaldo
        pontos={pontos}
        mensagemVazia={mensagemVazia}
        mesEscolhido={mes}
        // Mês sem cartões (o de partida, antes do primeiro lançamento): não troca.
        onEscolherMes={(m) => (paineis[m] ? setMes(m) : undefined)}
      />
    </>
  );
}
