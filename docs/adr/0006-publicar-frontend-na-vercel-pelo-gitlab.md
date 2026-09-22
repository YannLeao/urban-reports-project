# ADR 0006: Publicar o frontend na Vercel pelo GitLab CI

- Status: aceito
- Data: 2026-09-22

## Contexto

A base frontend usa BrowserRouter e precisa servir páginas diretamente por
HTTPS, incluindo refresh de `/status`. A publicação Pages existente usa base
relativa e não possui evidência de fallback SPA e integração pública com a API.
A #30 define a migração de hospedagem mantendo GitLab como controle de entrega.

## Decisão

Hospedar somente o frontend estático na Vercel, na raiz do domínio padrão.
Backend, banco e imagens permanecem no Render, Neon e R2. GitLab produz o bundle
com Node/pnpm fixados, testa e publica o mesmo artefato pelo job manual da branch
padrão protegida. Vercel CLI tem versão exata no lockfile.

Empacotar `dist` em Build Output API v3 e publicar com `--prebuilt --prod`, sem
recompilar no deploy. A saída contém o roteamento: arquivos existentes primeiro,
404 para assets ausentes e fallback HTML para páginas. GitLab fornece a URL
HTTPS da API durante o build; não há configuração concorrente na Vercel.

Não conectar deploy automático pela integração Git, não criar previews
automáticos, proxy/BFF ou funções. CORS permite a origem canônica exata pelo
contrato existente do backend. Publicações são serializadas e rastreadas por
commit, ref e pipeline; proteção contra jobs antigos deve ser habilitada no
GitLab. Rollback é deliberado, pelo mecanismo disponível na conta ou revert
revisado com novo pipeline.

## Alternativas

Manter Pages exigiria outra solução e comprovação do fallback público. Upload
de código para build remoto na Vercel não publicaria o artefato já validado.
Deploy automático pela integração Git criaria uma segunda autoridade de
publicação. Previews exigiriam política própria de acesso/CORS, fora do escopo.

## Consequências

A publicação exige projeto Vercel, token protegido e configuração externa de
origens/domínios. A CLI adiciona dependências de desenvolvimento. O artefato
expira: nova publicação após expiração exige novo pipeline validado. Caminhos
com extensão ficam reservados a arquivos. Alterar API URL exige recompilar.

A implementação local não comprova disponibilidade pública, plano/permissões ou
CORS real; a primeira publicação ocorre após revisão e merge. O job Pages deixa
de publicar; o site remanescente só será desativado após a validação Vercel.
O ADR 0005 preserva o histórico da base anterior. Operação e critérios de aceite
estão no [guia de deploy frontend](../frontend-deployment.md).
