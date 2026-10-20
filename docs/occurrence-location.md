# Localização confirmada dos relatos

O cadastro e a edição de Pendente permitem indicar um ponto no mapa. Esta é a
entrega #43 de #41. Lista/Mapa, mapas nos detalhes, marcadores completos e pinos
por categoria são documentados na [entrega #44](occurrence-maps.md).

## Dados e contrato HTTP

A V9 adiciona `latitude` e `longitude` `double precision` à tabela `occurrences`,
sem backfill. São coordenadas **WGS84, em graus decimais**, com aproximadamente
15 algarismos significativos, suficientes para localização urbana. A apresentação
usa seis casas, sem arredondar os valores enviados/persistidos. Não representam
precisão garantida de GPS. Latitude aceita [-90, 90] e longitude [-180, 180],
inclusive. Zero em qualquer eixo e (0,0) são posições válidas.

O CHECK do PostgreSQL aceita ambos nulos ou ambos presentes dentro das faixas;
recusa par incompleto, NaN e infinitos. Hibernate permanece `ddl-auto=validate`.
Não há PostGIS, geofence ou contrato de município/UF. Bairro e referência
continuam textuais; não se deduz posição a partir deles, de EXIF ou do mapa.

- `POST /api/occurrences`: multipart exige `latitude` e `longitude` textuais,
  cada um exatamente uma vez, junto aos campos/fotografia existentes. Decimal
  com ponto e notação exponencial são aceitos; vazio, `null`, texto arbitrário,
  hexadecimais, valores não finitos e fora da faixa geram 400 antes de upload.
  A confirmação é uma ação explícita na interface; a API exige o par válido e
  não pode atestar a origem de coordenadas fornecidas por um cliente.
- `PUT /api/occurrences/{id}`: os demais campos continuam sendo substituídos
  conforme o contrato atual. **Exceção explícita para localização**: omitir ambos
  mantém o par persistido, inclusive a ausência de legado. Enviar ambos válidos
  substitui o ponto. Par incompleto ou tentativa de limpar (inclusive campos
  vazios/`null` textual) gera 400; remoção de posição não está disponível.
  O frontend reenvia o ponto confirmado existente, quando houver.
- Respostas de cadastro, edição, lista/detalhe próprios, lista/detalhe públicos e
  fila/detalhe/moderação administrativos incluem `latitude` e `longitude`
  numéricos ou **ambos null**. Nenhum dado pessoal adicional é exposto.
  O frontend tolera ambos omitidos apenas para publicação contra a API anterior;
  rejeita pares incompletos e inválidos recebidos em leitura.

Autoria, PENDING, lock, versão/If-Match e journal de fotografia continuam sendo
revalidados na transação existente. Uma edição incrementa versão uma vez,
coordenadas/texto/foto confirmam ou revertem juntos. Concorrência com moderação
não concede edição após início de análise; 404/409/412/428 mantêm a política
vigente. Relatos finais legados não ganham autorização especial.

## Interação, acessibilidade e falhas

`features/location/LocationPicker` recebe ponto confirmado, onChange, disabled,
active, autoLocate, error e focusError. No [Wizard](report-wizard.md), monta na
primeira visita e fica inativo nas demais etapas. Toque no mapa ou setas + Enter
no centro confirmam o ponto. Mover/arrastar/recentralizar não confirma. Não existem
inputs ou expansão de latitude/longitude no cadastro/edição; resumo não mostra
coordenadas brutas. API e mapas de detalhe preservam seus contratos numéricos.

Na primeira entrada visível de cadastro sem ponto, tenta GPS uma vez com contexto
seguro, alta precisão, timeout de 10 segundos e cache zero. Edição, inclusive legado,
usa apenas acionamento voluntário. Controle de ícone dentro do mapa, rotulado
“Usar minha localização”, oferece retry em todos os breakpoints, alvo de 44×44,
foco/tooltip e estado busy, sem propagar clique como seleção de ponto.

Resultado GPS é sugestão em círculo tracejado com precisão estimada e ações
Confirmar este local/Descartar sugestão, distinto do pino confirmado. Não preenche
bairro/referência nem avança etapa. Negação, timeout e indisponibilidade têm mensagens
próprias, sem apagar ponto. Respostas tardias após seleção manual, saída/desativação
ou unmount são ignoradas por geração; não há watchPosition ou cancelamento nativo.
Ao visualizar sugestão, provedor de tiles recebe o enquadramento antes da confirmação.

MapCanvas carrega Leaflet/configuração/tiles sob demanda, mantém retry e ResizeObserver;
ao reaparecer, invalida o tamanho. Falha mantém rascunho e permite confirmar sugestão
GPS disponível sem tiles. Sem mapa ou sugestão, cadastro novo aguarda recuperação,
sem ponto fabricado. Legado continua editável sem ponto. [ADR 0027](adr/0027-organizar-registro-em-etapas.md)
evolui a interação do ADR 0018, sem alterar banco ou mapa de exploração.

## Biblioteca, provedor e configuração

Decisão: [ADR 0018](adr/0018-localizar-relatos-com-leaflet.md).
Leaflet 1.9.4 usa BSD-2-Clause; a integração direta em effect com cleanup funciona
com React 19, TypeScript strict e Vite 6, sem wrapper com dependências de React.
O componente converte explicitamente `{latitude, longitude}` para
`[latitude, longitude]` na borda Leaflet. Não usa GeoJSON (que inverteria eixos).
O contrato global aceita polos; o mapa base usa projeção Web Mercator, que não
representa os polos. O cadastro por mapa não oferece entrada textual para extremos fora da projeção; as faixas globais da API permanecem.

`frontend/public/map-config.json` é JSON público validado com Zod em runtime:

- `center`: objeto latitude/longitude, somente enquadramento inicial;
- `zoom`: inteiro 0–19; ponto persistido abre com zoom 16;
- `tileUrl`: template HTTPS com `{z}`, `{x}`, `{y}`, sem usuário/senha;
- `attribution` e `attributionUrl`: texto e link HTTPS visíveis no mapa.
  Texto é escapado por DOM, nunca inserido como HTML livre.

O fallback usa Belo Jardim/PE (-8.336, -36.424), zoom 14, **sem definir geofence
ou restringir o município atendido**. É somente contexto visual, nunca ponto
salvo automaticamente. Centro conferido na sede do [mapa municipal do IBGE](https://geoftp.ibge.gov.br/cartas_e_mapas/mapas_para_fins_de_levantamentos_estatisticos/contagem_da_populacao_e_censo_agropecuario_2007/mapas_municipais_estatisticos/al/belo_jardim.pdf)
e no mapa renderizado; o [mapa municipal de 2022](https://geoftp.ibge.gov.br/cartas_e_mapas/mapas_municipais/colecao_de_mapas_municipais/2022/PE/belo_jardim/A0_2601706_MM.pdf)
também situa a sede nessa área. Ponto existente prevalece sobre o centro. Configuração inválida não fabrica posição e permite confirmação
textual. Não há chave, nova variável VITE, build arg ou segredo exigido.
O Vite copia public/ para dist/; Docker e empacotamento Vercel já incluem essa
saída. A publicação normal versiona o JSON e gera novo artefato; uma hospedagem
que substitua esse arquivo público pode trocar provedor sem alterar JavaScript.
`VITE_API_URL` continua pública, incorporada ao build e exige rebuild.
Nunca coloque segredos no JSON, em VITE_* ou URLs de tiles.

O provedor inicial é **OpenStreetMap Standard raster**, endpoint
`https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Dados OSM são ODbL e a cartografia
Standard é uma obra produzida sob ODbL; atribuição “© OpenStreetMap contributors” com link de licença
permanece visível. Leaflet mantém sua atribuição própria. Sem conta/chave ou
contratação, adequado à visualização interativa de baixo volume desta aplicação
acadêmica. Não há quota numérica garantida, SLA ou tiles gratuitos ilimitados.
Serviço pode bloquear acesso ou mudar política sem aviso. Crescimento exige
reavaliar provedor/capacidade/termos; configurar endpoint, atribuição e limites
compatíveis antes de trocar o serviço. Este componente usa raster XYZ até z19.

Requisições de tiles usam cache HTTP normal do navegador e Referer com política
`strict-origin-when-cross-origin`; não usam cliente Bearer da API. Não adicionar
cache-busting, prefetch, downloads/offline, proxy anônimo ou política de referência
que suprima Referer. `keepBuffer: 0` evita manter tiles fora da tela.
Não incluir texto de relato, identidade ou token em URL/popup/atribuição.
O provedor recebe IP, origem e tiles da área visualizada, permitindo inferir o
local consultado, inclusive após confirmar um ponto GPS. É um terceiro sujeito
à [política de privacidade OSMF](https://osmfoundation.org/wiki/Privacy_Policy).

Fontes oficiais verificadas para a decisão:
[Leaflet API 1.9.4](https://leafletjs.com/reference.html),
[distribuição](https://leafletjs.com/download.html),
[licença BSD-2-Clause](https://github.com/Leaflet/Leaflet/blob/v1.9.4/LICENSE),
[licença/atribuição OSM](https://www.openstreetmap.org/copyright),
[licença dos tiles como obra produzida](https://osmfoundation.org/wiki/Licence_and_Legal_FAQ),
[política dos tiles Standard](https://operations.osmfoundation.org/policies/tiles/).

## Integração e publicação

A criação obrigatória é mudança de contrato: coluna nullable **não** torna
clientes antigos compatíveis com o novo POST. Usar fase de publicação explícita:

1. Publicar primeiro o frontend com seletor, schema que tolera ausência de ambos
   os campos e envio de coordenadas. A API anterior ignora partes extras; nesta
   fase ela **não persiste** localização, portanto não anunciar a entrega como
   disponível. Respostas antigas de edição não comprovam persistência do ponto.
2. No corte final, aplicar V9 e publicar API exigindo coordenadas na criação.
   Manter o fluxo manual Render/GitLab; não alterar histórico Flyway aplicado.
3. Recarregar o frontend e validar cadastro/edição/leitura da mesma ocorrência.
   Bundles antigos em abas abertas recebem 400 ao cadastrar: precisam recarregar
   e confirmar um ponto. Não há perda silenciosa nem bypass pelo cliente. A
   mensagem antiga de validação pode ser genérica. Planejar aviso operacional
   e recarga das abas; não prometer atualização instantânea de bundles abertos.

API antiga pode continuar lendo banco V9 para rollback, mas voltaria a aceitar
novos relatos sem coordenadas: restaurar a API final antes de reabrir cadastro.
Não remover colunas/reverter dados. Se for necessário interromper cadastro no
corte, fazê-lo operacionalmente; não há mecanismo remoto de pausa criado aqui.
Nenhuma etapa deste guia executa deploy ou comprova pipeline/hospedagem remotos.

## Integração com as consultas (#44)

`MapCanvas` concentra a integração compartilhada de Leaflet/provedor; `LocationMap`
continua sendo o seletor do formulário. `OccurrenceMap` acrescenta visualização de
pontos, grupos e pinos canônicos React/TypeScript. GeographicPoint/pointSchema e
campos dos DTOs preservam unidades/eixos e ausência null. A #44 não altera a
escrita ou preenche legado. Fonte dos pinos, contrato completo de marcadores e
tratamento de ausência: [mapas nas consultas](occurrence-maps.md).

## Roteiro de teste local

O [roteiro do Wizard](report-wizard.md#roteiro-de-homologação) cobre GPS automático
único, retries voluntários, pontos/sugestões, falhas de tiles, escolha por mapa e
teclado, navegação preservada e publicação. Usar posições/mídias fictícias localmente,
sem consumo de provedor remoto nos testes. Contratos backend WGS84 permanecem
verificados por suas suítes; esta evolução é frontend, sem migration nova.
