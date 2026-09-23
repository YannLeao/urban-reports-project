# Prova local de seleção e captura de imagem — #17

`/prova-imagem` apresenta **Teste de fotografia**, com acesso discreto na entrada.
A rota integra o build de produção para permitir prova física por HTTPS. É
transitória: reavaliar sua remoção na integração de #36/#37, somente depois de
registrar as evidências desta entrega. O catálogo `/dev/design-system` continua
restrito ao desenvolvimento.

## Contrato e reutilização

`frontend/src/features/image/ImagePicker.tsx` exporta `ImagePicker` e
`ImagePickerProps`: `value: File | null`, `onChange: (file: File | null) => void`.
O consumidor mantém a única fonte de verdade do arquivo e limpa com `null`.
Exemplo:

```tsx
const [image, setImage] = useState<File | null>(null)
<ImagePicker value={image} onChange={setImage} />
```

A página mantém esse estado somente enquanto montada. Sair/atualizar perde a
seleção. O módulo não conhece rotas, API, autenticação, ocorrência ou storage;
não envia arquivos nem usa armazenamento persistente. Na #36, o formulário
poderá consumir o File e implementar seu contrato de envio/validação backend.
Na #37, validar câmera e preservação dos demais campos no formulário integrado.

`image-file.ts` centraliza JPEG (`image/jpeg`), PNG (`image/png`), WebP
(`image/webp`) e **5 × 1024 × 1024 = 5.242.880 bytes (5 MiB)**, alinhados a
`ImageStorageService`/`ImageFormat` do backend. Rejeita arquivo vazio, MIME
vazio/desconhecido, HEIC/HEIF e tamanho acima do limite, sem inferir pela extensão,
converter ou comprimir. `accept` é apenas orientação do seletor. O carregamento
por `Image` verifica que o navegador consegue decodificar dimensões não nulas;
não é validação de segurança completa e não substitui o backend. Nenhum metadado
pessoal é lido/exibido; não há remoção de EXIF nem promessa de anonimização.

Uma tentativa inválida explica o motivo e mantém a imagem anterior. Cancelamento
sem arquivo não modifica estado nem gera mensagem. O input é limpo imediatamente
após capturar o File, permitindo reescolha do mesmo arquivo. Durante a validação,
os seletores ficam desabilitados; remover continua disponível e cancela a leitura.
AbortController impede que leituras antigas aceitem arquivos após troca, remoção,
reset externo ou desmontagem. A URL temporária de validação é liberada em sucesso,
erro ou cancelamento. A prévia possui outra URL, com cleanup em troca/remoção/
desmontagem, incluindo remontagem de efeitos em StrictMode, sem revogar a URL
exibida durante a validação da próxima escolha.

A prévia usa `object-fit: contain`, preservando enquadramento. Botões/feedback,
foco, espaçamento e cores reutilizam o design system. Nomes acessíveis e textos
associados orientam os controles; erro usa alert e validação usa status. Após
remover, o foco retorna a Escolher imagem.

## Câmera e limites

Há dois inputs nativos, sem `multiple`: arquivo sem capture e câmera com
`capture="environment"`, ambos com os MIME aceitos. Os botões acionam os inputs
sincronamente por interação do usuário. A câmera traseira é uma preferência;
o navegador/sistema pode abrir um seletor de arquivo. Não há detecção de user
agent, getUserMedia, streaming ou SDK. A alternativa de arquivo fica disponível
em todos os dispositivos (desabilitada apenas durante uma validação em andamento).
Não se infere permissão negada quando não chega arquivo.

A indicação de câmera e suas limitações seguem a
[referência MDN de capture](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture).
O uso e descarte das URLs locais seguem a
[File API](https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications).
Compatibilidade deve ser demonstrada por aparelho, sem alegar suporte universal.

## Evidências locais — 23/09/2026

Base: `e70cfa6` (main); implementação na branch `feature/image-selection-proof`.
Implementação registrada em `a9e2c5c` (componente/testes) e `4515707`
(página/integração). Sem deployment nesta sessão. Node 22.23.2 e pnpm 10.34.5 efetivamente utilizados.

- Instalação frozen/offline aprovada, sem mudança de lockfile.
- Lint, typecheck, tokens:check (também no build) e build aprovados.
- `pnpm test`: 4 arquivos de testes Node e 43 casos Vitest aprovados. Inclui
  health/navegação existentes e 16 casos novos de regra/componente/rota.
- Casos cobrem limite exato e +1 byte, tipos, MIME ausente, arquivo vazio,
  decodificação inválida, seleção/troca/remoção/reescolha, cancelamento, erros
  preservando seleção, corridas assíncronas, reset, desmontagem, StrictMode,
  descarte de URLs e atributos/acionamento dos inputs. A rota funciona sem
  configuração de API e não chama fetch ao selecionar ou navegar.
- Mocks jsdom de Image/object URLs não comprovam decodificação real nem câmera.
  A inspeção de navegador é registrada abaixo, separadamente.
- Backend não alterado: suíte backend não executada. CI/deploy não alterados;
  testes existentes de build, pacote prebuilt e deploy continuam aprovados.

O primeiro lint encontrou alias de `this` no mock de teste, corrigido antes da
rodada aprovada. O build mantém os avisos preexistentes de comentários PURE do
Zod descartados pelo Rollup. Porta local/Chrome precisaram de execução autorizada
fora do sandbox. Isso não representa deploy.

### Inspeção do build em navegador

Chrome 153.0.8010.52 headless no Linux, em `http://127.0.0.1:5185/prova-imagem`,
com Playwright Core já disponível no ambiente (nenhuma dependência adicionada):

- PNGs sintéticos sem dados pessoais realmente decodificados; retrato 120×240 e
  paisagem 240×120, prévia inteira e troca confirmadas pelas dimensões naturais.
- Seleção, troca, cancelamento por ausência de arquivo, rejeição de PNG corrompido
  preservando prévia, remoção e reescolha aprovadas.
- Acionamento do seletor por Enter, remoção por teclado e retorno de foco visível
  aprovados. No desktop, Tirar outra foto abriu um seletor de arquivo; escolha
  alternativa funcionou. Isso não comprova captura de câmera.
- 360 e 1280 px, nome longo, erro e texto ampliado a 200% sem overflow horizontal.
  Capturas de erro mobile e paisagem desktop inspecionadas visualmente.
- Refresh perdeu seleção; rota de prova presente no build; catálogo dev respondeu
  com a página de não encontrado. Nenhum erro JavaScript, chamada de API ou
  requisição de upload observado durante os casos.
- Capturas locais anexáveis em `temp/sprint-2/evidence-17/`; devem acompanhar a MR,
  pois temp não é versionado. Fixtures geométricas não são fotografias de câmera.

Zoom **nativo** 200%, diálogo/cancelamento manual do sistema, tecnologia assistiva,
câmera física e HTTPS publicado permanecem pendentes. Injeção de arquivo e
ampliação de texto não equivalem a esses aceites. `git diff --check` aprovado.

## Roteiro físico obrigatório e registro pendente

Após revisão/merge normal e pipeline verde, publicar pelo job manual existente
`frontend:deploy`, seguindo [deploy frontend](frontend-deployment.md). Não fazer
merge automático, deploy paralelo ou publicar artefato local de teste. Registrar
SHA, pipeline, job, deployment e URL HTTPS pública.

1. Abrir `/prova-imagem` em aparelho físico e selecionar uma foto da galeria.
2. Conferir prévia, trocar por outra e cancelar uma nova escolha: preservar a
   anterior, sem falso aviso de erro/sucesso.
3. Abrir Tirar foto/Tirar outra foto, fotografar um objeto sem dados pessoais,
   confirmar e conferir a imagem. Registrar se abriu câmera, opções e orientação.
4. Repetir e cancelar captura conforme as opções do sistema. Não interpretar
   ausência de arquivo como diagnóstico de permissão.
5. Remover, selecionar o mesmo arquivo e recuperar após uma escolha inválida.
   Conferir erro acima de 5 MiB e HEIC/HEIF/MIME vazio, se ocorrerem. Uma rejeição
   não conta como captura válida; registrar para #37, sem conversão silenciosa.
6. Conferir retrato/paisagem, foco, 360 px, zoom nativo 200% e textos longos.
7. Confirmar no Network que não houve upload (assets normais não são upload).
   Atualizar/sair e confirmar perda da seleção.
8. Anexar captura/gravação sem dados pessoais à MR; preencher a tabela abaixo.
   Uma captura válida em aparelho compatível mais alternativa em navegador sem
   câmera é suficiente. Emulação de viewport não substitui aparelho físico.

| Campo | Registro físico |
| --- | --- |
| Data e responsável | Pendente |
| Commit / pipeline / job | Pendente |
| Deployment e URL HTTPS `/prova-imagem` | Pendente |
| Modelo do aparelho | Pendente — nenhum aparelho disponível nesta execução |
| Sistema e versão | Pendente |
| Navegador e versão | Pendente |
| Seleção / troca / cancelamento / remoção / recuperação | Pendente |
| Captura válida / repetição / cancelamento / orientação | Pendente |
| Formato/tamanho devolvidos e limitações | Pendente |
| Ausência de upload / evidência anexada | Pendente |

**Aceite completo de #17 pendente** de publicação e prova física. Manter
`Refs #17` e `Refs #29`; não fechar #29 com esta implementação local.

## Síntese R00 / #29

Esta síntese distingue código integrado e registros locais anteriores de prova
remota. Não houve repetição das suítes de outros cards nem verificação de seu
estado remoto nesta entrega. Registros locais anteriores foram consultados e
seus resultados resumidos aqui para não depender de arquivos ignorados.

| Entrega | Evidência disponível | Pendência / destino |
| --- | --- | --- |
| AGENTS | Instruções integradas na raiz, com ferramentas, segurança, validação e entrega; acompanhando a base atual | Revisão agregadora em #29 |
| #32 | Guia frontend/ADR 0005 e base integrada; relato de 22/09 registra instalação limpa frozen, 19 Vitest, lint/tipos/build e inspeção Chrome/Nginx local aprovados | Resultado remoto não revalidado; integração pública acompanhada na #30 |
| #30 | ADR 0006 e pipeline Vercel manual/prebuilt integrados; relato local registra lint/tipos/build/pacote e testes aprovados | Registrar pipeline/deploy, HTTPS público, refresh/assets, API/CORS reais e destino do Pages antigo em #30 |
| #31 | ADR 0007 e perfis integrados; relato local registra 26 testes backend com PostgreSQL 17 e HTTP nos três contextos, sem falhas | Comprovar Swagger/OpenAPI desabilitados e health real no Render em #31; não inferir produção pela configuração |
| #33 | ADR 0008, tokens/componentes integrados; relato de 22/09 registra 27 Vitest, build/Docker, contrastes e inspeção Chrome em 360/1280 px | Zoom nativo 200%, revisão/pipeline e evidência remota ainda não comprovados nos registros consultados; acompanhar #33 |
| #17 | Implementação e verificações locais descritas neste guia | Publicação HTTPS e captura física obrigatórias antes do fechamento |

Compose usa `postgres:16-alpine`; README e Testcontainers usam PostgreSQL 17.
A divergência permanece: **#29 deve acompanhar a decisão de alinhamento em uma
MR própria de infraestrutura/banco**, com versão alvo, compatibilidade e plano
para dados/volumes existentes, antes de concluir a revisão de coerência de R00.
Nenhum card adicional foi criado nem número inventado; #29 é o destino explícito
até a equipe desmembrá-lo. Esta MR não altera banco, migrations ou volumes.
As evidências públicas de #30/#31, zoom de #33 e física de #17 também impedem
concluir R00 pelos registros disponíveis.
