# Registro e edição em quatro etapas

A evolução da [ADR 0030](adr/0030-polir-interface-e-atualizar-consultas-visiveis.md)
substitui o avanço automático da ADR 0027 por navegação manual. O progresso
compacto “1 de 4 · Foto ou vídeo” tem barra com retornos acessíveis às etapas
anteriores; revisão conserva atalhos de correção. Não há polling no rascunho.

`/registrar-ocorrencia` e `/meus-relatos/:id/editar` usam o mesmo rascunho em
`ReportOccurrencePage`, sem troca de rota entre etapas. O [ADR 0027](adr/0027-organizar-registro-em-etapas.md)
registra a evolução de localização. Dependências reais preservadas:
[múltiplas fotos](multiple-photos.md), [vídeo](occurrence-video.md) e
[semelhantes](similar-occurrences.md). Não há nova API, migration ou variável.

## Experiência e validação

1. **Foto ou vídeo:** 1–5 fotos ordenadas (primeira é capa) OU um MP4 nos limites
   atuais. Entrada visual única com Câmera (Fotografar/Gravar vídeo) e Galeria. Selecionar
   nunca avança: confira a prévia, adicione fotos e toque Continuar, no cadastro
   e na edição. Uma foto ativa e miniaturas horizontais separam navegação de
   reordenação/capa; os arquivos permanecem em memória. A validação local não garante codecs
   ou integridade do vídeo no servidor.
2. **Localização:** mapa, sugestão GPS, bairro (2–100) e referência (5–200 pontos
   de código). Cadastro exige ponto confirmado; legado editável pode continuar sem
   ponto. Não há entrada numérica de coordenadas. Toque confirma ponto; por teclado,
   setas movem o mapa e Enter confirma seu centro. Arrastar/recentralizar não confirma.
3. **Informações:** categoria persistida, título 5–100 e detalhes opcionais até
   1000 pontos de código, com trim/Unicode do contrato atual. Falha ao carregar
   categorias oferece nova tentativa sem limpar entradas ou inventar opção.
4. **Revisão:** resumo atual de mídia/capa, categoria, texto, bairro/referência e
   confirmação de localização, sem coordenadas brutas. Links de correção retornam
   às etapas; Voltar à revisão revalida o formulário completo. Consulta de semelhantes
   integra esta etapa, sem outra revisão depois de submit. Somente confirmação final
   explícita gera multipart; Enter nos campos iniciais não grava nem avança.

Cada avanço valida os campos da etapa. Antes de gravar, o handler revalida tudo,
critérios e contexto da revisão. Erros locais/HTTP direcionam mídia à etapa 1,
local/bairro/referência à 2 e categoria/título/detalhes à 3. Conflito/rede ficam com
contexto preservado; 409/412/428 nunca elevam If-Match automaticamente. Erro de mídia
retorna à primeira etapa. Resultado incerto continua alertando sobre risco de reenvio;
não há retry de escrita, autosave ou idempotência nova. 401 encerra sessão conforme
AuthProvider; 403 preserva sessão e informa acesso negado.

## GPS e mapa

Só na primeira entrada visível em Localização de cadastro sem ponto é tentado
`getCurrentPosition`, em contexto seguro e com timeout de 10 segundos. Não pede
GPS na mídia ou em background; Strict Mode não duplica tentativa. Voltar/reentrar
não solicita de novo. Na edição, inclusive legado, GPS é voluntário.

O controle com ícone e nome “Usar minha localização” fica dentro da área do mapa,
com alvo mínimo de 44×44 CSS px, tooltip, foco e estado busy. Não propaga clique
para seleção de ponto. Permissão negada, indisponibilidade e timeout têm mensagens
próprias; o mapa continua disponível. Retentar voluntariamente sugere sem confirmar.
Precisão é estimada, não garantia. Confirmar sugestão ou tocar/selecionar centro
substitui ponto; geocodificação reversa não é executada nem inventa bairro/referência.

Saída da etapa/desmontagem/desativação e escolha manual invalidam gerações pendentes.
`getCurrentPosition` não tem cancelamento nativo; callbacks tardios são ignorados e
não recentralizam. Sugestão já obtida pode ser preservada ao voltar e confirmada
mesmo se tiles falharem. Sem mapa funcional ou sugestão válida, cadastro precisa
aguardar retry: não fabricar zero ou centro padrão. Edição de legado permanece válida.
O mapa é montado só na primeira visita e atualiza tamanho ao reaparecer.

O provedor/atribuição/configuração continuam conforme [localização](occurrence-location.md).
WGS84/faixas/contratos da API não mudam; o mapa usa Web Mercator e não oferece
entrada textual para extremos fora de sua projeção. Mapas de consulta mantêm GPS
opt-in próprio; esta mudança não introduz obtenção automática nas consultas.

## Rascunho e recursos

Etapas visitadas ficam montadas, ocultas com hidden/inert quando inativas. Campos,
File/keys/ordem/capa, modo, ponto/sugestão e versão original ficam em memória.
Não persistir arquivo/Blob/base64 em storage do navegador. Chaves de mídias
novas são identidades locais do componente (useId + sequência), não UUIDs de
negócio: seleção/captura não depende de crypto.randomUUID ou de origem HTTPS.
IDs persistidos e manifesto HTTP continuam vindo do contrato existente. Previews locais mantêm
suas URLs até remoção/troca/desmontagem; fotos privadas já carregadas são reutilizadas
no resumo por callback local à página, sem cache global ou novo download. Requests
pendentes de foto são cancelados ao ocultar; retorno pode repetir um download
que não chegou a completar. A revisão não monta outro picker, galeria ou player.
Vídeo local é pausado ao ocultar; vídeo salvo não baixa nem toca ao navegar.

Busca de semelhantes é cancelada ao deixar revisão. Resultado concluído pode ser
reutilizado se critérios exatos não mudarem; retry é manual, sem foco/reconexão/polling.
Mudança de categoria/ponto/usuário invalida contexto; texto não usado na regra não
exige outra busca. Falha/timeout permite envio explícito; 401/403 não têm bypass.

Envio bloqueia navegação/seleção e usa guarda síncrona. Manifesto e If-Match seguem
contratos atuais; bytes são enviados só para arquivos novos. Sucesso, remoção,
troca e unmount liberam URLs/requests de seus donos; não prometer recuperação após
logout. A aplicação confirma descarte ao seguir links que saem de rascunho alterado
(incluindo Cancelar). `beforeunload` solicita proteção nativa quando aplicável;
texto/funcionamento não são universais. Botões nativos de histórico do navegador
não são bloqueados pelo Router declarativo; não houve refatoração para Data Router.
Reload, fechamento e sessão encerrada podem perder o rascunho; não há autosave.

## Roteiro de homologação

Pré-condições: Node 22.23.2/pnpm 10.34.5; testes locais usam fetch/GPS/tiles fictícios,
QueryClient isolado e nenhuma conta/mídia/localização pessoal. Para API real, usar
ambiente local e storage de teste autorizado, seguindo configuração de registro e
segurança. Não acessar Neon/R2/Render/Vercel reais para executar testes automatizados.

1. Abrir cadastro em 360px: só mídia visível. Galeria/câmera com seleção válida deve
   manter a etapa; cancelamento/arquivo inválido preserva seleção. Continuar é
   explícito. Voltar, adicionar
   foto, mudar capa e continuar manualmente; conferir ordem no resumo sem confundir setas de navegação e ordem. Repetir com
   MP4 suportado e inválido. Captura física depende do aparelho/navegador.
2. Na mesma versão/origem segura, permitir/negar GPS. Esperar sugestão sem ponto
   confirmado, precisão estimada e confirmação explícita. Toque durante GPS pendente
   deve prevalecer; sair e voltar não pede novamente. Ícone interno permite retry
   voluntário. Sem GPS, escolher pelo mapa, inclusive setas + Enter pelo teclado.
3. Preencher bairro/referência, categoria/título e detalhes vazios. Revisão deve
   mostrar conteúdo atual, capa já disponível e sugestões próximas só aqui. Abrir
   candidato em nova aba deve preservar rascunho. Corrigir cada etapa e retornar
   diretamente à revisão sem perder mídias/ponto/campos.
4. Confirmar “É outro relato, enviar” ou envio vazio: uma só escrita, nenhuma
   mídia enviada antes. Simular 503/timeout da consulta apenas localmente: mensagem
   diferente de vazio, retry e envio explícito. 401 encerra sessão; 403 não permite
   bypass. Rede de escrita não repete automaticamente e mantém aviso de incerteza.
5. Editar PENDING com foto/vídeo existente: começar na etapa 1, sem auto-GPS para
   ponto existente. Navegação não baixa de novo fotos concluídas nem baixa MP4;
   salvar envia manifesto com IDs, sem bytes antigos e com If-Match original.
   Legado sem ponto continua editável, sem busca geográfica fictícia.
6. Simular erros HTTP de campos escondidos e conflito/413/storage: voltar à etapa
   pertinente e manter as demais entradas. Tentar cancelar com alterações: confirmar
   descarte; negar deve manter tudo. Reload usa proteção nativa quando suportada.
7. Conferir 360px, largura intermediária, desktop, zoom nativo 200%, Tab/Enter,
   títulos/foco, controles ocultos fora da navegação e mapa após ida/volta. Avaliação
   com leitor de tela/aparelho e câmera/GPS físicos deve ser registrada separadamente.
8. Após revisão/autorização do mantenedor, publicar frontend pelo fluxo manual
   vigente e homologar Vercel/Render com contas/mídias controladas. APIs #22/#45/#52
   precisam estar disponíveis; esta entrega não exige backend novo, migrations ou
   variáveis. Não provocar indisponibilidade remota para testar falhas.

Verificações: em frontend/, `pnpm install --frozen-lockfile`, `pnpm run lint`,
`pnpm run typecheck`, `pnpm test` e `pnpm run build`. Sem alteração backend,
a validação da camada permanece nos contratos/suítes existentes; não exige banco
real para os testes frontend. Evidências datadas pertencem à MR/issue.
