"use client";

/**
 * Formulário de cadastro/edição de uma área de lazer ou equipamento.
 * Listas editáveis: faixas reserváveis, faixas de uso livre, exigências e avisos.
 * A conferência de horários sobrepostos aparece na hora (e o servidor confere de novo).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Clock, Plus, Trash2 } from "lucide-react";
import { Campo, classeEntrada } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { salvarArea } from "@/server/acoes/reservas";
import { SeletorFotos } from "@/components/fotos/seletor-fotos";
import { faixasDeUmaHora, validarFaixas, validarFaixasLivres, type ConfigArea, type TipoArea } from "@/lib/reservas";

type Horario = { rotulo: string; inicio: string; fim: string };
type Linha = Horario & { chave: number };
type Item = { chave: number; texto: string };

const DIA_INTEIRO_EQUIPAMENTO: Horario[] = [{ rotulo: "Dia inteiro", inicio: "07:00", fim: "18:00" }];

const MODELOS: { nome: string; faixas: Horario[] }[] = [
  { nome: "Dia inteiro", faixas: [{ rotulo: "Dia inteiro", inicio: "10:00", fim: "23:00" }] },
  { nome: "Dia inteiro (equipamento, 7h às 18h)", faixas: DIA_INTEIRO_EQUIPAMENTO },
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
const comChave = (f: Horario): Linha => ({ ...f, chave: ++contador });
const item = (texto: string): Item => ({ chave: ++contador, texto });
const preenchidas = (linhas: Linha[]) => linhas.filter((l) => l.rotulo || l.inicio || l.fim);

/** Pessoa que pode ser escolhida como responsável pelos pedidos (vem do servidor). */
export type OpcaoResponsavel = { uid: string; nome: string; perfil: string };

export function FormularioArea({ area, responsaveis = [] }: { area: ConfigArea | null; responsaveis?: OpcaoResponsavel[] }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoArea>(area?.tipo ?? "area");
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    (area?.faixas.length ? area.faixas : MODELOS[0].faixas).map(({ rotulo, inicio, fim }) => comChave({ rotulo, inicio, fim })),
  );
  const [livres, setLivres] = useState<Linha[]>(() => (area?.faixasLivres ?? []).map(comChave));
  const [exigencias, setExigencias] = useState<Item[]>(() => (area?.exigencias ?? []).map(item));
  const [avisos, setAvisos] = useState<Item[]>(() => (area?.avisos ?? []).map(item));
  const [limiteDia, setLimiteDia] = useState(area?.limitePorCasaPorDia ? String(area.limitePorCasaPorDia) : "");

  const problema = validarFaixas(preenchidas(linhas)) ?? validarFaixasLivres(preenchidas(livres), preenchidas(linhas));
  const equipamento = tipo === "equipamento";

  function trocarTipo(novo: TipoArea) {
    setTipo(novo);
    // Área nova virando equipamento: sugere a faixa "Dia inteiro" (dá para mudar depois).
    if (!area && novo === "equipamento") setLinhas(DIA_INTEIRO_EQUIPAMENTO.map(comChave));
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

      <Campo id="tipo" rotulo="Tipo">
        <select id="tipo" name="tipo" value={tipo} onChange={(e) => trocarTipo(e.target.value as TipoArea)} className={classeEntrada}>
          <option value="area">Área de lazer (salão, churrasqueira, quadra…)</option>
          <option value="equipamento">Equipamento (roçadeira, carrinho de mão…)</option>
        </select>
      </Campo>

      <Campo id="nome" rotulo={equipamento ? "Nome do equipamento" : "Nome da área"}>
        <input
          id="nome"
          name="nome"
          required
          minLength={3}
          maxLength={60}
          defaultValue={area?.nome}
          placeholder={equipamento ? "Ex.: Roçadeira" : "Ex.: Salão de festas"}
          className={classeEntrada}
        />
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

      {/* Miniatura e fotos da área (a primeira aparece na lista do morador). Remonta quando as fotos salvas mudam. */}
      <SeletorFotos
        key={(area?.fotos ?? []).join("|")}
        modulo="areas"
        atuais={area?.fotos ?? []}
        rotulo="Fotos da área (opcional)"
        dica={equipamento ? "Até 4 fotos do equipamento. A primeira vira a miniatura na lista." : "Até 4 fotos (salão, quiosque, churrasqueira…). A primeira vira a miniatura na lista."}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {equipamento ? (
          <input type="hidden" name="capacidade" value="1" />
        ) : (
          <Campo id="capacidade" rotulo="Capacidade (pessoas; 0 = não mostrar)">
            <input id="capacidade" name="capacidade" type="number" inputMode="numeric" min={0} max={2000} required defaultValue={area?.capacidade ?? 30} className={classeEntrada} />
          </Campo>
        )}
        <Campo id="exigeAprovacao" rotulo="Pedido do morador">
          <select id="exigeAprovacao" name="exigeAprovacao" defaultValue={area?.exigeAprovacao === false ? "nao" : "sim"} className={classeEntrada}>
            <option value="sim">Exige aprovação</option>
            <option value="nao">Confirma na hora (sem aprovação)</option>
          </select>
        </Campo>
        <Campo
          id="responsavelUid"
          rotulo="Quem aprova os pedidos"
          dica="Os pedidos desta área chegam no sino dessa pessoa. Sem responsável, chegam ao síndico."
        >
          <select
            id="responsavelUid"
            name="responsavelUid"
            defaultValue={area?.responsavelUid && responsaveis.some((r) => r.uid === area.responsavelUid) ? area.responsavelUid : ""}
            className={classeEntrada}
            aria-describedby="responsavelUid-dica"
          >
            <option value="">Síndico / Administração</option>
            {responsaveis.map((r) => (
              <option key={r.uid} value={r.uid}>
                {r.nome}
                {r.perfil ? ` (${r.perfil})` : ""}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="antecedenciaMinimaHoras" rotulo="Antecedência mínima (horas)" dica="Ex.: 24 = um dia antes; 72 = três dias. 0 = até o horário começar.">
          <input
            id="antecedenciaMinimaHoras"
            name="antecedenciaMinimaHoras"
            type="number"
            inputMode="numeric"
            min={0}
            max={8760}
            required
            defaultValue={area?.antecedenciaMinimaHoras ?? 24}
            className={classeEntrada}
            aria-describedby="antecedenciaMinimaHoras-dica"
          />
        </Campo>
        <Campo id="antecedenciaMaxDias" rotulo="Antecedência máxima (dias)" dica="Até quantos dias à frente.">
          <input id="antecedenciaMaxDias" name="antecedenciaMaxDias" type="number" inputMode="numeric" min={1} max={365} required defaultValue={area?.antecedenciaMaxDias ?? 60} className={classeEntrada} aria-describedby="antecedenciaMaxDias-dica" />
        </Campo>
        <Campo id="prazoDesistenciaHoras" rotulo="Prazo de desistência (horas)" dica="Desistir faltando menos que isso fica registrado como fora do prazo (multa conforme o regimento). 0 = sem prazo.">
          <input
            id="prazoDesistenciaHoras"
            name="prazoDesistenciaHoras"
            type="number"
            inputMode="numeric"
            min={0}
            max={8760}
            required
            defaultValue={area?.prazoDesistenciaHoras ?? 0}
            className={classeEntrada}
            aria-describedby="prazoDesistenciaHoras-dica"
          />
        </Campo>
        <Campo id="limitePorMes" rotulo="Limite por casa, por mês" dica="0 = sem limite.">
          <input id="limitePorMes" name="limitePorMes" type="number" inputMode="numeric" min={0} max={31} required defaultValue={area?.limitePorMes ?? 2} className={classeEntrada} aria-describedby="limitePorMes-dica" />
        </Campo>
        <Campo id="limitePorCasaPorDia" rotulo="Limite por casa, no mesmo dia" dica="Deixe em branco para não limitar.">
          <input
            id="limitePorCasaPorDia"
            name="limitePorCasaPorDia"
            type="number"
            inputMode="numeric"
            min={1}
            max={48}
            value={limiteDia}
            onChange={(e) => setLimiteDia(e.target.value)}
            className={classeEntrada}
            aria-describedby="limitePorCasaPorDia-dica"
          />
        </Campo>
        <Campo id="permitirExtraSeDiaLivre" rotulo="Passar do limite do dia" dica="Só vale com limite por dia preenchido.">
          <select
            id="permitirExtraSeDiaLivre"
            name="permitirExtraSeDiaLivre"
            defaultValue={area?.permitirExtraSeDiaLivre ? "sim" : "nao"}
            disabled={!limiteDia}
            className={classeEntrada}
            aria-describedby="permitirExtraSeDiaLivre-dica"
          >
            <option value="nao">Nunca</option>
            <option value="sim">Pode, se nenhuma outra casa reservou o dia</option>
          </select>
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
        <legend className="px-1 font-bold">Faixas de horário (reserváveis)</legend>
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
        <ListaHorarios prefixo="faixa" nomeItem="faixa" linhas={linhas} setLinhas={setLinhas} />
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-2xl border border-line p-4">
        <legend className="px-1 font-bold">Uso livre (sem reserva)</legend>
        <p className="text-[0.92rem] text-muted">
          Horários em que qualquer morador pode usar sem reservar. Aparecem na agenda só como informação e não podem coincidir com as
          faixas reserváveis. Pode deixar vazio.
        </p>
        <ListaHorarios prefixo="livre" nomeItem="faixa de uso livre" linhas={livres} setLinhas={setLivres} />
      </fieldset>

      {problema ? (
        <p role="status" className="flex items-center gap-1.5 text-[0.92rem] font-bold text-danger">
          <CircleAlert aria-hidden className="size-4" />
          {problema}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-3 rounded-2xl border border-line p-4">
        <legend className="px-1 font-bold">Exigências (“Li e concordo”)</legend>
        <p className="text-[0.92rem] text-muted">
          O morador vê estas regras antes de pedir e precisa marcar “Li e concordo com as regras”. O aceite fica gravado na reserva.
        </p>
        <ListaTextos nome="exigencia" rotuloItem="Exigência" exemplo="Ex.: Devolver limpo até as 10h do dia seguinte." itens={exigencias} setItens={setExigencias} maximo={20} />
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-2xl border border-line p-4">
        <legend className="px-1 font-bold">Avisos em destaque</legend>
        <p className="text-[0.92rem] text-muted">Aparecem em destaque na tela da área (ex.: manutenção, combustível por conta de quem reserva).</p>
        <ListaTextos nome="aviso" rotuloItem="Aviso" exemplo="Ex.: Combustível por conta de quem reserva." itens={avisos} setItens={setAvisos} maximo={10} />
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <BotaoEnviar>{area ? "Salvar alterações" : equipamento ? "Cadastrar equipamento" : "Cadastrar área"}</BotaoEnviar>
      </div>
    </Formulario>
  );
}

/** Lista editável de horários (nome, início e fim), enviada como campos repetidos "{prefixo}Rotulo/Inicio/Fim". */
function ListaHorarios({
  prefixo,
  nomeItem,
  linhas,
  setLinhas,
}: {
  prefixo: "faixa" | "livre";
  nomeItem: string;
  linhas: Linha[];
  setLinhas: (f: (atual: Linha[]) => Linha[]) => void;
}) {
  function alterar(chave: number, campo: keyof Horario, valor: string) {
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));
  }
  return (
    <>
      {linhas.length ? (
        <ul className="flex flex-col gap-3">
          {linhas.map((l, i) => (
            <li key={l.chave} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <span className="text-[0.88rem] font-bold">
                  Nome {prefixo === "faixa" ? "da faixa" : "do uso livre"} {i + 1}
                </span>
                <input
                  name={`${prefixo}Rotulo`}
                  value={l.rotulo}
                  onChange={(e) => alterar(l.chave, "rotulo", e.target.value)}
                  maxLength={40}
                  placeholder={prefixo === "faixa" ? "Ex.: Manhã" : "Ex.: Manhã livre"}
                  className={classeEntrada}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[0.88rem] font-bold">Início</span>
                <input name={`${prefixo}Inicio`} type="time" value={l.inicio} onChange={(e) => alterar(l.chave, "inicio", e.target.value)} className={classeEntrada} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[0.88rem] font-bold">Fim</span>
                <input name={`${prefixo}Fim`} type="time" value={l.fim} onChange={(e) => alterar(l.chave, "fim", e.target.value)} className={classeEntrada} />
              </label>
              <Botao
                variante="discreto"
                className="col-span-2 sm:col-span-1"
                icone={<Trash2 aria-hidden className="size-5" />}
                aria-label={`Remover a ${nomeItem} ${l.rotulo || i + 1}`}
                onClick={() => setLinhas((atual) => atual.filter((x) => x.chave !== l.chave))}
              >
                <span className="sm:sr-only">Remover</span>
              </Botao>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[0.92rem] text-muted">Nenhuma {nomeItem} cadastrada.</p>
      )}
      <div>
        <Botao
          tamanho="pequeno"
          variante="secundario"
          icone={<Plus aria-hidden className="size-4" />}
          onClick={() => setLinhas((atual) => [...atual, comChave({ rotulo: "", inicio: "", fim: "" })])}
        >
          {prefixo === "faixa" ? "Acrescentar faixa" : "Acrescentar uso livre"}
        </Botao>
      </div>
    </>
  );
}

/** Lista editável de textos (exigências, avisos), enviada como campo repetido `nome`. */
function ListaTextos({
  nome,
  rotuloItem,
  exemplo,
  itens,
  setItens,
  maximo,
}: {
  nome: "exigencia" | "aviso";
  rotuloItem: string;
  exemplo: string;
  itens: Item[];
  setItens: (f: (atual: Item[]) => Item[]) => void;
  maximo: number;
}) {
  return (
    <>
      {itens.length ? (
        <ul className="flex flex-col gap-3">
          {itens.map((it, i) => (
            <li key={it.chave} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[0.88rem] font-bold">
                  {rotuloItem} {i + 1}
                </span>
                <input
                  name={nome}
                  value={it.texto}
                  onChange={(e) => setItens((atual) => atual.map((x) => (x.chave === it.chave ? { ...x, texto: e.target.value } : x)))}
                  maxLength={200}
                  placeholder={exemplo}
                  className={classeEntrada}
                />
              </label>
              <Botao
                variante="discreto"
                icone={<Trash2 aria-hidden className="size-5" />}
                aria-label={`Remover ${rotuloItem.toLowerCase()} ${i + 1}`}
                onClick={() => setItens((atual) => atual.filter((x) => x.chave !== it.chave))}
              >
                <span className="sr-only">Remover</span>
              </Botao>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[0.92rem] text-muted">Nenhum item cadastrado.</p>
      )}
      {itens.length < maximo ? (
        <div>
          <Botao tamanho="pequeno" variante="secundario" icone={<Plus aria-hidden className="size-4" />} onClick={() => setItens((atual) => [...atual, item("")])}>
            Acrescentar {rotuloItem.toLowerCase()}
          </Botao>
        </div>
      ) : null}
    </>
  );
}
