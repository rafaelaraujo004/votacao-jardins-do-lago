import type { Metadata } from "next";
import { exigirPermissao } from "@/server/contexto";
import { listarUnidades } from "@/server/dados/unidades";
import { contatosDasCasas, dentroAgora, encomendasAguardando, entradasHoje, esperadosHoje } from "@/server/dados/portaria";
import { formatarData } from "@/lib/formato";
import { Cartao } from "@/components/ui/basicos";
import { ValidarCodigo } from "@/components/portaria/validar-codigo";
import { EntradaSemCodigo, NovaEncomenda } from "@/components/portaria/formularios-portaria";
import { ListaDentro, ListaEncomendasAguardando, ListaEsperados } from "@/components/portaria/listas";
import { AtualizarPortaria } from "@/components/portaria/atualizar";
import { CentralPortaria, type SecaoPortaria } from "@/components/portaria/central-portaria";
import { AbasEncomendas } from "@/components/portaria/abas-encomendas";
import type { EntradaDentro } from "@/components/portaria/aviso-entrada";

export const metadata: Metadata = { title: "Portaria" };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * CENTRAL DA PORTARIA: botões grandes que abrem cada seção (Validar código, Visitante sem
 * código, Encomendas, Dentro agora, Esperados hoje). No celular, uma seção por vez; no
 * computador, botões à esquerda e a seção à direita. Veja CentralPortaria.
 */
export default async function PaginaPortaria() {
  const ctx = await exigirPermissao("portaria.operar");

  const [unidades, dentro, esperados, encomendas, entradas] = await Promise.all([
    listarUnidades(ctx),
    dentroAgora(ctx),
    esperadosHoje(ctx),
    encomendasAguardando(ctx),
    entradasHoje(ctx),
  ]);
  // Telefones das casas com encomenda aguardando ou visitante dentro (botões do WhatsApp).
  // Se falhar, a portaria continua abrindo: os botões só ficam sem telefone.
  const contatos = await contatosDasCasas(ctx, [...encomendas.map((e) => e.unitId), ...dentro.map((p) => p.unitId)]).catch((erro) => {
    console.error("Portaria: não foi possível carregar os telefones das casas", erro);
    return {};
  });

  const casas = unidades.filter((u) => u.status === "ativa").map(({ id, rotulo, numero, quadra }) => ({ id, rotulo, numero, quadra }));
  const entradasDentro: EntradaDentro[] = dentro.map((p) => ({
    id: p.id,
    nome: p.nome,
    unitId: p.unitId,
    unidadeRotulo: p.unidadeRotulo,
    quando: p.quando,
    avisadoEm: p.avisadoEm,
  }));
  const encomendasSemAviso = encomendas.filter((e) => !e.avisadoEm).length;
  const dentroSemAviso = dentro.filter((p) => !p.avisadoEm).length;
  const condominio = ctx.condominioNome;

  const secoes: SecaoPortaria[] = [
    {
      id: "codigo",
      titulo: "Validar código",
      resumo: "visitante com código do morador",
      icone: "KeyRound",
      tom: "verde",
      numero: null,
      conteudo: <ValidarCodigo dentro={entradasDentro} contatos={contatos} condominio={condominio} />,
    },
    {
      id: "sem-codigo",
      titulo: "Visitante sem código",
      resumo: "ligar para o morador e registrar",
      icone: "PhoneCall",
      tom: "lago",
      numero: null,
      conteudo: (
        <>
          <p className="text-ink-2">Ligue para o morador, confirme e registre a entrada.</p>
          <EntradaSemCodigo casas={casas} dentro={entradasDentro} contatos={contatos} condominio={condominio} />
        </>
      ),
    },
    {
      id: "encomendas",
      titulo: "Encomendas",
      resumo: encomendas.length ? `${plural(encomendas.length, "aguardando", "aguardando")} retirada` : "registrar e entregar",
      icone: "Package",
      tom: "vinho",
      numero: encomendas.length,
      alerta: encomendasSemAviso ? `${encomendasSemAviso} sem aviso` : null,
      conteudo: (
        <AbasEncomendas
          total={encomendas.length}
          semAviso={encomendasSemAviso}
          registrar={<NovaEncomenda casas={casas} encomendas={encomendas} contatos={contatos} condominio={condominio} />}
          aguardando={<ListaEncomendasAguardando encomendas={encomendas} fuso={ctx.fuso} contatos={contatos} condominio={condominio} />}
        />
      ),
    },
    {
      id: "dentro",
      titulo: "Dentro agora",
      resumo: dentro.length ? `${plural(dentro.length, "visitante", "visitantes")} no residencial` : "ninguém registrado dentro",
      icone: "Users",
      tom: "lago",
      numero: dentro.length,
      alerta: dentroSemAviso ? `${dentroSemAviso} sem aviso` : null,
      conteudo: <ListaDentro pessoas={dentro} fuso={ctx.fuso} contatos={contatos} condominio={condominio} />,
    },
    {
      id: "esperados",
      titulo: "Esperados hoje",
      resumo: esperados.length ? `${plural(esperados.length, "autorização válida", "autorizações válidas")}` : "nenhuma autorização para hoje",
      icone: "UserCheck",
      tom: "areia",
      numero: esperados.length,
      conteudo: <ListaEsperados autorizacoes={esperados} />,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Cartao className="surgir flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="rotulo-caixa text-plum">Hoje · {formatarData(new Date(), ctx.fuso)}</p>
          <h1 className="text-[1.8rem] font-bold text-destaque">Portaria</h1>
          <p className="text-ink-2">
            <b className="text-ink">{plural(entradas, "entrada", "entradas")}</b> hoje. Toque numa seção para abrir.
          </p>
        </div>
        <AtualizarPortaria />
      </Cartao>

      <CentralPortaria secoes={secoes} />
    </div>
  );
}
