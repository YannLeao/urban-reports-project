# Como contribuir

## Antes de iniciar

1. Escolha uma issue pronta na milestone atual e atribua-se a ela.
2. Confirme critérios de aceite, dependências e revisor.
3. Mova a issue para `status::doing`.
4. Atualize sua branch local a partir da `main`.

## Branches

Use nomes em inglês no formato `<tipo>/<descrição-curta>`:

- `feature/` para funcionalidade percebida por usuário;
- `chore/` para configuração, infraestrutura e manutenção;
- `fix/` para correções;
- `docs/` para documentação.

Não inclua identificadores internos de sprint no nome. A relação com o card deve
ser feita na Merge Request.

## Commits

Prefira commits pequenos, coerentes e escritos no imperativo. Use o padrão
Conventional Commits quando aplicável, por exemplo:

```text
chore: organize monorepo structure
feat: add public health endpoint
fix: reject unsupported image types
docs: document local database setup
```

## Merge Requests

- Abra uma Merge Request para toda alteração destinada à `main`.
- Relacione a issue com `Closes #<número>` na descrição.
- Preencha o template, inclua evidências e solicite ao menos uma revisão.
- Não faça merge com pipeline vermelho ou discussão pendente.
- Evite misturar cards ou mudanças sem relação na mesma Merge Request.

## Definição de conclusão

Uma entrega está concluída quando os critérios de aceite foram conferidos, as
verificações automatizadas passaram, documentação e migrations afetadas foram
atualizadas, nenhum segredo foi versionado e a Merge Request foi revisada.

