"use client";

/**
 * Formulários rápidos da portaria: visitante sem código, nova encomenda
 * e o botão "Entregar" (pede quem retirou e a confirmação).
 */
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, PackageCheck, PackagePlus, PhoneCall } from "lucide-react";
import { entregarEncomenda, registrarEncomenda, registrarEntradaSemCodigo } from "@/server/acoes/portaria";
import { Campo, classeEntrada } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { TIPOS_ENCOMENDA, TIPOS_VISITA, type CasaParaBusca } from "@/lib/portaria";
import { OpcoesPilula } from "./pecas";
import { SeletorCasa } from "./seletor-casa";

const classeCaixa =
  "flex min-h-12 cursor-pointer items-start gap-3 rounded-2xl border-2 border-borda-luz bg-surface px-4 py-3 font-bold has-checked:border-pine has-checked:bg-ok-soft " +
  "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-lake";

export function EntradaSemCodigo({ casas }: { casas: CasaParaBusca[] }) {
  const router = useRouter();
  return (
    <Formulario acao={registrarEntradaSemCodigo} aoSalvar={() => router.refresh()}>
      <SeletorCasa casas={casas} id="casa-sem-codigo" rotulo="Casa que vai receber" />
      <Campo id="nome-sem-codigo" rotulo="Nome do visitante">
        <input id="nome-sem-codigo" name="nome" required minLength={2} maxLength={80} autoComplete="off" className={classeEntrada} />
      </Campo>
      <OpcoesPilula nome="tipo" legenda="Tipo" padrao="visita" opcoes={Object.entries(TIPOS_VISITA).map(([valor, rotulo]) => ({ valor, rotulo }))} />
      <label className={classeCaixa}>
        <input type="checkbox" name="confirmado" required className="mt-1 size-5 shrink-0 accent-[var(--pine)]" />
        <span className="flex items-start gap-2">
          <PhoneCall aria-hidden className="mt-0.5 size-5 shrink-0 text-pine" />
          Confirmei com o morador por telefone que a entrada está liberada.
        </span>
      </label>
      <div>
        <BotaoEnviar textoEnviando="Registrando…">
          <DoorOpen aria-hidden className="size-5" /> Registrar entrada
        </BotaoEnviar>
      </div>
    </Formulario>
  );
}

export function NovaEncomenda({ casas }: { casas: CasaParaBusca[] }) {
  const router = useRouter();
  return (
    <Formulario acao={registrarEncomenda} aoSalvar={() => router.refresh()}>
      <SeletorCasa casas={casas} id="casa-encomenda" />
      <Campo id="destinatario" rotulo="Para quem (nome na etiqueta)">
        <input id="destinatario" name="destinatario" required minLength={2} maxLength={80} autoComplete="off" className={classeEntrada} />
      </Campo>
      <OpcoesPilula nome="tipo" legenda="Tipo" padrao="caixa" opcoes={Object.entries(TIPOS_ENCOMENDA).map(([valor, rotulo]) => ({ valor, rotulo }))} />
      <Campo id="observacao-encomenda" rotulo="Observação (opcional)" dica="Ex.: Correios, caixa grande, frágil.">
        <input id="observacao-encomenda" name="observacao" maxLength={200} autoComplete="off" className={classeEntrada} aria-describedby="observacao-encomenda-dica" />
      </Campo>
      <div>
        <BotaoEnviar textoEnviando="Registrando…">
          <PackagePlus aria-hidden className="size-5" /> Registrar encomenda
        </BotaoEnviar>
      </div>
    </Formulario>
  );
}

/** Entregar: abre uma janela pedindo quem retirou e a confirmação. */
export function BotaoEntregar({ id, descricao }: { id: string; descricao: string }) {
  const janela = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  return (
    <>
      <Botao variante="primario" tamanho="pequeno" onClick={() => janela.current?.showModal()} icone={<PackageCheck aria-hidden className="size-4" />}>
        Entregar
      </Botao>
      <dialog
        ref={janela}
        aria-labelledby={`entregar-${id}`}
        className="m-auto w-[min(92vw,30rem)] rounded-[26px] border border-borda-luz bg-surface p-0 text-ink shadow-float backdrop:bg-black/50"
      >
        <div className="flex flex-col gap-4 p-6">
          <h2 id={`entregar-${id}`} className="text-xl font-bold">
            Entregar encomenda
          </h2>
          <p className="text-ink-2">{descricao}</p>
          <Formulario
            acao={entregarEncomenda}
            aoSalvar={() => {
              janela.current?.close();
              router.refresh();
            }}
          >
            <input type="hidden" name="id" value={id} />
            <Campo id={`retirou-${id}`} rotulo="Quem retirou">
              <input id={`retirou-${id}`} name="retiradoPor" required minLength={2} maxLength={80} autoComplete="off" className={classeEntrada} />
            </Campo>
            <label className={classeCaixa}>
              <input type="checkbox" name="confirmado" required className="mt-1 size-5 shrink-0 accent-[var(--pine)]" />
              <span>Entreguei a encomenda nas mãos desta pessoa.</span>
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Botao variante="secundario" onClick={() => janela.current?.close()}>
                Voltar
              </Botao>
              <BotaoEnviar textoEnviando="Registrando…">Confirmar entrega</BotaoEnviar>
            </div>
          </Formulario>
        </div>
      </dialog>
    </>
  );
}
