# Conteúdo e padrões futuros

## Linguagem já aplicada

Português brasileiro cotidiano, direto e acolhedor. Explique o que aconteceu e
um próximo passo possível. Não exponha URL de ambiente, payload, stack trace,
versão ou jargão na área principal. Diagnóstico técnico fica nos guias.

A tela de status verifica somente a resposta de health agora. “Conexão
confirmada” não promete que todos os serviços funcionam. “Não foi possível
verificar a conexão” não confirma indisponibilidade geral. “Verificando a
conexão…” identifica espera sem inventar prazo. Configuração incorreta orienta
tentar mais tarde; a equipe corrige a URL conforme o guia frontend.

Não prometer integração oficial, resposta de prefeitura, resolução de problema
ou detecção automática por imagem. Não apresentar métricas históricas sem dados.

## Orientação a validar com produto e contratos

Nenhum dos padrões abaixo representa uma tela ou contrato já implementado:

- Consulta pública: priorizar mapa e fotos, com alternativa textual e acesso sem
  geolocalização. A pessoa deve poder escolher um local sem conceder GPS.
- Marcadores: categoria legível, seleção perceptível e eventual agrupamento.
  Evitar uma cor por categoria; não depender somente de cor.
- Cartão/detalhe: foto, título, categoria, localização resumida e status textual.
  Quando faltar foto, comunicar a ausência, sem imagem que pareça evidência real.
- Registro guiado: proposta a validar, sem impor cinco etapas, coordenadas
  obrigatórias, mapa, geocoding ou permissão de GPS nesta entrega.
- “Recebido”, “Em análise”, “Em andamento”, “Resolvido” e “Rejeitado” são sugestões
  de vocabulário. Não são enum da API. O frontend valida health `UP` e o contrato de cadastro; confirmar o contrato
  de ocorrências antes de implementar tokens `report` ou
  mapeamentos de andamento.
- Autenticação e meus relatos: explicar por que entrar quando necessário; não
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
