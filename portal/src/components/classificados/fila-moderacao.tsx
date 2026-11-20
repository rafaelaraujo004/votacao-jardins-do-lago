/**
 * Fila de moderação dos classificados (componente de servidor).
 * Usada em /admin/classificados (síndico) e em /classificados/moderar
 * (morador que recebeu a permissão extra "Moderar classificados").
 */
import { Ban, Check, CircleCheck, Inbox, X } from "lucide-react";
import type { AnuncioModeracao, FilaModeracao } from "@/server/dados/classificados";
import { aprovarAnuncio, rejeitarAnuncio, removerAnuncio } from "@/server/acoes/classificados";
import { DIAS_VALIDADE, diasRestantes, formatarWhatsapp } from "@/lib/classificados";
import { formatarData, formatarDataHora } from "@/lib/formato";
import { Campo, Cartao, EstadoVazio, classeEntrada } from "@/components/ui/basicos";
import { AcaoConfirmada } from "@/components/ui/acao-confirmada";
import { TituloSecao } from "@/components/ui/painel";
import { DialogoFormulario } from "@/components/reservas/dialogo-formulario";
import { CorpoAnuncio, EtiquetaSituacao } from "./pecas";

/** `chave` deixa o id único na página (há uma janela por anúncio). */
function CampoMotivo({ chave, dica }: { chave: string; dica: string }) {
  const id = `motivo-${chave}`;
  return (
    <Campo id={id} rotulo="Comentário para o autor (motivo)" dica={dica}>
      <textarea
        id={id}
        name="motivo"
        required
        minLength={3}
        maxLength={300}
        rows={3}
        className={`${classeEntrada} py-3`}
        aria-describedby={`${id}-dica`}
      />
    </Campo>
  );
}

/** Quem anunciou, quando e o contato (a moderação vê a casa; os moradores não). */
function Autoria({ a, fuso }: { a: AnuncioModeracao; fuso: string }) {
  return (
    <p className="text-[0.88rem] text-muted">
      {a.autorPrimeiroNome} · {a.unidadeRotulo}
      {a.criadoEm ? ` · enviado em ${formatarDataHora(a.criadoEm, fuso)}` : ""}
      {a.contatoWhatsapp ? ` · WhatsApp ${formatarWhatsapp(a.contatoWhatsapp)}` : " · sem WhatsApp"}
    </p>
  );
}

function BotaoRemover({ a }: { a: AnuncioModeracao }) {
  return (
    <DialogoFormulario
      acao={removerAnuncio}
      campos={{ id: a.id }}
      rotuloBotao="Remover"
      icone={<Ban aria-hidden className="size-4" />}
      titulo="Remover este anúncio?"
      descricao={`“${a.titulo}” sai da lista dos moradores. O autor verá o motivo em “Meus anúncios”.`}
      textoEnviar="Remover anúncio"
      textoEnviando="Removendo…"
      varianteEnviar="perigo"
    >
      <CampoMotivo chave={`remover-${a.id}`} dica="Ex.: produto já vendido, conteúdo fora das regras do condomínio." />
    </DialogoFormulario>
  );
}

export function FilaDeModeracao({ fila, fuso, agora }: { fila: FilaModeracao; fuso: string; agora: Date }) {
  return (
    <div className="flex flex-col gap-6">
      {/* ----- Aguardando aprovação ----- */}
      <section aria-labelledby="titulo-pendentes" className="flex flex-col gap-3">
        <TituloSecao id="titulo-pendentes" extra={fila.pendentes.length ? `${fila.pendentes.length} na fila` : undefined}>
          Aguardando aprovação
        </TituloSecao>
        {fila.pendentes.length === 0 ? (
          <EstadoVazio icone={Inbox} titulo="Nenhum anúncio aguardando">
            Quando um morador enviar um anúncio, ele aparece aqui para você aprovar ou não.
          </EstadoVazio>
        ) : (
          <ul className="flex flex-col gap-3">
            {fila.pendentes.map((a) => (
              <li key={a.id}>
                <Cartao className="p-4">
                  <CorpoAnuncio
                    titulo={a.titulo}
                    texto={a.texto}
                    categoria={a.categoria}
                    preco={a.preco}
                    fotos={a.fotos}
                    rodape={
                      <>
                        <Autoria a={a} fuso={fuso} />
                        <div className="flex flex-wrap gap-2">
                          <AcaoConfirmada
                            acao={aprovarAnuncio}
                            campos={{ id: a.id }}
                            titulo="Aprovar este anúncio?"
                            mensagem={`“${a.titulo}” aparece para todos os moradores por ${DIAS_VALIDADE} dias, com o primeiro nome do autor${a.contatoWhatsapp ? " e o WhatsApp informado" : ""}.`}
                            textoConfirmar="Sim, aprovar"
                            variante="primario"
                          >
                            <Check aria-hidden className="size-4" /> Aprovar
                          </AcaoConfirmada>
                          <DialogoFormulario
                            acao={rejeitarAnuncio}
                            campos={{ id: a.id }}
                            rotuloBotao="Não aprovar"
                            icone={<X aria-hidden className="size-4" />}
                            titulo="Não aprovar este anúncio?"
                            descricao={`“${a.titulo}” não será publicado. O autor verá o motivo em “Meus anúncios”.`}
                            textoEnviar="Não aprovar"
                            textoEnviando="Enviando…"
                            varianteEnviar="perigo"
                          >
                            <CampoMotivo chave={`rejeitar-${a.id}`} dica="Ex.: venda de produto proibido, texto com dados pessoais. Seja gentil: o autor vai ler." />
                          </DialogoFormulario>
                        </div>
                      </>
                    }
                  />
                </Cartao>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ----- Publicados ----- */}
      <section aria-labelledby="titulo-publicados" className="flex flex-col gap-3">
        <TituloSecao id="titulo-publicados" extra={`saem do ar após ${DIAS_VALIDADE} dias`}>
          No ar agora
        </TituloSecao>
        {fila.publicados.length === 0 ? (
          <EstadoVazio icone={CircleCheck} titulo="Nenhum anúncio publicado">
            Os anúncios aprovados aparecem aqui até expirarem.
          </EstadoVazio>
        ) : (
          <ul className="flex flex-col gap-3">
            {fila.publicados.map((a) => (
              <li key={a.id}>
                <Cartao className="p-4">
                  <CorpoAnuncio
                    titulo={a.titulo}
                    texto={a.texto}
                    categoria={a.categoria}
                    preco={a.preco}
                    fotos={a.fotos}
                    rodape={
                      <>
                        <Autoria a={a} fuso={fuso} />
                        {a.expiraEm ? (
                          <p className="text-[0.88rem] font-bold text-ink-2">
                            No ar até {formatarData(a.expiraEm, fuso)} ({diasRestantes(a.expiraEm, agora)} dias)
                          </p>
                        ) : null}
                        <div>
                          <BotaoRemover a={a} />
                        </div>
                      </>
                    }
                  />
                </Cartao>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ----- Histórico ----- */}
      {fila.historico.length > 0 ? (
        <section aria-labelledby="titulo-historico" className="flex flex-col gap-3">
          <TituloSecao id="titulo-historico" extra="últimas decisões">
            Histórico
          </TituloSecao>
          <ul className="flex flex-col gap-2.5">
            {fila.historico.map((a) => (
              <li key={a.id} className="saltado flex flex-col gap-1.5 rounded-2xl px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="min-w-0 break-words text-ink">{a.titulo}</b>
                  <EtiquetaSituacao situacao={a.situacao} />
                </div>
                <span className="text-[0.88rem] text-muted">
                  {a.autorPrimeiroNome} · {a.unidadeRotulo}
                  {a.situacao === "expirado" && a.expiraEm
                    ? ` · expirou em ${formatarData(a.expiraEm, fuso)}`
                    : a.decididoEm
                      ? ` · ${formatarData(a.decididoEm, fuso)}`
                      : ""}
                </span>
                {a.motivo ? <span className="text-[0.88rem] text-ink-2">Motivo: {a.motivo}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
