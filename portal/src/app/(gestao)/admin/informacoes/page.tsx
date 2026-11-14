import type { Metadata } from "next";
import { headers } from "next/headers";
import { CircleCheck, CirclePause, Globe, Phone } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { informacoesParaEdicao } from "@/server/dados/informacoes";
import { idPublicoPadrao } from "@/server/publico";
import { salvarInformacoes } from "@/server/acoes/informacoes";
import { linkWhatsApp } from "@/lib/portaria";
import {
  formatarTelefone,
  LIMITE_AVISO,
  LIMITE_HORARIO,
  linkPublicoMoradores,
  mensagemConviteMoradores,
} from "@/lib/validacao-informacoes";
import { Alerta, Campo, Cartao, classeEntrada, Etiqueta, TituloPagina } from "@/components/ui/basicos";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { LinkMoradores } from "./link-moradores";

export const metadata: Metadata = { title: "Informações do condomínio" };

// Endereço usado se o pedido vier sem um "host" confiável.
const ENDERECO_RESERVA = "https://portal-jardins-do-lago.vercel.app";

/** Endereço base do portal a partir do próprio pedido (ex.: https://portal.exemplo.com). */
async function enderecoBase(): Promise<string> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  if (!/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)) return ENDERECO_RESERVA;
  const protoBruto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  const proto = protoBruto === "http" || protoBruto === "https" ? protoBruto : host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

export default async function PaginaInformacoes() {
  const ctx = await exigirPermissao("informacoes.gerenciar");
  const [info, base] = await Promise.all([informacoesParaEdicao(ctx), enderecoBase()]);

  // Mesmo padrão do link público (variável CONDOMINIO_PUBLICO, conferida em server/publico.ts).
  const padrao = idPublicoPadrao();
  const link = linkPublicoMoradores(base, ctx.condominioId, padrao);
  const convite = linkWhatsApp(mensagemConviteMoradores(ctx.condominioNome, link));
  // Telefones já gravados aparecem formatados no campo.
  const tel = (d: string | null) => (d ? formatarTelefone(d) : "");

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Configurações"
        titulo="Informações do condomínio"
        descricao="Telefones, horário e aviso que os moradores veem no portal, sem precisar de senha."
      />

      <Cartao aria-labelledby="titulo-link" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="titulo-link" className="flex items-center gap-2 text-[1.1rem] font-bold text-destaque">
            <Globe aria-hidden className="size-5" /> Portal dos moradores
          </h2>
          {info.portalPublico ? (
            <Etiqueta tom="ok" icone={CircleCheck}>Ligado</Etiqueta>
          ) : (
            <Etiqueta tom="neutro" icone={CirclePause}>Desligado</Etiqueta>
          )}
        </div>
        {info.portalPublico ? (
          <p className="text-ink-2">
            Mande este link no grupo dos moradores. Quem abrir vê as informações gerais do condomínio; nomes e números
            de casas nunca aparecem.
          </p>
        ) : (
          <Alerta tipo="aviso" titulo="O portal dos moradores está desligado">
            Quem abrir o link verá que o portal não está disponível. Marque “Portal dos moradores ligado” abaixo e salve.
          </Alerta>
        )}
        <LinkMoradores link={link} linkWhatsApp={convite} />
      </Cartao>

      <Cartao aria-labelledby="titulo-form">
        <h2 id="titulo-form" className="mb-4 flex items-center gap-2 text-[1.1rem] font-bold text-destaque">
          <Phone aria-hidden className="size-5" /> Contatos e aviso
        </h2>
        <Formulario acao={salvarInformacoes} limparAoSalvar={false}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="telefonePortaria" rotulo="Telefone da portaria" dica="Com DDD. Deixe em branco para não mostrar.">
              <input
                id="telefonePortaria"
                name="telefonePortaria"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                maxLength={30}
                defaultValue={tel(info.telefonePortaria)}
                placeholder="(94) 9 9123-4567"
                aria-describedby="telefonePortaria-dica"
                className={classeEntrada}
              />
            </Campo>
            <Campo id="telefoneAdministracao" rotulo="Telefone da administração" dica="Com DDD. Deixe em branco para não mostrar.">
              <input
                id="telefoneAdministracao"
                name="telefoneAdministracao"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                maxLength={30}
                defaultValue={tel(info.telefoneAdministracao)}
                placeholder="(94) 3322-1100"
                aria-describedby="telefoneAdministracao-dica"
                className={classeEntrada}
              />
            </Campo>
            <Campo id="whatsappAdministracao" rotulo="WhatsApp da administração" dica="Número de celular com DDD.">
              <input
                id="whatsappAdministracao"
                name="whatsappAdministracao"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                maxLength={30}
                defaultValue={tel(info.whatsappAdministracao)}
                placeholder="(94) 9 9123-4567"
                aria-describedby="whatsappAdministracao-dica"
                className={classeEntrada}
              />
            </Campo>
            <Campo id="horarioAdministracao" rotulo="Horário de atendimento" dica="Texto curto. Ex.: Seg. a sex., 8h às 18h.">
              <input
                id="horarioAdministracao"
                name="horarioAdministracao"
                maxLength={LIMITE_HORARIO}
                defaultValue={info.horarioAdministracao ?? ""}
                placeholder="Seg. a sex., 8h às 18h"
                aria-describedby="horarioAdministracao-dica"
                className={classeEntrada}
              />
            </Campo>
          </div>

          <Campo
            id="aviso"
            rotulo="Aviso no Início (opcional)"
            dica={`Aparece no topo da página dos moradores. Até ${LIMITE_AVISO} caracteres. Não escreva nomes nem números de casas.`}
          >
            <textarea
              id="aviso"
              name="aviso"
              rows={3}
              maxLength={LIMITE_AVISO}
              defaultValue={info.aviso ?? ""}
              placeholder="Ex.: Manutenção da piscina na terça-feira, das 8h às 12h."
              aria-describedby="aviso-dica"
              className={`${classeEntrada} py-3`}
            />
          </Campo>

          <label
            htmlFor="portalPublico"
            className="saltado flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-4 py-3"
          >
            <input
              id="portalPublico"
              name="portalPublico"
              type="checkbox"
              defaultChecked={info.portalPublico}
              className="size-6 shrink-0 accent-pine"
            />
            <span className="flex flex-col">
              <span className="font-bold">Portal dos moradores ligado</span>
              <span className="text-[0.92rem] text-muted">Desmarque para tirar o link público do ar na hora.</span>
            </span>
          </label>

          <div>
            <BotaoEnviar>Salvar informações</BotaoEnviar>
          </div>
        </Formulario>
      </Cartao>
    </div>
  );
}
