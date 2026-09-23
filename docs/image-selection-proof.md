# Seleção e captura local de imagem

`/prova-imagem` apresenta **Teste de fotografia**, com acesso discreto na entrada.
A rota integra o build de produção para permitir prova física por HTTPS. É
transitória: reavaliar sua remoção quando o componente integrar o formulário
de ocorrência. O catálogo `/dev/design-system` continua
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
não envia arquivos nem usa armazenamento persistente. O formulário de ocorrência pode consumir o File e implementar seu contrato de
envio/validação backend. Ao integrá-lo, validar a câmera e a preservação dos
demais campos.

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

## Verificação de regressão

Em `frontend/`, execute `pnpm test`, `pnpm lint`, `pnpm typecheck` e `pnpm build`.
Os testes cobrem validação, cancelamento, preservação da imagem anterior,
resultados assíncronos antigos, cleanup de URLs, StrictMode e navegação sem API.
Mocks jsdom de Image/object URLs não comprovam decodificação real nem câmera.

No navegador e em aparelho físico compatível:

1. Abrir `/prova-imagem`, escolher uma imagem e conferir a prévia inteira.
2. Trocar, cancelar e tentar arquivo inválido: preservar a anterior quando não
   houver uma nova escolha válida. Conferir limite, arquivo vazio e MIME inválido.
3. Acionar Tirar foto, confirmar uma fotografia sem dados pessoais e conferir
   formato/orientação. Repetir e cancelar conforme as opções do sistema.
4. Remover, reescolher o mesmo arquivo e conferir o foco. Testar teclado, viewport
   estreita, zoom 200%, nomes longos e mensagens de erro.
5. Conferir ausência de upload no Network; atualizar/sair deve perder a seleção.

Registrar resultados na MR/issue, incluindo versão da aplicação, URL, aparelho,
sistema e navegador. Emulação de viewport não substitui câmera física; arquivo
HEIC/HEIF rejeitado não conta como captura válida. O guia descreve o contrato e o
roteiro recorrente; resultados de uma entrega pertencem à MR correspondente.
