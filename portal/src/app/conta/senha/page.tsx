import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, KeyRound } from "lucide-react";
import { getContexto } from "@/server/contexto";
import { minhaSituacaoDeAcesso } from "@/server/dados/acesso";
import { inicioDoPapel, NOME_DO_PAPEL } from "@/lib/permissoes";
import { Alerta, Cartao, EstadoVazio, TituloPagina } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { FaixaTopo } from "@/components/layout/faixa-topo";
import { destinoSeguro } from "@/lib/destino-seguro";
import { ehEmailDeMorador, usuarioParaLeitura } from "@/lib/usuario-morador";
import { comC, idPublicoPadrao, sufixoDoId } from "@/server/publico";
import { TrocarSenha } from "./trocar-senha";

export const metadata: Metadata = { title: "Trocar senha" };

/**
 * Tela "Trocar senha".
 * Fica FORA das áreas de gestão/portaria de propósito: quando a pessoa está com
 * a senha provisória, essas áreas mandam para cá, e esta tela não pode mandar
 * de volta (senão ficaria indo e voltando).
 */
export default async function PaginaTrocarSenha({ searchParams }: PageProps<"/conta/senha">) {
  // Usa getContexto (e não exigirPermissao) para não cair no desvio da senha provisória.
  const ctx = await getContexto();
  if (!ctx) redirect("/entrar");
  const situacao = await minhaSituacaoDeAcesso(ctx);
  // Morador volta ao Início DO SEU condomínio (com o ?c= quando não é o padrão).
  const sufixo = sufixoDoId(ctx.condominioId, idPublicoPadrao());
  const inicio = ctx.papel === "morador" ? comC("/inicio", sufixo) : inicioDoPapel(ctx.papel);
  const { volta: bruta } = await searchParams;
  const volta = destinoSeguro(Array.isArray(bruta) ? bruta[0] : bruta);

  // Morador entra com USUÁRIO (o e-mail por trás é sintético e não aparece na tela).
  const ehMorador = ehEmailDeMorador(situacao.email);
  const usuario = ehMorador && situacao.email ? situacao.email.split("@")[0].toUpperCase() : null;
  const rotuloConta = usuario ? `Usuário: ${usuarioParaLeitura(usuario)}` : `Conta: ${situacao.email ?? ""}`;
  const subtitulo = ctx.papel === "morador" ? `${ctx.nome} · ${ctx.unidadeRotulo ?? "Morador"}` : `${ctx.nome} · ${NOME_DO_PAPEL[ctx.papel]}`;

  return (
    <div className="min-h-dvh pb-10">
      <FaixaTopo titulo="Minha conta" subtitulo={subtitulo} demo={ctx.demo} largura="max-w-xl" />
      <main id="conteudo" className="relative mx-auto -mt-12 flex max-w-xl flex-col gap-5 px-3 sm:px-4">
        <Cartao className="flex flex-col gap-5">
          {situacao.precisaTrocarSenha ? null : (
            <Link href={inicio} className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
              <ArrowLeft aria-hidden className="size-4" /> Voltar ao início
            </Link>
          )}
          <TituloPagina sobretitulo="Segurança" titulo="Trocar senha" />

          {!situacao.temSenha || !situacao.email ? (
            <EstadoVazio
              icone={KeyRound}
              titulo="Sua conta não entra com senha"
              acao={<BotaoLink href={inicio}>Voltar ao início</BotaoLink>}
            >
              Esta conta ainda não tem senha. Peça à administração do condomínio para criar o seu acesso.
            </EstadoVazio>
          ) : (
            <>
              {situacao.precisaTrocarSenha ? (
                <Alerta tipo="aviso" titulo={ehMorador ? "Bem-vindo! Escolha a sua senha" : "Crie a sua senha antes de continuar"}>
                  {ehMorador
                    ? "Você entrou com a senha provisória enviada pela administração. Agora escolha uma senha só sua: é com ela que você vai entrar daqui em diante. O seu usuário continua o mesmo."
                    : "Você entrou com uma senha provisória. Para sua segurança, escolha agora uma senha só sua."}
                </Alerta>
              ) : null}
              <TrocarSenha
                email={situacao.email}
                uid={ctx.uid}
                rotuloConta={rotuloConta}
                provisoria={situacao.precisaTrocarSenha}
                volta={volta}
                inicio={inicio}
                entrarHref={comC("/entrar", sufixo)}
              />
            </>
          )}
        </Cartao>
      </main>
    </div>
  );
}
