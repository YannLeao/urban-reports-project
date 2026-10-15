# Navegação e composições do frontend

O produto Tá na Rua usa a identidade, tokens, Figtree e pinos do design system
Alô Cidade. A entrada `/` é curta: “Ver no mapa” abre
`/ocorrencias?visao=mapa`; “Relatar problema” abre a rota protegida do registro.
Visitante segue para `/entrar` com retorno interno validado por `safeReturnPath`.
USER retorna ao registro após login; ADMIN/SUPER_ADMIN recebem acesso ao painel
adequado na home, sem chamada para criar relato.

## Destinos e papéis

| Sessão | Navegação principal | Complemento |
| --- | --- | --- |
| Visitante | Mapa, Relatar, Entrar | Marca abre início |
| USER | Mapa, Relatar, Meus relatos, Conta | Sino de notificações no cabeçalho |
| ADMIN | Fila, Relatório, Conta | Marca abre início |
| SUPER_ADMIN | Administradores, Conta | Marca abre início |

`src/app/ProductNavigation.tsx` tem uma única navegação: barra inferior no mobile,
cabeçalho no desktop. Ícones decorativos acompanham rótulos visíveis. NavLink
marca a seção, incluindo detalhes/edição, por pathname; query não muda o universo.
O destino Mapa abre consulta pública em modo mapa mesmo quando a seção atual
está em Lista. Guards de papel continuam exatos, sem herança administrativa.
Logout permanece na conta com confirmação real da API e possibilidade de retry.

A barra inferior usa `safe-area-inset-bottom`; o shell reserva espaço inferior
para que todo conteúdo possa ser alcançado por rolagem. `viewport-fit=cover`
permite respeitar as áreas seguras do aparelho. Cabeçalho não contém menu móvel
com várias linhas; marca permanece link de início. Skip link e main são preservados.

## Leitura, mapa e painel

`src/app/AppLayout.tsx` escolhe a composição por rota:

- `reading`: entrada, formulários, listas e detalhes, com `max-w-reading`.
- `map`: consultas pública/própria com `visao=mapa`, com `max-w-app`.
- `panel`: `/administracao/*`, com `max-w-app`.

O shell usa padding menor no celular; Card mantém o contrato global. As páginas
de formulário/relatório continuam responsáveis por seus grupos internos, sem
reorganização de campos ou redesenho de painel nesta composição. Não usar a
largura de leitura como limite adicional dentro de consultas em modo mapa.

Nas consultas o mapa usa vh com melhoria svh, descontando espaço para navegação
e controles. `useMapStageHeight` mede o espaço real após quebras de linha e a
altura da barra inferior, incluindo safe area, por ResizeObserver/visualViewport.
O estilo inline de altura é dado medido da integração; classes mantêm o fallback.
Altura mínima permite rolagem em tela baixa/zoom; não há fullscreen
rígido nem bloqueio global de overflow. O resumo selecionado divide o quadro
com o mapa, sem sobrepor atribuição, zoom ou navegação. ResizeObserver invalida
a dimensão Leaflet ao abrir/fechar o resumo. Escritas concorrentes de seleção e
viewport na URL são mescladas para preservar o contexto. Eventos de um mapa
que está sendo deixado não sobrescrevem uma navegação já iniciada no histórico,
nem a tela seguinte após desmontagem.

O [guia de mapas](occurrence-maps.md) descreve prioridades de enquadramento,
consulta completa, foto sob demanda, GPS opt-in, grupos e alternativa textual.
O formulário mantém confirmação de ponto e o GPS próprios: não confundir os
controles de exploração com criação/edição de localização.

## Ferramentas técnicas

`/status`, `/prova-imagem` e `/dev/design-system` permanecem úteis em
`pnpm run dev`, por URL direta, sem link no percurso do cidadão. As importações
condicionais por `import.meta.env.DEV` impedem seus módulos de integrar produção;
no build/preview de produção as três rotas mostram não encontrado.

`/api/health` continua público na API. Storage e segurança não mudam.
A prova de imagem isola seleção/decodificação em desenvolvimento; para validar
câmera no produto usar o formulário real autorizado. Não reabrir a prova em
produção apenas para facilitar apresentação.

## Integrações visuais pendentes

Não há rota funcional de recuperação de senha ou central de notificações neste
checkout. Os contratos de integração existentes não definem rotas frontend
operacionais. `src/app/ProductIntegrations.tsx` concentra os dois acessos:

- `PasswordRecoveryAccess`, inserido após o campo de senha do login: texto
  auxiliar “Recuperação de senha em breve”, sem href, submit ou e-mail simulado.
- `NotificationsAccess`, somente no shell de USER autenticado: sino com nome
  “Notificações”, `aria-disabled`, sem badge/contador. É focável para expor a
  explicação “Notificações em breve” por foco/hover e toque que dá foco ao botão.
  `aria-describedby` fornece a explicação a tecnologia assistiva.

Quando os fluxos reais chegarem, substituir esses acessos por Links para as
rotas efetivamente entregues e atualizar testes/guia. Não criar aliases presumidos
nem ligar direto a endpoints da API. Reutilizar sessão e prefixo de cache privado;
notificações não são habilitadas a outros papéis sem seu contrato. O login mantém
seu formulário e regras; mostrar/ocultar senha e organização do registro são
trabalhos separados.
