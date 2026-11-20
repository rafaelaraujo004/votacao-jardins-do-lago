"use client";

/** Campos do lançamento. As categorias mudam conforme a escolha "entrada" ou "saída". */
import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Campo, classeEntrada } from "@/components/ui/basicos";
import { FORMAS_PAGAMENTO, type TipoLancamento } from "@/lib/financeiro";
import { cx } from "@/lib/cx";

type Cat = { id: string; nome: string; tipo: TipoLancamento };

export function CamposLancamento({
  categorias,
  hoje,
  dataPadrao,
  dataMinima,
}: {
  categorias: Cat[];
  hoje: string;
  dataPadrao?: string;
  dataMinima?: string;
}) {
  const [tipo, setTipo] = useState<TipoLancamento>("despesa");
  const opcoes = categorias.filter((c) => c.tipo === tipo);

  const opcaoTipo = (valor: TipoLancamento, rotulo: string, Icone: typeof ArrowDownLeft, cor: string) => (
    <label
      className={cx(
        // Escolhido: afundado e colorido. Não escolhido: em relevo. O contorno aparece ao navegar pelo teclado.
        "flex min-h-16 flex-1 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 font-bold transition-shadow",
        "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-lake",
        tipo === valor ? `${cor} border-current shadow-afundado` : "border-borda-luz bg-surface text-ink-2 shadow-relevo hover:text-ink",
      )}
    >
      <input type="radio" name="tipo" value={valor} checked={tipo === valor} onChange={() => setTipo(valor)} className="sr-only" />
      <Icone aria-hidden className="size-6" />
      {rotulo}
    </label>
  );

  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 font-bold">O dinheiro…</legend>
        <div className="flex flex-col gap-2 sm:flex-row">
          {opcaoTipo("despesa", "Saiu (despesa)", ArrowUpRight, "text-plum bg-plum-soft")}
          {opcaoTipo("receita", "Entrou (receita)", ArrowDownLeft, "text-lake bg-lake-soft")}
        </div>
      </fieldset>

      <Campo id="categoriaId" rotulo="Categoria">
        <select key={tipo} id="categoriaId" name="categoriaId" required defaultValue="" className={classeEntrada}>
          <option value="" disabled>Escolha a categoria</option>
          {opcoes.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="valor" rotulo="Valor (R$)" dica="Ex.: 1.234,56">
          <input id="valor" name="valor" inputMode="decimal" required placeholder="0,00" autoComplete="off" pattern="[0-9.,R$ ]+" className={classeEntrada} aria-describedby="valor-dica" />
        </Campo>
        <Campo id="data" rotulo="Data do pagamento ou recebimento">
          <input id="data" name="data" type="date" required max={hoje} min={dataMinima} defaultValue={dataPadrao ?? hoje} className={classeEntrada} />
        </Campo>
      </div>

      <Campo id="forma" rotulo="Forma de pagamento">
        <select id="forma" name="forma" required defaultValue="pix" className={classeEntrada}>
          {Object.entries(FORMAS_PAGAMENTO).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>{rotulo}</option>
          ))}
        </select>
      </Campo>

      <Campo id="descricao" rotulo="Descrição" dica="Curta e clara. Os moradores verão este texto quando o mês for publicado. Não coloque dados bancários nem CPF.">
        <input id="descricao" name="descricao" required minLength={3} maxLength={200} placeholder="Ex.: Conta de luz das áreas comuns — outubro" className={classeEntrada} aria-describedby="descricao-dica" />
      </Campo>
    </>
  );
}
