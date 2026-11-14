import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, CircleCheck, Clock, Inbox, TriangleAlert, UserCheck, Wallet, XCircle } from "lucide-react";
import { Alerta, Campo, Cartao, classeEntrada, EstadoVazio, Etiqueta, TituloPagina } from "@/components/ui/basicos";
import { Botao, BotaoLink } from "@/components/ui/botao";
import { Atalho } from "@/components/ui/atalho";
import { AtalhoModulo, BlocoNumero, FaixaPetalas, SegmentoLinks, TituloSecao } from "@/components/ui/painel";
import { Logo, Petalas } from "@/components/ui/marca";
import { BotaoTema } from "@/components/ui/tema";
import { formatarData, formatarMoeda } from "@/lib/formato";
import { VitrineInterativa } from "./vitrine-interativa";

export const metadata: Metadata = { title: "Identidade visual" };

const CORES = [
  { nome: "Verde-pinho", token: "pine", uso: "Cor institucional, botões principais" },
  { nome: "Verde-noite", token: "band", uso: "Faixa do topo e menu" },
  { nome: "Azul-lago", token: "lake", uso: "Informação e links" },
  { nome: "Ameixa", token: "plum", uso: "Destaques (cor do nome na logo)" },
  { nome: "Areia", token: "sand", uso: "Etiquetas (dourado da logo)" },
  { nome: "Âmbar", token: "warn", uso: "Atenção" },
  { nome: "Vermelho", token: "danger", uso: "Erros e ações perigosas" },
  { nome: "Fundo", token: "canvas", uso: "Fundo das páginas" },
];

/** Vitrine do visual — só no computador local, para validar a identidade. */
export default function Identidade() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <TituloPagina
          sobretitulo="Somente no computador local"
          titulo="Identidade visual do portal"
          descricao="Cores, letras e peças usadas em todas as telas. Use o botão ao lado para ver o modo escuro."
        />
        <BotaoTema className="saltado shrink-0 text-ink hover:text-pine" />
      </div>

      <Cartao className="relative flex flex-wrap items-center gap-6 overflow-hidden">
        <Petalas tamanho={200} className="absolute -right-10 -top-10 opacity-30" />
        <Logo largura={180} />
        <div className="relative max-w-md">
          <h2 className="text-xl font-bold">Marca</h2>
          <p className="text-ink-2">
            A logo aparece sempre sobre o selo claro. As pétalas coloridas são só um detalhe decorativo; o verde-pinho é a
            cor que organiza o sistema.
          </p>
        </div>
      </Cartao>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Cores</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CORES.map((c) => (
            <li key={c.token} className="saltado overflow-hidden rounded-2xl">
              <div className="m-2 h-14 rounded-xl shadow-afundado" style={{ background: `var(--${c.token})` }} />
              <div className="px-3 pb-3 pt-1">
                <p className="font-bold">{c.nome}</p>
                <p className="text-[0.85rem] text-muted">{c.uso}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Cartao className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Letras</h2>
          <p className="font-display text-[2rem] font-bold leading-tight">Bricolage Grotesque nos títulos</p>
          <p className="text-[1.05rem]">
            Atkinson Hyperlegible no texto: desenhada para quem tem baixa visão, diferencia bem letras parecidas como I, l
            e 1.
          </p>
          <p className="text-muted">
            Dinheiro e datas sempre no formato brasileiro: {formatarMoeda(123456)} · {formatarData(new Date())}
          </p>
        </Cartao>

        <Cartao className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Botões</h2>
          <div className="flex flex-wrap gap-2">
            <Botao>Confirmar</Botao>
            <Botao variante="secundario">Voltar</Botao>
            <Botao variante="perigo">Cancelar reserva</Botao>
            <Botao variante="discreto">Ver detalhes</Botao>
          </div>
          <Botao tamanho="grande" largo icone={<UserCheck aria-hidden className="size-6" />}>
            Autorizar visitante
          </Botao>
          <div className="flex flex-wrap gap-2">
            <Botao carregando>Salvando</Botao>
            <BotaoLink href="/identidade" variante="secundario" tamanho="pequeno">
              Link com cara de botão
            </BotaoLink>
          </div>
        </Cartao>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Situações (sempre ícone + texto)</h2>
        <div className="flex flex-wrap gap-2">
          <Etiqueta tom="ok" icone={CircleCheck}>Concluída</Etiqueta>
          <Etiqueta tom="info" icone={Clock}>Em análise</Etiqueta>
          <Etiqueta tom="aviso" icone={TriangleAlert}>Aguardando aprovação</Etiqueta>
          <Etiqueta tom="erro" icone={XCircle}>Cancelada</Etiqueta>
          <Etiqueta tom="destaque" icone={CalendarDays}>Hoje</Etiqueta>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Alerta tipo="sucesso" titulo="Visitante autorizado.">O código foi enviado para você compartilhar.</Alerta>
          <Alerta tipo="erro" titulo="Este horário acabou de ser reservado.">Escolha outro horário na lista abaixo.</Alerta>
          <Alerta tipo="aviso" titulo="Sua reserva precisa de aprovação.">A administração responde em até 2 dias.</Alerta>
          <Alerta tipo="info" titulo="Manutenção programada.">A piscina fica fechada no sábado.</Alerta>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Cartao className="flex flex-col gap-4">
          <h2 className="text-xl font-bold">Formulário</h2>
          <Campo id="nome-visitante" rotulo="Nome do visitante" dica="Como está no documento.">
            <input id="nome-visitante" className={classeEntrada} placeholder="Ex.: Maria Souza" aria-describedby="nome-visitante-dica" />
          </Campo>
          <Campo id="placa" rotulo="Placa do carro (opcional)" erro="Confira a placa: use 3 letras e 4 números ou letras.">
            <input id="placa" className={classeEntrada} defaultValue="AB12" aria-invalid="true" aria-describedby="placa-erro" />
          </Campo>
        </Cartao>
        <Cartao className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Estado vazio</h2>
          <EstadoVazio icone={Inbox} titulo="Você ainda não possui reservas" acao={<Botao>Agendar uma área</Botao>}>
            Que tal agendar uma área de lazer?
          </EstadoVazio>
        </Cartao>
      </section>

      <section className="flex flex-col gap-3">
        <TituloSecao extra="valores de exemplo">Painel (Jardim macio)</TituloSecao>
        <FaixaPetalas className="overflow-hidden rounded-full" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <BlocoNumero rotulo="Exemplo" valor="123" detalhe="cor verde" cor="pine" />
          <BlocoNumero rotulo="Exemplo" valor="45" detalhe="cor lago" cor="lake" />
          <BlocoNumero rotulo="Exemplo" valor="6" detalhe="cor ameixa" cor="plum" />
          <BlocoNumero rotulo="Exemplo" valor="7" detalhe="cor laranja" cor="laranja" />
        </div>
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <li><AtalhoModulo icone={Wallet} titulo="Com link" href="/identidade" /></li>
          <li><AtalhoModulo icone={UserCheck} titulo="Lago" href="/identidade" tom="lago" /></li>
          <li><AtalhoModulo icone={CalendarDays} titulo="Em breve" tom="vinho" /></li>
        </ul>
        <div>
          <SegmentoLinks
            rotulo="Exemplo de seletor"
            opcoes={[
              { rotulo: "Mês", href: "/identidade", ativo: true },
              { rotulo: "Ano", href: "/identidade?ano", ativo: false },
            ]}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Atalhos</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Atalho icone={Wallet} titulo="Financeiro" descricao="Atalho ativo (com link)" href="/identidade" />
          <Atalho icone={UserCheck} titulo="Visitantes" descricao="Atalho ainda não liberado" emBreve="Fase 3" tom="lake" />
        </div>
      </section>

      <VitrineInterativa />
    </main>
  );
}
