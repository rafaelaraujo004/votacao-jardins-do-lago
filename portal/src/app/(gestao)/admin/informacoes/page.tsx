import type { Metadata } from "next";
import { headers } from "next/headers";
import { KeyRound, Phone } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { informacoesParaEdicao } from "@/server/dados/informacoes";
import { idCondominioPadrao, linkAcessoMoradores } from "@/lib/condominio-id";
import { salvarInformacoes } from "@/server/acoes/informacoes";
import { linkWhatsApp } from "@/lib/portaria";
import {
  formatarTelefone,
  LIMITE_AVISO,
  LIMITE_HORARIO,
  mensagemConviteMoradores,
} from "@/lib/validacao-informacoes";
import { Campo, Cartao, classeEntrada, TituloPagina } from "@/components/ui/basicos";
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

  // Link da tela de entrada (com ?c= só quando não é o condomínio padrão).
  const link = linkAcessoMoradores(base, ctx.condominioId, idCondominioPadrao());
  const convite = linkWhatsApp(mensagemConviteMoradores(ctx.condominioNome, link));
  // Telefones já gravados aparecem formatados no campo.
  const tel = (d: string | null) => (d ? formatarTelefone(d) : "");

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Configurações"
        titulo="Informações do condomínio"
        descricao="Telefones, horário e aviso que os moradores veem no portal depois de entrar."
      />

      <Cartao aria-labelledby="titulo-link" className="flex flex-col gap-3">
        <h2 id="titulo-link" className="flex items-center gap-2 text-[1.1rem] font-bold text-destaque">
          <KeyRound aria-hidden className="size-5" /> Link de acesso dos moradores
        </h2>
        <p className="text-ink-2">
          Mande este link no grupo dos moradores. Nada do portal abre sem login: cada morador entra com o usuário e a
          senha que você cria em “Moradores e equipe”. Quem não tiver usuário não vê nenhuma informação.
        </p>
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

          <div>
            <BotaoEnviar>Salvar informações</BotaoEnviar>
          </div>
        </Formulario>
      </Cartao>
    </div>
  );
}
