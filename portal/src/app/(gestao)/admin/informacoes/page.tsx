import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, KeyRound, Landmark, Phone, ShieldCheck, Vote } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { enderecoBase } from "@/server/endereco";
import { informacoesParaEdicao } from "@/server/dados/informacoes";
import { idCondominioPadrao, linkAcessoMoradores } from "@/lib/condominio-id";
import { salvarInformacoes, salvarLinkVotacao, salvarPix, salvarPlantao } from "@/server/acoes/informacoes";
import { linkWhatsApp } from "@/lib/portaria";
import {
  CHAVES_TIPO_PIX,
  formatarChavePix,
  formatarTelefone,
  LIMITE_AVISO,
  LIMITE_FAVORECIDO,
  LIMITE_HORARIO,
  LIMITE_LINK,
  LIMITE_NOME_RESPONSAVEL,
  mensagemConviteMoradores,
  TIPOS_CHAVE_PIX,
} from "@/lib/validacao-informacoes";
import { Alerta, Campo, Cartao, classeEntrada, TituloPagina } from "@/components/ui/basicos";
import { AtalhoVotacao, CartaoPix } from "@/components/informacoes/cartoes";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { LinkCopiavel } from "@/components/acesso/link-copiavel";

export const metadata: Metadata = { title: "Informações do condomínio" };

export default async function PaginaInformacoes() {
  const ctx = await exigirPermissao("informacoes.gerenciar");
  const [info, base] = await Promise.all([informacoesParaEdicao(ctx), enderecoBase()]);

  // Link da tela de entrada (com ?c= só quando não é o condomínio padrão).
  const link = linkAcessoMoradores(base, ctx.condominioId, idCondominioPadrao());
  const convite = linkWhatsApp(mensagemConviteMoradores(ctx.condominioNome, link));
  // Telefones já gravados aparecem formatados no campo.
  const tel = (d: string | null) => (d ? formatarTelefone(d) : "");
  // A chave PIX só o síndico troca (proteção contra golpe).
  const podePix = ctx.papel === "admin";

  return (
    <div className="flex flex-col gap-6">
      <TituloPagina
        sobretitulo="Configurações"
        titulo="Informações do condomínio"
        descricao="Telefones, aviso, PIX da taxa, ronda, responsável pelas reservas e link da votação. Os moradores veem tudo isso no portal depois de entrar."
      />

      <Cartao aria-labelledby="titulo-link" className="flex flex-col gap-3">
        <h2 id="titulo-link" className="flex items-center gap-2 text-[1.1rem] font-bold text-destaque">
          <KeyRound aria-hidden className="size-5" /> Link de acesso dos moradores
        </h2>
        <p className="text-ink-2">
          Mande este link no grupo dos moradores. Nada do portal abre sem login: cada morador entra com o usuário e a
          senha que você cria em “Moradores e equipe”. Quem não tiver usuário não vê nenhuma informação.
        </p>
        <LinkCopiavel rotulo="Link de acesso dos moradores" link={link} linkWhatsApp={convite} />
        <p className="text-[0.92rem] text-ink-2">
          Quer mandar o link de uma parte só (reservas, portaria, painel do síndico...)? Veja{" "}
          <Link href="/admin/links" className="font-bold text-lake underline underline-offset-2">
            Links de acesso
          </Link>
          .
        </p>
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

      <Cartao aria-labelledby="titulo-pix" className="flex flex-col gap-4">
        <h2 id="titulo-pix" className="flex items-center gap-2 text-[1.1rem] font-bold text-destaque">
          <Landmark aria-hidden className="size-5" /> PIX da taxa condominial
        </h2>
        {podePix ? (
          <Formulario acao={salvarPix} limparAoSalvar={false}>
            <p className="text-ink-2">
              Os moradores veem a chave formatada e um botão “Copiar chave PIX”. Para CNPJ e CPF, o botão copia só os
              números. Deixe tudo em branco para tirar o PIX do portal.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="pixTipo" rotulo="Tipo da chave">
                <select id="pixTipo" name="pixTipo" defaultValue={info.pix?.tipo ?? "cnpj"} className={classeEntrada}>
                  {CHAVES_TIPO_PIX.map((t) => (
                    <option key={t} value={t}>
                      {TIPOS_CHAVE_PIX[t]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo id="pixChave" rotulo="Chave PIX" dica="CNPJ com ou sem pontos. Conferimos os dígitos verificadores.">
                <input
                  id="pixChave"
                  name="pixChave"
                  autoComplete="off"
                  maxLength={120}
                  defaultValue={info.pix ? formatarChavePix(info.pix) : ""}
                  placeholder="29.711.278/0001-59"
                  aria-describedby="pixChave-dica"
                  className={classeEntrada}
                />
              </Campo>
            </div>
            <Campo
              id="pixFavorecido"
              rotulo="Favorecido"
              dica="O nome que aparece no banco na hora de pagar. O morador confere antes de confirmar."
            >
              <input
                id="pixFavorecido"
                name="pixFavorecido"
                autoComplete="off"
                maxLength={LIMITE_FAVORECIDO}
                defaultValue={info.pix?.favorecido ?? ""}
                placeholder="Residencial Jardins do Lago"
                aria-describedby="pixFavorecido-dica"
                className={classeEntrada}
              />
            </Campo>
            <div>
              <BotaoEnviar>Salvar PIX</BotaoEnviar>
            </div>
          </Formulario>
        ) : (
          <Alerta tipo="info" titulo="Só o síndico altera a chave PIX">
            Isso protege os moradores contra golpes. Abaixo está o que eles veem hoje.
          </Alerta>
        )}
        {info.pix ? (
          <div className="flex flex-col gap-2">
            <span className="rotulo-caixa">Como os moradores veem</span>
            <CartaoPix pix={info.pix} />
          </div>
        ) : !podePix ? (
          <p className="text-ink-2">Nenhuma chave PIX cadastrada.</p>
        ) : null}
      </Cartao>

      <Cartao aria-labelledby="titulo-plantao">
        <h2 id="titulo-plantao" className="mb-4 flex items-center gap-2 text-[1.1rem] font-bold text-destaque">
          <ShieldCheck aria-hidden className="size-5" /> Ronda noturna e reservas
        </h2>
        <Formulario acao={salvarPlantao} limparAoSalvar={false}>
          <Campo
            id="telefoneRonda"
            rotulo="Telefone da ronda noturna"
            dica="Com DDD. Se for celular, aparece também o botão de WhatsApp. Deixe em branco para não mostrar."
          >
            <input
              id="telefoneRonda"
              name="telefoneRonda"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              maxLength={30}
              defaultValue={tel(info.telefoneRonda)}
              placeholder="(94) 9 9123-4567"
              aria-describedby="telefoneRonda-dica"
              className={classeEntrada}
            />
          </Campo>

          <h3 className="mt-2 flex items-center gap-2 font-bold text-destaque">
            <CalendarCheck aria-hidden className="size-5" /> Responsável pelas reservas
          </h3>
          <p className="-mt-2 text-[0.92rem] text-muted">
            Nome e telefone aparecem para todos os moradores. Deixe os três campos em branco para não mostrar.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="responsavelNome" rotulo="Nome">
              <input
                id="responsavelNome"
                name="responsavelNome"
                autoComplete="off"
                maxLength={LIMITE_NOME_RESPONSAVEL}
                defaultValue={info.responsavelReservas?.nome ?? ""}
                placeholder="Ex.: Maria"
                className={classeEntrada}
              />
            </Campo>
            <Campo id="responsavelTelefone" rotulo="Telefone" dica="Com DDD.">
              <input
                id="responsavelTelefone"
                name="responsavelTelefone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                maxLength={30}
                defaultValue={tel(info.responsavelReservas?.telefone ?? null)}
                placeholder="(94) 9 9123-4567"
                aria-describedby="responsavelTelefone-dica"
                className={classeEntrada}
              />
            </Campo>
          </div>
          <Campo id="responsavelHorario" rotulo="Horário de atendimento (opcional)" dica="Texto curto. Ex.: Seg. a sáb., 8h às 18h.">
            <input
              id="responsavelHorario"
              name="responsavelHorario"
              maxLength={LIMITE_HORARIO}
              defaultValue={info.responsavelReservas?.horario ?? ""}
              placeholder="Seg. a sáb., 8h às 18h"
              aria-describedby="responsavelHorario-dica"
              className={classeEntrada}
            />
          </Campo>
          <div>
            <BotaoEnviar>Salvar ronda e reservas</BotaoEnviar>
          </div>
        </Formulario>
      </Cartao>

      <Cartao aria-labelledby="titulo-votacao" className="flex flex-col gap-4">
        <h2 id="titulo-votacao" className="flex items-center gap-2 text-[1.1rem] font-bold text-destaque">
          <Vote aria-hidden className="size-5" /> Votação oficial
        </h2>
        <Formulario acao={salvarLinkVotacao} limparAoSalvar={false}>
          <Campo
            id="linkVotacao"
            rotulo="Link da votação"
            dica="Só links seguros (começando com https://). Os moradores veem o botão “Votação oficial”, que abre em nova aba. Deixe em branco para tirar."
          >
            <input
              id="linkVotacao"
              name="linkVotacao"
              inputMode="url"
              autoComplete="off"
              maxLength={LIMITE_LINK}
              defaultValue={info.linkVotacao ?? ""}
              placeholder="https://"
              aria-describedby="linkVotacao-dica"
              className={classeEntrada}
            />
          </Campo>
          <div>
            <BotaoEnviar>Salvar link</BotaoEnviar>
          </div>
        </Formulario>
        {info.linkVotacao ? (
          <div className="flex flex-col gap-2">
            <span className="rotulo-caixa">Como os moradores veem</span>
            <AtalhoVotacao link={info.linkVotacao} />
          </div>
        ) : null}
      </Cartao>
    </div>
  );
}
