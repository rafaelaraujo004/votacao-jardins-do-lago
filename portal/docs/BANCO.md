# Banco de dados (Firestore)

Todos os dados de um condomínio ficam **dentro** de `condominiums/{condominioId}`. O isolamento aparece no próprio caminho do documento, nas regras e no código do servidor.

```
users/{uid}                          nome, condominioIds[], condominioAtivo     (só a própria pessoa lê)
rateLimits/{hash}                    limite de tentativas (só servidor; expira via TTL em expiraEm)

condominiums/{c}                     nome, status, fuso, moeda
  members/{uid}                      nome, papel, unitId, status, permissoesExtras[], permissoesNegadas[]
  units/{unitId}                     rotulo, numero, quadra, titularUid, status
  financialCategories/{id}           nome, tipo (receita/despesa)
  financialEntries/{id}              tipo, categoriaId, valorCentavos, data (AAAA-MM-DD), forma, descricao,
                                     publicado, estornaId, estornadoPor   — nunca editado nem apagado
  monthlySummaries/{AAAA-MM}         saldoAnterior, receitas, despesas, saldo, publicado
  amenities/{id}                     nome, regras, horários, capacidade, aprovação
  reservations/{id}                  amenityId, unitId, data, faixa, status
  reservationLocks/{area_data_faixa} trava: criada em transação; se já existe, o horário está ocupado
  visitors/{id}                      unitId, nome, data, validade, codigoHash (HMAC), status
  accessEvents/{id}                  visitorId, unitId, tipo (entrada/saída), quando — só acréscimo
  packages/{id}                      unitId, destinatario, tipo, recebidoEm, recebidoPor, status
  announcements/{id}                 titulo, texto, prioridade, publicado
  tickets/{id}                       protocolo, unitId, categoria, descricao, status, responsavel
    updates/{id}                     histórico da solicitação
  documents/{id}                     titulo, tipo, visivelPara[] (papéis)
  polls/{id}                         pergunta, opções, prazo, status
    votes/{unitId}                   um voto por casa
  classifieds/{id}                   autorUid, texto, status (moderação)
  mapPoints/{id}  usefulInfo/{id}
  counters/{nome}                    numeração de protocolos (só servidor)
  auditLogs/{id}                     uid, nome, papel, acao, alvo, detalhes, criadoEm — só acréscimo
```

Coleções em inglês (padrão do Firebase e da sugestão inicial); campos em português (linguagem do projeto).

## Decisões

| Decisão | Por quê |
|---|---|
| `members` dentro do condomínio, em vez de `memberships` na raiz | O caminho já diz o condomínio; as regras ficam simples (`condominiums/$(c)/members/$(uid)`). |
| `users/{uid}.condominioIds` | Só um índice para saber onde a pessoa tem vínculo. **Não dá acesso a nada**: o servidor sempre confere o `members` correspondente. |
| Papel no banco, não em "custom claims" do token | Suspender alguém vale na hora; claims só atualizam quando o token renova (até 1 hora). Custo: uma leitura a mais por pedido. |
| `reservationLocks` com ID fixo | Duas pessoas reservando o mesmo horário ao mesmo tempo: a transação de uma delas falha, sem depender de "olhar e depois gravar". |
| `monthlySummaries` | A tela financeira lê 1 documento por mês, em vez de somar todos os lançamentos. |
| Lançamentos nunca apagados | Correção é feita por **estorno** (lançamento inverso ligado ao original), com auditoria. |
| `codigoHash` dos visitantes | Como na votação: no banco fica só o HMAC do código; uma cópia do banco não revela códigos válidos. |
| `rateLimits` com hash do IP | Limita tentativas sem guardar o IP em texto. |

## Índices

Em `firestore.indexes.json`. Inclui a política de expiração (TTL) de `rateLimits.expiraEm`. Novos índices serão adicionados conforme as consultas de cada fase.
