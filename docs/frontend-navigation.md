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

## Notificações e recuperação de senha

`NotificationsAccess`, no shell de USER autenticado, abre `/notificacoes` com
nome acessível e contagem total de não lidas, independente da página aberta.
O badge mostra até 99+; o nome acessível preserva a contagem completa. Falha de
consulta não inventa contagem zero. A central e o acesso em Minha conta exigem
USER, com a mesma restrição no servidor; ADMIN/SUPER_ADMIN não herdam esse fluxo.

A central usa sessão e cache privado por usuário/página, paginação de 20 itens,
atualização manual, retry e marcação idempotente de leitura. Cada item mostra
mensagem, horário, estado textual e link para o relato privado. Não há polling,
push ou atualização em tempo real; entrar na central ou atualizar consulta o
servidor novamente. Contrato: [notificações](notifications.md).

`PasswordRecoveryAccess`, após a senha do login, continua como texto auxiliar
“Recuperação de senha em breve”, sem href, submit ou e-mail simulado.

Seleção de fotografias no produto usa `PhotoCollectionPicker` (1–5, ordenação/capa), reutilizável no futuro Wizard; detalhes usam `OccurrenceGallery`. Prova singular permanece independente. [Contrato, roteiro e limites](multiple-photos.md).
