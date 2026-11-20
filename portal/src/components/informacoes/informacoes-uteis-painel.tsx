/**
 * Cartão "Informações úteis" do PAINEL do síndico e do conselho: o que a administração
 * consulta no dia a dia, num lugar só — aviso, endereço com CEP, PIX da taxa, ronda,
 * responsável pelas reservas, telefones da portaria e da administração e emergência.
 *
 * Recebe os dados já lidos no servidor (com a permissão conferida). Mostra só o que
 * está cadastrado; para quem pode editar, diz o que falta e leva para o cadastro.
 * Só aparecem botões que funcionam: sem número válido, sem botão.
 */
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck,
  Clock,
  DoorOpen,
  Landmark,
  MessageCircle,
  Pencil,
  Phone,
  ShieldCheck,
  Siren,
  UserRound,
} from "lucide-react";
import type { InformacoesDoCondominio } from "@/server/dados/informacoes";
import { EMERGENCIAS } from "@/lib/condominio";
import {
  chavePixParaCopiar,
  ehCelular,
  formatarChavePix,
  formatarTelefone,
  linkConversaWhatsApp,
  linkLigar,
  TIPOS_CHAVE_PIX,
} from "@/lib/validacao-informacoes";
import { Alerta, Cartao } from "@/components/ui/basicos";
import { classesDoBotao } from "@/components/ui/botao";
import { EnderecoCopiavel } from "@/components/ui/endereco";
import { TituloSecao } from "@/components/ui/painel";
import { ChavePixCopiavel } from "./chave-pix-copiavel";

type Contato = {
  chave: string;
  icone: LucideIcon;
  titulo: string;
  /** Nome da pessoa (ex.: responsável pelas reservas). */
  nome?: string | null;
  telefone: string | null;
  /** Número de WhatsApp, quando é diferente do telefone (ex.: administração). */
  whatsapp?: string | null;
  detalhe?: string | null;
};

/** Monta a lista de contatos a partir do cadastro (sem inventar números). */
function contatosDoCadastro(info: InformacoesDoCondominio): Contato[] {
  const lista: Contato[] = [];
  if (info.telefoneRonda) lista.push({ chave: "ronda", icone: ShieldCheck, titulo: "Ronda noturna", telefone: info.telefoneRonda });
  if (info.responsavelReservas) {
    lista.push({
      chave: "reservas",
      icone: CalendarCheck,
      titulo: "Responsável pelas reservas",
      nome: info.responsavelReservas.nome,
      telefone: info.responsavelReservas.telefone,
      detalhe: info.responsavelReservas.horario,
    });
  }
  if (info.telefonePortaria) lista.push({ chave: "portaria", icone: DoorOpen, titulo: "Portaria", telefone: info.telefonePortaria });
  if (info.telefoneAdministracao || info.whatsappAdministracao) {
    lista.push({
      chave: "administracao",
      icone: UserRound,
      titulo: "Administração / Síndico",
      telefone: info.telefoneAdministracao,
      whatsapp: info.whatsappAdministracao,
      detalhe: info.horarioAdministracao,
    });
  }
  return lista;
}

/** O que ainda não foi cadastrado (só aparece para quem pode editar). */
function faltando(info: InformacoesDoCondominio): string[] {
  const lista: string[] = [];
  if (!info.pix) lista.push("PIX da taxa");
  if (!info.telefoneRonda) lista.push("ronda noturna");
  if (!info.responsavelReservas) lista.push("responsável pelas reservas");
  if (!info.telefonePortaria) lista.push("telefone da portaria");
  if (!info.telefoneAdministracao && !info.whatsappAdministracao) lista.push("telefone da administração");
  return lista;
}

function juntar(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
}

/** Uma linha de contato: ícone, nome, número e os botões Ligar / WhatsApp. */
function LinhaContato({ c }: { c: Contato }) {
  const zap = c.whatsapp && ehCelular(c.whatsapp) ? c.whatsapp : c.telefone && ehCelular(c.telefone) ? c.telefone : null;
  const quem = c.nome ? `${c.nome}, ${c.titulo.toLowerCase()}` : c.titulo;
  return (
    <li className="afundado flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-3.5 py-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ok-soft text-pine">
        <c.icone aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1 basis-40">
        <span className="rotulo-caixa block">{c.titulo}</span>
        {/* Nome e número em linhas próprias: o número nunca é cortado. */}
        {c.nome ? <p className="break-words font-bold text-ink">{c.nome}</p> : null}
        <p className={c.nome ? "whitespace-nowrap tabular-nums text-ink-2" : "whitespace-nowrap font-bold tabular-nums text-ink"}>
          {formatarTelefone(c.telefone ?? c.whatsapp ?? "")}
        </p>
        {c.detalhe ? (
          <p className="mt-0.5 flex items-start gap-1.5 text-[0.84rem] text-muted">
            <Clock aria-hidden className="mt-0.5 size-3.5 shrink-0" /> {c.detalhe}
          </p>
        ) : null}
      </div>
      {/* Celular: botões ocupam a linha toda; lado a lado quando cabem, um embaixo do outro quando não
          (nunca saem da caixa, nem com Letra grande). Telas maiores: ao lado do número, descendo se faltar espaço. */}
      <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-2 sm:flex sm:w-auto sm:flex-wrap">
        {c.telefone ? (
          <a href={linkLigar(c.telefone)} aria-label={`Ligar para ${quem}`} className={classesDoBotao("primario")}>
            <Phone aria-hidden className="size-5 shrink-0" /> Ligar
          </a>
        ) : null}
        {zap ? (
          <a
            href={linkConversaWhatsApp(zap)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp de ${quem} (abre em outra aba)`}
            className={classesDoBotao("secundario")}
          >
            <MessageCircle aria-hidden className="size-5 shrink-0" /> WhatsApp
          </a>
        ) : null}
      </div>
    </li>
  );
}

export function InformacoesUteisPainel({ info, podeEditar }: { info: InformacoesDoCondominio; podeEditar: boolean }) {
  const contatos = contatosDoCadastro(info);
  const falta = podeEditar ? faltando(info) : [];

  return (
    <section aria-labelledby="titulo-informacoes-uteis" className="flex flex-col gap-3">
      <TituloSecao
        id="titulo-informacoes-uteis"
        extra={
          podeEditar ? (
            <Link href="/admin/informacoes" className="inline-flex min-h-11 items-center gap-1.5 font-bold text-lake underline-offset-2 hover:underline">
              <Pencil aria-hidden className="size-4" /> Editar
            </Link>
          ) : null
        }
      >
        Informações úteis
      </TituloSecao>
    {/* semEspaco: o Cartao não põe o p-5 dele, então o p-4 do celular vale de verdade. */}
    <Cartao semEspaco className="flex flex-col gap-4 p-4 sm:p-5">
      {info.aviso ? (
        <Alerta tipo="info" titulo="Aviso para os moradores">
          {info.aviso}
        </Alerta>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Endereço do condomínio" className="flex flex-col gap-2">
          <EnderecoCopiavel />
        </section>

        {info.pix ? (
          <section aria-labelledby="titulo-pix-painel" className="flex flex-col gap-2">
            <h3 id="titulo-pix-painel" className="sr-only">
              PIX da taxa condominial
            </h3>
            <ChavePixCopiavel
              rotulo={`PIX da taxa (${TIPOS_CHAVE_PIX[info.pix.tipo]})`}
              exibicao={formatarChavePix(info.pix)}
              paraCopiar={chavePixParaCopiar(info.pix)}
            />
            <p className="flex items-center gap-1.5 px-1 text-[0.88rem] text-ink-2">
              <Landmark aria-hidden className="size-4 shrink-0 text-pine" /> Favorecido: <b className="text-ink">{info.pix.favorecido}</b>
            </p>
          </section>
        ) : null}
      </div>

      {contatos.length ? (
        <section aria-labelledby="titulo-contatos-painel" className="flex flex-col gap-2">
          <h3 id="titulo-contatos-painel" className="rotulo-caixa">
            Telefones
          </h3>
          <ul className="grid gap-2.5 lg:grid-cols-2">
            {contatos.map((c) => (
              <LinhaContato key={c.chave} c={c} />
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="titulo-emergencia-painel" className="flex flex-col gap-2">
        <h3 id="titulo-emergencia-painel" className="rotulo-caixa flex items-center gap-1.5">
          <Siren aria-hidden className="size-4 text-plum" /> Emergência
        </h3>
        <ul className="grid grid-cols-3 gap-2">
          {EMERGENCIAS.map((e) => (
            <li key={e.numero}>
              <a
                href={`tel:${e.numero}`}
                aria-label={`Ligar para ${e.nome}, ${e.numero}`}
                className="saltado flex min-h-14 flex-col items-center justify-center rounded-2xl px-1 py-2 text-center active:shadow-afundado"
              >
                <b className="font-display text-[1.25rem] font-extrabold leading-none text-plum">{e.numero}</b>
                <span className="mt-0.5 text-[0.8rem] font-bold leading-tight text-ink">{e.nome}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {falta.length ? (
        <p className="text-[0.9rem] text-muted">
          Ainda não cadastrado: {juntar(falta)}.{" "}
          <Link href="/admin/informacoes" className="font-bold text-lake underline-offset-2 hover:underline">
            Cadastrar agora
          </Link>
        </p>
      ) : null}
    </Cartao>
    </section>
  );
}
