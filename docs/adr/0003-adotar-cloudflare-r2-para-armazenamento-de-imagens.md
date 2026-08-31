# ADR 0003: Adotar Cloudflare R2 para armazenamento de imagens

- Status: aceito
- Data: 2026-08-30

## Contexto

Cada ocorrência terá uma fotografia, possivelmente sensível, com tamanho muito
maior que os demais dados do domínio. O arquivo precisa sobreviver à recriação
do backend e não deve ocupar seu filesystem efêmero. O PostgreSQL deve guardar
somente uma referência estável, não os bytes nem uma URL permanente do provedor.

A Sprint 1 precisa provar essa integração sem antecipar a entidade `Occurrence`,
autenticação ou uma tabela apenas para uploads técnicos. Os testes também não
podem depender de internet ou credenciais reais.

## Decisão

- Utilizar um bucket privado no Cloudflare R2 para armazenar imagens.
- Acessar o R2 por sua API compatível com S3 e pelo AWS SDK for Java v2, com
  endpoint, região, bucket e credenciais fornecidos pelo ambiente.
- Isolar o SDK no adaptador `R2ImageStorage`, que implementa a interface interna
  `ImageStorage`. Controllers e funcionalidades futuras dependem apenas da
  abstração.
- Usar a key como identidade canônica do objeto. Na prova técnica, o backend
  gera `proofs/{UUID}.{extensão-validada}` e expõe apenas o identificador
  `UUID.extensão` e uma rota da própria API.
- Recuperar objetos pelo backend; não habilitar acesso público, CDN, URL direta
  ou URL assinada nesta etapa.
- Validar MIME declarado, assinatura do conteúdo e limite exato de 5 MB antes
  do envio ao storage.
- Usar um fake da interface nos testes HTTP, sem contatar R2 ou internet.

## Consequências

- Imagens não são perdidas quando a instância do backend é reiniciada ou
  substituída.
- Credenciais precisam ter escopo mínimo no bucket privado e permanecer fora do
  Git.
- O provedor pode ser trocado por outro storage S3-compatible com impacto
  concentrado na infraestrutura.
- A recuperação mediada pelo backend mantém o bucket fechado, mas transfere os
  bytes pela aplicação e exigirá autorização quando usuários forem adicionados.
- A prova não cria migration nem relação de banco. A futura `Occurrence`
  persistirá a referência canônica dentro de sua própria modelagem.
- Remoção de EXIF, moderação, compressão, thumbnails e antivírus permanecem como
  decisões futuras.
