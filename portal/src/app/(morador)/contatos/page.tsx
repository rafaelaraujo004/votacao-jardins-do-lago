import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import { Ambulance, Clock, DoorOpen, Flame, MessageCircle, Phone, Shield, UserRound } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { informacoesDoCondominio, type InformacoesDoCondominio } from "@/server/dados/informacoes";
import { EMERGENCIAS } from "@/lib/condominio";
import { Alerta, Cartao, EstadoVazio } from "@/components/ui/basicos";
import { CabecalhoPagina, TituloSecao } from "@/components/ui/painel";
import { EnderecoCopiavel } from "@/components/ui/endereco";
import { AtalhoVotacao, CartaoPix, CartaoResponsavelReservas, CartaoRonda } from "@/components/informacoes/cartoes";
import { ehCelular, formatarTelefone, linkConversaWhatsApp, linkLigar } from "@/lib/validacao-informacoes";

export const metadata: Metadata = { title: "Contatos úteis" };

// Ícone e cor de cada número de emergência.
const ICONE_EMERGENCIA: Record<string, { icone: LucideIcon; cor: string }> = {
  "190": { icone: Shield, cor: "text-lake" },
  "192": { icone: Ambulance, cor: "text-plum" },
  "193": { icone: Flame, cor: "text-texto-laranja" },
};

type Contato = { nome: string; detalhe: string | null; telefone: string | null; whatsapp: string | null; icone: LucideIcon };

/** Monta os cartões a partir do cadastro da administração (sem inventar números). */
function contatosDoCadastro(info: InformacoesDoCondominio): Contato[] {
  const lista: Contato[] = [];
  if (info.telefonePortaria) {
    lista.push({ nome: "Portaria", detalhe: null, telefone: info.telefonePortaria, whatsapp: null, icone: DoorOpen });
  }
  if (info.telefoneAdministracao || info.whatsappAdministracao) {
    lista.push({
      nome: "Administração / Síndico",
      detalhe: info.horarioAdministracao,
      telefone: info.telefoneAdministracao,
      whatsapp: info.whatsappAdministracao,
      icone: UserRound,
    });
  }
  return lista;
}

const classeBotaoVerde =
  "botao-verde inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-2 font-bold active:shadow-afundado";
const classeBotaoSaltado =
  "saltado inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-2 font-bold text-pine active:shadow-afundado";

/**
 * Contatos (com login): endereço, emergência, ronda noturna, telefones do condomínio,
 * responsável pelas reservas, PIX da taxa e votação oficial (tudo do cadastro da administração).
 */
export default async function ContatosMorador() {
  const ctx = await exigirPermissao("informacoes.ver", "/contatos");

  let info: InformacoesDoCondominio | null = null;
  try {
    info = await informacoesDoCondominio(ctx);
  } catch (erro) {
    // Se o cadastro falhar, a página continua com endereço e emergência.
    console.error("Contatos: não foi possível carregar as informações", erro);
  }
  const contatos = info ? contatosDoCadastro(info) : [];

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina sobretitulo="Contatos" titulo="Contatos úteis" subtitulo="Um toque para ligar." />

      {info?.aviso ? (
        <Alerta tipo="info" titulo="Aviso da administração">
          {info.aviso}
        </Alerta>
      ) : null}

      <Cartao aria-labelledby="titulo-endereco" className="flex flex-col gap-3">
        <h2 id="titulo-endereco" className="text-[1.1rem] font-bold text-destaque">
          Endereço para entregas
        </h2>
        <EnderecoCopiavel />
      </Cartao>

      <section aria-labelledby="titulo-emergencia" className="flex flex-col gap-3">
        <TituloSecao id="titulo-emergencia">Emergência</TituloSecao>
        <ul className="grid grid-cols-3 gap-2.5">
          {EMERGENCIAS.map((e) => {
            const { icone: Icone, cor } = ICONE_EMERGENCIA[e.numero] ?? { icone: Phone, cor: "text-plum" };
            return (
              <li key={e.numero}>
                <a
                  href={`tel:${e.numero}`}
                  aria-label={`Ligar para ${e.nome}, ${e.numero}`}
                  className="saltado flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] px-1.5 py-3 text-center active:shadow-afundado"
                >
                  <Icone aria-hidden className={`size-6 ${cor}`} />
                  <b className="font-display text-[1.85rem] font-extrabold leading-none text-plum">{e.numero}</b>
                  <span className="text-[0.86rem] font-bold leading-tight text-ink">{e.nome}</span>
                  <small className="text-[0.76rem] text-muted">Ligar</small>
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      {info?.telefoneRonda ? <CartaoRonda telefone={info.telefoneRonda} /> : null}

      <section aria-labelledby="titulo-condominio" className="flex flex-col gap-3">
        <TituloSecao id="titulo-condominio">Condomínio</TituloSecao>
        {contatos.length ? (
          <ul className="flex flex-col gap-3">
            {contatos.map((ct) => {
              // Telefones já vêm normalizados (só números, com DDD) do servidor.
              const tel = ct.telefone;
              const zap = ct.whatsapp && ehCelular(ct.whatsapp) ? ct.whatsapp : null;
              return (
                <li key={ct.nome}>
                  <Cartao className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ok-soft text-pine">
                        <ct.icone aria-hidden className="size-6" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[1.1rem] font-bold text-destaque">{ct.nome}</h3>
                        {ct.telefone ? <p className="text-[0.95rem] tabular-nums text-ink-2">{formatarTelefone(ct.telefone)}</p> : null}
                        {ct.detalhe ? (
                          <p className="mt-0.5 inline-flex items-center gap-1.5 text-[0.88rem] text-muted">
                            <Clock aria-hidden className="size-4 shrink-0" /> {ct.detalhe}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {/* Só aparecem botões com número válido (nada de botão que não faz nada). */}
                    {tel || zap ? (
                      <div className={tel && zap ? "grid grid-cols-2 gap-2.5" : "grid"}>
                        {tel ? (
                          <a href={linkLigar(tel)} aria-label={`Ligar para ${ct.nome}`} className={classeBotaoVerde}>
                            <Phone aria-hidden className="size-5" /> Ligar
                          </a>
                        ) : null}
                        {zap ? (
                          <a
                            href={linkConversaWhatsApp(zap)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`WhatsApp de ${ct.nome} (abre em outra aba)`}
                            className={classeBotaoSaltado}
                          >
                            <MessageCircle aria-hidden className="size-5" /> WhatsApp
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </Cartao>
                </li>
              );
            })}
          </ul>
        ) : (
          <EstadoVazio icone={Phone} titulo="Telefones ainda não cadastrados">
            A administração ainda não cadastrou os telefones. Em emergência, use os números acima.
          </EstadoVazio>
        )}
      </section>

      {info?.responsavelReservas ? (
        <section aria-labelledby="titulo-reservas" className="flex flex-col gap-3">
          <TituloSecao id="titulo-reservas">Reservas das áreas</TituloSecao>
          <CartaoResponsavelReservas responsavel={info.responsavelReservas} />
        </section>
      ) : null}

      {info?.pix ? (
        <section aria-labelledby="titulo-pix" className="flex flex-col gap-3">
          <TituloSecao id="titulo-pix">Pagamento da taxa</TituloSecao>
          <CartaoPix pix={info.pix} />
        </section>
      ) : null}

      {info?.linkVotacao ? <AtalhoVotacao link={info.linkVotacao} /> : null}
    </div>
  );
}
