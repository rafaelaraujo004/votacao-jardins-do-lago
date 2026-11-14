/**
 * Peças dos relatórios: tabela de números, botão "Baixar CSV" e aviso de dados incompletos.
 */
import type { ReactNode } from "react";
import { FileDown } from "lucide-react";
import { cx } from "@/lib/cx";
import { classesDoBotao } from "@/components/ui/botao";
import { Alerta } from "@/components/ui/basicos";
import type { AssuntoRelatorio } from "@/lib/relatorios";

/**
 * Tabela simples: 1ª coluna à esquerda (o nome), as outras à direita (números).
 * No celular, só a tabela rola de lado (a página não).
 */
export function TabelaRelatorio({
  legenda,
  cabecalho,
  linhas,
  rodape,
}: {
  /** Título curto da tabela (lido por leitores de tela). */
  legenda: string;
  cabecalho: string[];
  linhas: ReactNode[][];
  rodape?: ReactNode[];
}) {
  return (
    <div className="afundado overflow-x-auto rounded-[var(--radius-card)]">
      <table className="w-full min-w-[22rem] border-collapse text-[0.92rem] tabular-nums">
        <caption className="sr-only">{legenda}</caption>
        <thead>
          <tr className="border-b border-line">
            {cabecalho.map((c, i) => (
              <th key={c} scope="col" className={cx("px-3 py-2.5 font-bold text-ink-2", i === 0 ? "text-left" : "text-right")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-b border-line/60 last:border-b-0">
              {l.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="px-3 py-2 text-left font-normal text-ink">
                    {c}
                  </th>
                ) : (
                  <td key={j} className="px-3 py-2 text-right text-ink">
                    {c}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
        {rodape ? (
          <tfoot>
            <tr className="border-t-2 border-line-strong">
              {rodape.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="px-3 py-2.5 text-left font-bold">
                    {c}
                  </th>
                ) : (
                  <td key={j} className="px-3 py-2.5 text-right font-bold">
                    {c}
                  </td>
                ),
              )}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/** Link de download do CSV (rota com login e "relatorios.ver"). */
export function BotaoCsv({ assunto, ano }: { assunto: AssuntoRelatorio; ano: number }) {
  return (
    <a href={`/admin/relatorios/csv?assunto=${assunto}&ano=${ano}`} className={classesDoBotao("secundario", "pequeno")} download>
      <FileDown aria-hidden className="size-4" /> Baixar CSV (Excel)
    </a>
  );
}

/** Aparece quando uma consulta bateu no teto de documentos. */
export function AvisoIncompleto({ incompleto }: { incompleto: boolean }) {
  if (!incompleto) return null;
  return (
    <Alerta tipo="aviso" titulo="Números parciais">
      Este ano tem muitos registros e só uma parte foi somada. Os totais abaixo podem estar menores do que o real.
    </Alerta>
  );
}

/** Seção com título e conteúdo. */
export function SecaoRelatorio({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby={id}>
      <h2 id={id} className="text-xl font-bold">
        {titulo}
      </h2>
      {children}
    </section>
  );
}
