import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getContexto } from "@/server/contexto";
import { demoAtivo } from "@/server/demo";
import { NOME_COOKIE_SESSAO } from "@/server/sessao";
import { inicioDoPapel, NOME_DO_PAPEL, PAPEIS } from "@/lib/permissoes";
import { USUARIOS_DEMO } from "@/lib/demo";
import { Alerta } from "@/components/ui/basicos";
import { Logo, Petalas } from "@/components/ui/marca";
import { BotaoTema } from "@/components/ui/tema";
import { BotaoSair } from "@/components/layout/faixa-topo";
import { EntrarDemo } from "./entrar-demo";

export const metadata: Metadata = { title: "Entrar" };

export default async function Entrar({ searchParams }: PageProps<"/entrar">) {
  const ctx = await getContexto();
  if (ctx) redirect(inicioDoPapel(ctx.papel));

  const { saiu } = await searchParams;
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
      <div className="relative overflow-hidden bg-band pb-28 pt-[env(safe-area-inset-top)] text-band-fg">
        <Petalas tamanho={260} className="absolute -right-16 -top-20 opacity-25" />
        <div className="relative mx-auto flex max-w-lg justify-end px-4 pt-3">
          <BotaoTema className="text-band-fg hover:bg-white/10" />
        </div>
      </div>

      <main className="relative mx-auto -mt-24 w-full max-w-lg flex-1 px-3 pb-10">
        <div className="surgir flex flex-col gap-5 rounded-[26px] bg-surface p-6 shadow-float">
          <Logo largura={150} className="self-start" />
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[1.9rem] font-bold">Portal do condomínio</h1>
            <p className="text-[1.05rem] text-ink-2">
              Contas, visitantes, reservas e avisos do Jardins do Lago num só lugar.
            </p>
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

          {demo ? (
            <EntrarDemo perfis={perfis} />
          ) : (
            <Alerta tipo="info" titulo="Acesso em preparação">
              A administração do condomínio vai enviar as instruções para você entrar. Enquanto isso, qualquer
              dúvida pode ser tirada diretamente com a portaria.
            </Alerta>
          )}
        </div>
      </main>
    </div>
  );
}
