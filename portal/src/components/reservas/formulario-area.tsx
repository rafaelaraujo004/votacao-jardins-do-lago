"use client";

/**
 * Formulário de cadastro/edição de uma área de lazer.
 * As faixas de horário são uma lista: dá para acrescentar, remover ou usar um modelo pronto.
 * A conferência de horários sobrepostos aparece na hora (e o servidor confere de novo).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Clock, Plus, Trash2 } from "lucide-react";
import { Campo, classeEntrada } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { salvarArea } from "@/server/acoes/reservas";
import { faixasDeUmaHora, validarFaixas, type ConfigArea } from "@/lib/reservas";

type Linha = { chave: number; rotulo: string; inicio: string; fim: string };

const MODELOS: { nome: string; faixas: Omit<Linha, "chave">[] }[] = [
  { nome: "Dia inteiro", faixas: [{ rotulo: "Dia inteiro", inicio: "10:00", fim: "23:00" }] },
  {
    nome: "Manhã, tarde e noite",
    faixas: [
      { rotulo: "Manhã", inicio: "08:00", fim: "12:00" },
      { rotulo: "Tarde", inicio: "13:00", fim: "18:00" },
      { rotulo: "Noite", inicio: "18:00", fim: "23:00" },
    ],
  },
  {
    nome: "De 1 em 1 hora (7h às 22h)",
    faixas: faixasDeUmaHora(7, 22).map(({ rotulo, inicio, fim }) => ({ rotulo, inicio, fim })),
  },
];

let contador = 0;
const comChave = (f: Omit<Linha, "chave">): Linha => ({ ...f, chave: ++contador });

export function FormularioArea({ area }: { area: ConfigArea | null }) {
  const router = useRouter();
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    (area?.faixas.length ? area.faixas : MODELOS[0].faixas).map(({ rotulo, inicio, fim }) => comChave({ rotulo, inicio, fim })),
  );
  const preenchidas = linhas.filter((l) => l.rotulo || l.inicio || l.fim);
  const problema = validarFaixas(preenchidas);

  function alterar(chave: number, campo: "rotulo" | "inicio" | "fim", valor: string) {
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));
  }

  return (
    <Formulario
      acao={salvarArea}
      limparAoSalvar={false}
      aoSalvar={() => {
        if (area) router.refresh();
        else router.push("/admin/reservas/areas");
      }}
    >
      {area ? <input type="hidden" name="id" value={area.id} /> : null}

      <Campo id="nome" rotulo="Nome da área">
        <input id="nome" name="nome" required minLength={3} maxLength={60} defaultValue={area?.nome} placeholder="Ex.: Salão de festas" className={classeEntrada} />
      </Campo>

      <Campo id="regras" rotulo="Regras de uso" dica="Aparecem para o morador antes de reservar. Sem valores de taxa: isso é decidido em assembleia.">
        <textarea
          id="regras"
          name="regras"
          rows={4}
          maxLength={1500}
          defaultValue={area?.regras}
          placeholder="Ex.: Som baixo depois das 22h. Devolver limpo."
          className={`${classeEntrada} py-3`}
          aria-describedby="regras-dica"
        />
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="capacidade" rotulo="Capacidade (pessoas)">
          <input id="capacidade" name="capacidade" type="number" inputMode="numeric" min={1} max={2000} required defaultValue={area?.capacidade ?? 30} className={classeEntrada} />
        </Campo>
        <Campo id="exigeAprovacao" rotulo="Pedido do morador">
          <select id="exigeAprovacao" name="exigeAprovacao" defaultValue={area?.exigeAprovacao === false ? "nao" : "sim"} className={classeEntrada}>
            <option value="sim">Exige aprovação da administração</option>
            <option value="nao">Confirma na hora (sem aprovação)</option>
          </select>
        </Campo>
        <Campo id="antecedenciaMinDias" rotulo="Antecedência mínima (dias)" dica="0 = pode pedir para o mesmo dia.">
          <input id="antecedenciaMinDias" name="antecedenciaMinDias" type="number" inputMode="numeric" min={0} max={365} required defaultValue={area?.antecedenciaMinDias ?? 1} className={classeEntrada} aria-describedby="antecedenciaMinDias-dica" />
        </Campo>
        <Campo id="antecedenciaMaxDias" rotulo="Antecedência máxima (dias)" dica="Até quantos dias à frente.">
          <input id="antecedenciaMaxDias" name="antecedenciaMaxDias" type="number" inputMode="numeric" min={1} max={365} required defaultValue={area?.antecedenciaMaxDias ?? 60} className={classeEntrada} aria-describedby="antecedenciaMaxDias-dica" />
        </Campo>
        <Campo id="limitePorMes" rotulo="Limite por casa, por mês" dica="0 = sem limite.">
          <input id="limitePorMes" name="limitePorMes" type="number" inputMode="numeric" min={0} max={31} required defaultValue={area?.limitePorMes ?? 2} className={classeEntrada} aria-describedby="limitePorMes-dica" />
        </Campo>
        <Campo id="ativa" rotulo="Situação">
          <select id="ativa" name="ativa" defaultValue={area?.ativa === false ? "nao" : "sim"} className={classeEntrada}>
            <option value="sim">Ativa (recebe reservas)</option>
            <option value="nao">Inativa (não aparece para o morador)</option>
          </select>
        </Campo>
        <Campo id="ordem" rotulo="Ordem na lista" dica="Menor aparece primeiro.">
          <input id="ordem" name="ordem" type="number" inputMode="numeric" min={0} max={99} required defaultValue={area?.ordem ?? 10} className={classeEntrada} aria-describedby="ordem-dica" />
        </Campo>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-2xl border border-line p-4">
        <legend className="px-1 font-bold">Faixas de horário</legend>
        <p className="text-[0.92rem] text-muted">
          Cada faixa é um horário que pode ser reservado. Elas não podem se sobrepor.
          {area ? " Mudar um horário não altera reservas já feitas: elas continuam no horário antigo." : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {MODELOS.map((m) => (
            <Botao key={m.nome} tamanho="pequeno" variante="secundario" icone={<Clock aria-hidden className="size-4" />} onClick={() => setLinhas(m.faixas.map(comChave))}>
              {m.nome}
            </Botao>
          ))}
        </div>

        <ul className="flex flex-col gap-3">
          {linhas.map((l, i) => (
            <li key={l.chave} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <span className="text-[0.88rem] font-bold">Nome da faixa {i + 1}</span>
                <input name="faixaRotulo" value={l.rotulo} onChange={(e) => alterar(l.chave, "rotulo", e.target.value)} maxLength={40} placeholder="Ex.: Manhã" className={classeEntrada} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[0.88rem] font-bold">Início</span>
                <input name="faixaInicio" type="time" value={l.inicio} onChange={(e) => alterar(l.chave, "inicio", e.target.value)} className={classeEntrada} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[0.88rem] font-bold">Fim</span>
                <input name="faixaFim" type="time" value={l.fim} onChange={(e) => alterar(l.chave, "fim", e.target.value)} className={classeEntrada} />
              </label>
              <Botao
                variante="discreto"
                className="col-span-2 sm:col-span-1"
                icone={<Trash2 aria-hidden className="size-5" />}
                aria-label={`Remover a faixa ${l.rotulo || i + 1}`}
                onClick={() => setLinhas((atual) => atual.filter((x) => x.chave !== l.chave))}
              >
                <span className="sm:sr-only">Remover</span>
              </Botao>
            </li>
          ))}
        </ul>

        <div>
          <Botao
            tamanho="pequeno"
            variante="secundario"
            icone={<Plus aria-hidden className="size-4" />}
            onClick={() => setLinhas((atual) => [...atual, comChave({ rotulo: "", inicio: "", fim: "" })])}
          >
            Acrescentar faixa
          </Botao>
        </div>

        {problema ? (
          <p role="status" className="flex items-center gap-1.5 text-[0.92rem] font-bold text-danger">
            <CircleAlert aria-hidden className="size-4" />
            {problema}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <BotaoEnviar>{area ? "Salvar alterações" : "Cadastrar área"}</BotaoEnviar>
      </div>
    </Formulario>
  );
}
