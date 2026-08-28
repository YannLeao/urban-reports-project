# ADR 0001: Adotar monorepositório

- Status: aceito
- Data: 2026-08-27

## Contexto

O produto possui frontend, backend, banco e automações de entrega que evoluem em
cards separados, mas precisam ser testados e demonstrados de forma integrada. A
equipe também precisa manter issues e Merge Requests no GitLab conforme as
exigências da disciplina.

## Decisão

Manter frontend, backend, documentação e infraestrutura em um único repositório,
com limites explícitos entre os diretórios. Arquivos que coordenam o projeto
inteiro, como `compose.yaml` e `.gitlab-ci.yml`, ficam na raiz; seus componentes
auxiliares ficam em `infrastructure/`.

## Consequências

- Uma Merge Request pode atualizar, de forma atômica, contratos entre serviços.
- O pipeline poderá executar somente as verificações relevantes sem perder uma
  visão integrada do produto.
- A equipe deve evitar acoplamento indevido entre diretórios e manter cada card
  pequeno, ainda que todos os serviços compartilhem o mesmo repositório.

