# Conteúdo e padrões futuros

## Linguagem já aplicada

Português brasileiro cotidiano, direto e acolhedor. Explique o que aconteceu e
um próximo passo possível. Não exponha URL de ambiente, payload, stack trace,
versão ou jargão na área principal. Diagnóstico técnico fica nos guias.

A ferramenta de status, exclusiva de desenvolvimento, verifica somente a resposta de health agora. “Conexão
confirmada” não promete que todos os serviços funcionam. “Não foi possível
verificar a conexão” não confirma indisponibilidade geral. “Verificando a
conexão…” identifica espera sem inventar prazo. Configuração incorreta orienta
tentar mais tarde; a equipe corrige a URL conforme o guia frontend.

Não prometer integração oficial, resposta de prefeitura, resolução de problema
ou detecção automática por imagem. Não apresentar métricas históricas sem dados.

## Orientação a validar com produto e contratos

Os padrões abaixo orientam extensões e os fluxos implementados de registro/consulta de
ocorrência, já implementado com categoria, título, descrição, bairro, referência
textual, uma fotografia obrigatória e um ponto geográfico confirmado:

- Consulta pública implementada com Lista/Mapa, fotos nos cards/detalhes e
  alternativa textual integral para os pontos; GPS opcional por ação explícita
  na consulta, sem dependência de permissão para explorar.
- Marcadores implementados: categoria legível, seleção por contorno e agrupamento
  visual com seleção textual de cada relato, inclusive pontos idênticos.
  Evitar uma cor por categoria; não depender somente de cor.
- Cartão/detalhe: foto, título, categoria, localização resumida e status textual.
  Quando faltar foto, comunicar a ausência, sem imagem que pareça evidência real.
- Registro: etapa única com ponto obrigatório confirmado no mapa ou por
  coordenadas e GPS opcional mediante ação, sem geocodificação. Edição de Pendente
  permite ajuste; legado não é preenchido automaticamente. Veja [localização](../occurrence-location.md).
- Estados atuais: PENDING/Pendente, IN_ANALYSIS/Em análise, RESOLVED/Resolvida
  e REJECTED/Rejeitada. O relato nasce PENDING; transições e histórico seguem
  [moderação](../occurrence-moderation.md), sem evento inicial fabricado.
- Meus relatos: reutilizar o guard de autenticação implementado quando necessário; não
  bloquear consulta pública por padrão sem decisão de requisitos. Exemplo vazio:
  “Você ainda não tem relatos.” Só oferecer ação quando tiver destino funcional.
- Carregamento e conexão lenta: preservar contexto e entradas, com texto como
  “Ainda estamos carregando. Aguarde um pouco.” Sem falsa porcentagem/prazo.
- Erro: “Não conseguimos salvar. Confira sua conexão e tente novamente.” Só
  prometer preservação ou salvamento de dados quando estiver implementado.
- Privacidade de fotos/localização e duplicidade dependem de contratos de produto.
  Não prometer remoção de EXIF, anonimização ou ocultação que não exista.

Mapa e foto são conteúdo, não decoração. A interface deve facilitar leitura e
uma decisão de cada vez, sem dashboard artificial nem botões sem destino.

## Padrões da referência a aplicar na próxima auditoria

Filtros de categoria e estado são independentes, com selects rotulados que cabem
no mobile. Rejeição oferece motivo sugerido opcional; a explicação humana de
10–500 caracteres Unicode após trim continua necessária. A sugestão não altera
a API nem substitui texto digitado.

Aviso de duplicidade é informativo: ação principal “Enviar mesmo assim”,
secundária “Revisar relato”. Não exigir afirmar que é outro problema, nem prometer
prioridade maior por repetição. A regra de prioridade depende de alinhamento.

Detalhe administrativo começa com “Voltar para a fila”, antes do identificador.
Mapa na fila administrativa aguarda priorização; mapas públicos/próprios não
atendem esse pedido. Vídeo e PDF com filtros de datas permanecem no backlog.
