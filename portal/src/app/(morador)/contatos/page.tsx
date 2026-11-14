import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import { Ambulance, DoorOpen, Flame, FlaskConical, MessageCircle, Phone, Shield, UserRound } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { EMERGENCIAS } from "@/lib/condominio";
import { Cartao, EstadoVazio, Etiqueta } from "@/components/ui/basicos";
import { CabecalhoPagina, TituloSecao } from "@/components/ui/painel";
import { EnderecoCopiavel } from "@/components/ui/endereco";

export const metadata: Metadata = { title: "Contatos úteis" };

// Ícone e cor de cada número de emergência.
const ICONE_EMERGENCIA: Record<string, { icone: LucideIcon; cor: string }> = {
  "190": { icone: Shield, cor: "text-lake" },
  "192": { icone: Ambulance, cor: "text-plum" },
  "193": { icone: Flame, cor: "text-texto-laranja" },
};

// Telefones FICTÍCIOS: aparecem só na demonstração, marcados como "exemplo".
// Os números de verdade virão do cadastro da administração.
const CONTATOS_EXEMPLO = [
  { nome: "Portaria", detalhe: "24 horas", telefone: "(94) 9 0000-0000", digitos: "5594900000000", icone: DoorOpen },
  { nome: "Administração / Síndico", detalhe: "Seg. a sex., 8h às 18h", telefone: "(94) 9 0000-0001", digitos: "5594900000001", icone: UserRound },
];

export default async function ContatosMorador() {
  const ctx = await exigirPermissao("area.morador");

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina sobretitulo="Contatos" titulo="Contatos úteis" subtitulo="Um toque para ligar." />

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

      <section aria-labelledby="titulo-condominio" className="flex flex-col gap-3">
        <TituloSecao id="titulo-condominio">Condomínio</TituloSecao>
        {ctx.demo ? (
          <>
            <ul className="flex flex-col gap-3">
              {CONTATOS_EXEMPLO.map((c) => (
                <li key={c.nome}>
                  <Cartao className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ok-soft text-pine">
                        <c.icone aria-hidden className="size-6" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[1.1rem] font-bold text-destaque">{c.nome}</h3>
                        <p className="text-[0.9rem] text-muted">
                          {c.detalhe} · {c.telefone}
                        </p>
                        <span className="mt-1 inline-block">
                          <Etiqueta tom="aviso" icone={FlaskConical}>
                            exemplo
                          </Etiqueta>
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <a
                        href={`tel:+${c.digitos}`}
                        aria-label={`Ligar para ${c.nome} (número de exemplo)`}
                        className="botao-verde inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-2 font-bold active:shadow-afundado"
                      >
                        <Phone aria-hidden className="size-5" /> Ligar
                      </a>
                      <a
                        href={`https://wa.me/${c.digitos}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`WhatsApp de ${c.nome} (número de exemplo, abre em outra aba)`}
                        className="saltado inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-2 font-bold text-pine active:shadow-afundado"
                      >
                        <MessageCircle aria-hidden className="size-5" /> WhatsApp
                      </a>
                    </div>
                  </Cartao>
                </li>
              ))}
            </ul>
            <p className="text-center text-[0.86rem] text-muted">
              Demonstração: estes telefones são fictícios. Os números de verdade serão cadastrados pela administração.
            </p>
          </>
        ) : (
          <EstadoVazio icone={Phone} titulo="Telefones em breve">
            A administração vai cadastrar os telefones da portaria e do síndico.
          </EstadoVazio>
        )}
      </section>
    </div>
  );
}
