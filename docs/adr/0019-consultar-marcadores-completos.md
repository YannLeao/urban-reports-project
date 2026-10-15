# ADR 0019: Consultar marcadores completos com projeções compactas

- Status: aceito para implementação; aceite operacional depende de validação
- Data: 2026-10-15
- Evolui: ADR 0018

## Contexto

A #44 exige mapas nas consultas e detalhes sobre as coordenadas da #43. Os cards
públicos são paginados, enquanto o mapa deve alcançar o universo completo. Não
há volume medido que justifique PostGIS, viewport/cursor ou infraestrutura extra.

## Decisão

Adicionar endpoints públicos e próprios de marcadores, retornando todas as
projeções compactas elegíveis sem paginação/limite oculto. Uma instrução PostgreSQL
projeta os campos do mapa e calcula-se total/localizados/sem posição sobre esse
mesmo resultado, sob snapshot da instrução. Preservar elegibilidade pública
`status <> REJECTED`, autoria da sessão no privado e ausência do legado.
Não publicar identidade, versão, storage, descrição ou histórico.

Extrair MapCanvas da integração existente para reutilizar biblioteca/provedor,
configuração, acessibilidade, falhas e atribuição. OccurrenceMap exibe os pontos
sem editar. Preservar viewport na URL; atualização não recentraliza. Agrupar por
proximidade em pixels no zoom atual, com contagem e seleção textual integral,
resolvendo coordenadas idênticas sem plugin extra. Cards continuam independentes.

Converter SVGs fornecidos em um componente React/TypeScript canônico com mapa
exaustivo das categorias e tokens existentes. Usar renderToStaticMarkup como
adaptador seguro de DivIcon, sem dados livres no HTML e sem raízes React por pino.
O adaptador também carrega sob demanda. Não manter cópias SVG manuais em docs.

## Consequências

Há custo O(n) de projeções/resposta/alternativa textual, adequado à versão
acadêmica, sem promessa de escala ilimitada. Crescimento exige medir e evoluir
contrato explícito de completude/abrangência antes de limitar resultados.
Contagens/lista/detalhe de requisições distintas podem mudar com concorrência.

Agrupamento é apresentação, não geografia persistida. Legado permanece na lista.
Viewport de navegação em URL pode aparecer no histórico local. Sem polling/GPS,
fotos por marcador, seed de demonstração, categorias novas ou mapa administrativo.
Publicar endpoints aditivos após #43 e antes do novo frontend; nenhuma implantação
é presumida pela configuração. Provedor continua com os limites do ADR0018.

Contrato, fontes canônicas, mapeamento, limites e roteiro:
[mapas de consultas](../occurrence-maps.md).
Referências oficiais: [DivIcon/Leaflet](https://leafletjs.com/reference.html#divicon)
e [renderToStaticMarkup/React](https://react.dev/reference/react-dom/server/renderToStaticMarkup).
