"use client";

/**
 * Formulário do anúncio novo. O servidor confere tudo de novo
 * (tamanho dos textos, preço, WhatsApp, limite de anúncios).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Alerta, Campo, classeEntrada } from "@/components/ui/basicos";
import { BotaoEnviar, Formulario } from "@/components/ui/formulario";
import { criarAnuncio } from "@/server/acoes/classificados";
import {
  CATEGORIAS_CLASSIFICADO,
  DICA_CATEGORIA,
  DIAS_VALIDADE,
  ROTULO_CATEGORIA,
  type CategoriaClassificado,
} from "@/lib/classificados";
import { cx } from "@/lib/cx";

export function FormularioAnuncio({ primeiroNome }: { primeiroNome: string }) {
  const router = useRouter();
  const [categoria, setCategoria] = useState<CategoriaClassificado | "">("");
  const [whatsapp, setWhatsapp] = useState("");
  const temContato = whatsapp.trim().length > 0;

  return (
    <Formulario
      acao={criarAnuncio}
      aoSalvar={() => {
        setCategoria("");
        setWhatsapp("");
        router.push("/classificados?aba=meus");
        router.refresh();
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 font-bold">Que tipo de anúncio?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORIAS_CLASSIFICADO.map((c) => (
            <label
              key={c}
              className={cx(
                "flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 border-borda-luz bg-surface px-4 py-2 shadow-relevo",
                "has-checked:border-pine has-checked:bg-ok-soft has-checked:shadow-afundado",
                "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-lake",
              )}
            >
              <input
                type="radio"
                name="categoria"
                value={c}
                required
                checked={categoria === c}
                onChange={() => setCategoria(c)}
                className="size-5 accent-pine"
              />
              <span className="flex min-w-0 flex-col leading-tight">
                <b>{ROTULO_CATEGORIA[c]}</b>
                <span className="text-[0.86rem] text-muted">{DICA_CATEGORIA[c]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Campo id="titulo" rotulo="Título" dica="Curto e direto. Ex.: Bicicleta aro 26, Aulas de violão, Bolo de pote.">
        <input id="titulo" name="titulo" required minLength={4} maxLength={80} className={classeEntrada} aria-describedby="titulo-dica" />
      </Campo>

      <Campo
        id="texto"
        rotulo="Descrição"
        dica="Conte os detalhes: estado, tamanho, horários… Não coloque CPF, número da casa, nem dados bancários."
      >
        <textarea
          id="texto"
          name="texto"
          required
          minLength={10}
          maxLength={1000}
          rows={5}
          className={`${classeEntrada} py-3`}
          aria-describedby="texto-dica"
        />
      </Campo>

      {categoria === "doacao" ? null : (
        <Campo id="preco" rotulo="Preço (opcional)" dica="Em reais. Ex.: 150 ou 1.200,50. Deixe vazio para “a combinar”.">
          <input id="preco" name="preco" inputMode="decimal" maxLength={20} placeholder="R$" className={classeEntrada} aria-describedby="preco-dica" />
        </Campo>
      )}

      <Campo id="whatsapp" rotulo="WhatsApp para contato (opcional)" dica="Com DDD. Ex.: (91) 98888-7777.">
        <input
          id="whatsapp"
          name="whatsapp"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          maxLength={25}
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          className={classeEntrada}
          aria-describedby="whatsapp-dica"
        />
      </Campo>

      {temContato ? (
        <Alerta tipo="aviso" titulo="Seu número ficará visível">
          <p>Todos os moradores com acesso ao portal verão este WhatsApp junto do anúncio.</p>
          <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 font-bold text-ink">
            <input type="checkbox" name="cienteContato" value="sim" required className="size-5 shrink-0 accent-pine" />
            Entendo e quero mostrar meu WhatsApp
          </label>
        </Alerta>
      ) : (
        <p className="text-[0.9rem] text-muted">Sem WhatsApp, os interessados não terão como falar com você pelo portal.</p>
      )}

      <Alerta tipo="info" titulo="Como funciona">
        O anúncio aparece como “{primeiroNome}” (só o primeiro nome, sem a casa) depois que a administração aprovar, e
        fica no ar por {DIAS_VALIDADE} dias.
      </Alerta>

      <div>
        <BotaoEnviar largo textoEnviando="Enviando…">
          <Send aria-hidden className="size-5" /> Enviar para aprovação
        </BotaoEnviar>
      </div>
    </Formulario>
  );
}
