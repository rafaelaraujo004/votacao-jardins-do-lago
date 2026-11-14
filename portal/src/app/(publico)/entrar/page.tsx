import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getContexto } from "@/server/contexto";
import { demoAtivo } from "@/server/demo";
import { NOME_COOKIE_SESSAO } from "@/server/sessao";
import { inicioDoPapel, NOME_DO_PAPEL, PAPEIS } from "@/lib/permissoes";
import { destinoDepoisDoLogin, destinoSeguro } from "@/lib/destino-seguro";
import { linkConversaWhatsApp } from "@/lib/validacao-informacoes";
import { comC, condominioPublico, escolherIdPublico, idPublicoPadrao, sufixoDoId } from "@/server/publico";
import { informacoesPublicas } from "@/server/dados/informacoes";
import { USUARIOS_DEMO } from "@/lib/demo";
import { Alerta } from "@/components/ui/basicos";
import { Logo, Petalas } from "@/components/ui/marca";
import { BotaoTema } from "@/components/ui/tema";
import { BotaoSair, classeBotaoFaixa } from "@/components/layout/faixa-topo";
import { FaixaPetalas } from "@/components/ui/painel";
import { ENDERECO_LINHA } from "@/lib/condominio";
import { EntrarDemo } from "./entrar-demo";
import { EntrarSenha } from "./entrar-senha";

export const metadata: Metadata = { title: "Entrar" };

export default async function Entrar({ searchParams }: PageProps<"/entrar">) {
  const { saiu, volta: voltaBruta, c } = await searchParams;
  const volta = destinoSeguro(Array.isArray(voltaBruta) ? voltaBruta[0] : voltaBruta);

  // Já está logado: segue para onde ia (senha provisória → troca de senha).
  const ctx = await getContexto();
  if (ctx) {
    if (ctx.precisaTrocarSenha) redirect(volta ? `/conta/senha?volta=${encodeURIComponent(volta)}` : "/conta/senha");
    const destino = destinoDepoisDoLogin(inicioDoPapel(ctx.papel), volta);
    // Morador: Início do SEU condomínio (com ?c= quando não é o padrão).
    redirect(destino === "/inicio" ? comC("/inicio", sufixoDoId(ctx.condominioId, idPublicoPadrao())) : destino);
  }

  // Condomínio do login do morador: o do ?c= ou o padrão (CONDOMINIO_PUBLICO).
  const padrao = idPublicoPadrao();
  const condominioId = escolherIdPublico(c, padrao) ?? padrao;
  const inicioMorador = comC("/inicio", sufixoDoId(condominioId, padrao));
  // WhatsApp da administração (só se o condomínio estiver aberto ao público).
  const cp = await condominioPublico(condominioId === padrao ? undefined : condominioId);
  const zap = cp ? (await informacoesPublicas(cp.id).catch(() => null))?.whatsappAdministracao : null;

  const cookieSemVinculo = Boolean((await cookies()).get(NOME_COOKIE_SESSAO));
  const demo = demoAtivo();

  const perfis = PAPEIS.map((papel) => ({
    papel,
    titulo: NOME_DO_PAPEL[papel],
    nome: USUARIOS_DEMO[papel].nome,
    descricao: USUARIOS_DEMO[papel].descricao,
  }));

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Faixa verde profunda do topo, como no Modelo 3. */}
      <div className="relative overflow-hidden bg-band pb-28 pt-[env(safe-area-inset-top)] text-band-fg">
        <Petalas tamanho={260} className="absolute -right-16 -top-20 opacity-20" />
        <div className="relative mx-auto flex max-w-lg items-center gap-3 px-4 pt-3">
          <p className="min-w-0 flex-1 truncate text-[0.82rem] text-band-muted">{ENDERECO_LINHA}</p>
          <BotaoTema className={classeBotaoFaixa} />
        </div>
      </div>

      <main className="relative mx-auto -mt-24 w-full max-w-lg flex-1 px-3 pb-10">
        <div className="surgir overflow-hidden rounded-[26px] border border-borda-luz bg-surface shadow-float">
          <FaixaPetalas />
          <div className="flex flex-col gap-5 p-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <Logo largura={150} />
              <div className="flex flex-col gap-1.5">
                <h1 className="text-[1.9rem] font-bold text-destaque">Portal do condomínio</h1>
                <p className="text-[1.05rem] text-ink-2">
                  Visitas, encomendas e reservas da sua casa num só lugar.
                </p>
              </div>
            </div>

            {saiu ? (
              <Alerta tipo="sucesso" titulo="Você saiu do portal.">
                Para voltar, é só entrar de novo.
              </Alerta>
            ) : null}

            {cookieSemVinculo && !saiu ? (
              <Alerta tipo="aviso" titulo="Não encontramos um acesso ativo para esta conta.">
                <p>Ela pode ter sido suspensa ou ainda não estar ligada a uma casa. Fale com a administração do condomínio.</p>
                <BotaoSair className="-ml-3 mt-1 text-ink-2 hover:bg-surface-2" />
              </Alerta>
            ) : null}

            {volta && !saiu ? (
              <Alerta tipo="info" titulo="Entre para continuar">
                Esta parte do portal é da sua casa. Depois de entrar, você volta para onde estava.
              </Alerta>
            ) : null}

            {/* Morador (usuário + senha) e equipe (e-mail + senha), pelo Firebase Authentication. */}
            <EntrarSenha
              condominioId={condominioId}
              volta={volta}
              inicioMorador={inicioMorador}
              whatsappAdministracao={zap ? linkConversaWhatsApp(zap) : null}
            />

            <Link href={inicioMorador} className="mx-auto flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
              <ArrowLeft aria-hidden className="size-4" /> Ver as informações do condomínio sem entrar
            </Link>

            {/* Atalhos fictícios: só no computador local, com o simulador. */}
            {demo ? (
              <>
                <hr className="border-line" />
                <EntrarDemo perfis={perfis} />
              </>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
