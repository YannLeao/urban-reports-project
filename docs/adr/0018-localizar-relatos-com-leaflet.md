# ADR 0018: Localizar relatos com Leaflet e coordenadas confirmadas

- Status: aceito para implementação; implantação depende de validação operacional
- Data: 2026-10-15

## Contexto

A #43 antecipa o mapa do planejamento de produto para a Sprint 3. Referência
textual continua útil, mas não permite posicionar confiavelmente uma ocorrência.
Não existe biblioteca cartográfica, área oficial de atendimento ou consulta
espacial na base. A #44 implementará a visualização das consultas em mapas.

## Decisão

Usar Leaflet 1.9.4 (BSD-2-Clause) diretamente em effects React 19, com cleanup e
importação dinâmica, sem wrapper React. Provedor separado: tiles raster Standard
OpenStreetMap via HTTPS, sem credencial, para visualização interativa de baixo
volume, com atribuição visível e cache HTTP padrão. Configuração pública em
map-config.json permite substituir provedor/enquadramento sem alterar o módulo.
Não criar conta, geocodificação ou infraestrutura de tiles.

Persistir WGS84 em double precision, com nomes latitude/longitude, CHECK de par
completo/faixas e nulabilidade exclusiva para compatibilidade de legado. Não
preencher centro de mapa, bairro, EXIF ou GPS automaticamente. Novo POST exige
par válido; PUT mantém posição por omissão e rejeita limpeza. Lock/If-Match,
status Pendente, autoria e journal existentes continuam protegendo a escrita.

O seletor confirma clique ou par textual validado, com alternativa acessível por
teclado. GPS é opt-in e apenas sugere até confirmação. Falha de mapa permite
confirmação textual sem fabricar dado. Biblioteca e provedor não recebem texto
de relato ou credencial da API.

## Consequências

OSM Standard não garante SLA ou capacidade ilimitada; prefetch e offline são
proibidos. Provedor recebe IP/origem/viewport; precisa ser reavaliado com uso e
política. Dados OSM são ODbL; tiles Standard são uma obra produzida sob ODbL. GPS tem precisão
estimada. Mercator não representa polos, embora contrato global aceite extremos.

Legado permanece sem coordenadas e acessível pela lista. Migração aditiva não
resolve a quebra do POST antigo: publicar frontend compatível antes da API final,
exigir recarga de abas antigas e validar round-trip após o corte. Não manter
aceitação permanente de cadastro novo sem ponto. Não implementar consulta de
marcadores nem pinos personalizados antecipadamente.

Configuração, fontes oficiais, restrições do provedor, contratos, publicação e
roteiro estão no [guia de localização](../occurrence-location.md).
