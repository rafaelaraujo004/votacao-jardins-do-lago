# Roteiro por fases

Uma fase só é "concluída" com: tela funcionando, validação, integração real com o Firebase, permissões, tratamento de erros e testes.

| Fase | Entrega | Situação |
|---|---|---|
| **1 — Fundação** | Projeto, identidade visual, Firebase, sessão, multi-condomínio, permissões, regras + testes, auditoria, documentação | **Concluída** (aguardando sua validação) |
| 2 — Portal | Login real, início do morador, painel admin, unidades e moradores, financeiro (lançar, estornar, resumo mensal, PDF/Excel), contatos | Decidir o método de login antes |
| 3 — Portaria | Visitantes + código/QR com validade e uso único, entradas e saídas, encomendas, retenção LGPD | |
| 4 — Serviços | Reservas (sem conflito, via transação), solicitações com protocolo, comunicados, documentos | Decidir plano Blaze (arquivos) |
| 5 — Experiência | Mapa interativo (com a planta real), enquetes, classificados, relatórios | Precisa da planta |
| 6 — Produção | Testes de segurança e concorrência, CSP com nonce, importação da planilha, treinamento, deploy definitivo | |

## Fase 1 — o que foi entregue

- Projeto Next.js 16 + TypeScript + Tailwind 4 em `portal/`.
- Identidade visual (claro/escuro) e peças reutilizáveis; vitrine em `/identidade`.
- Firebase: cliente (só login), Admin SDK (só servidor), App Check opcional, simulador local.
- Sessão por cookie seguro; proxy de triagem; contexto do usuário calculado no servidor.
- Permissões por papel com extras/retiradas e teto.
- Regras do Firestore para todas as coleções planejadas (gravação do cliente sempre negada).
- Auditoria (entrar/sair já registrados) e tela de auditoria para o síndico.
- Limite de tentativas; cabeçalhos de segurança.
- Telas iniciais de cada perfil (itens futuros marcados "Em breve", sem clique).
- Login de demonstração apenas local; script para criar o condomínio real.
- Testes: 16 unitários + 30 no simulador.

## Decisões em aberto

1. **Método de login** dos moradores (muitos não usam e-mail): e-mail e senha, link sem senha, SMS (exige Blaze) ou convite pelo WhatsApp.
2. **Plano Blaze** (arquivos, backup automático, SMS).
3. **Retenção LGPD** de visitantes (proposta: 90 dias) — confirmar com o síndico.
4. **Planta** do condomínio para o mapa.
