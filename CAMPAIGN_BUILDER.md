# Construtor de campanhas Meta

## Objetivo

O construtor deve aceitar estruturas variáveis. A quantidade de conjuntos e anúncios nunca é fixa:

```text
campanha
├── conjunto A → anúncios 1, 2 e 3
├── conjunto B → anúncios 1 e 4
└── conjunto C → sem anúncio por enquanto
```

Cada modelo de anúncio guarda os IDs internos dos conjuntos aos quais pertence. Antes da publicação, a estrutura é materializada e cada anúncio recebe o nome correspondente ao seu conjunto.

## Fluxo de dados

1. O nicho fornece um identificador estável, países sugeridos e URLs relacionadas.
2. A campanha define objetivo, destino, status, categoria especial, CBO e limite de gasto.
3. Cada conjunto mantém orçamento, público, posicionamentos, otimização, lance, período e pixel próprios.
4. Cada anúncio escolhe um ou mais conjuntos, página, conta do Instagram, criativo, texto, CTA e rastreamento.
5. A revisão mostra a árvore exata que será enviada.
6. A publicação usa um `request_id` idempotente e registra a execução em `campaign_creation_runs`.
7. Os objetos devolvidos são lidos novamente na Meta antes da confirmação visual.

## Rastreamento

Anúncios diretos para o site usam o campo `url_tags` da Meta, separado da URL base:

```text
utm_source={{site_source_name}}
utm_medium=paid_social
utm_campaign={{campaign.id}}
utm_term={{adset.id}}
utm_content={{ad.id}}
placement={{placement}}
```

Os IDs são a chave estável. Nomes podem mudar sem quebrar a atribuição.

As UTMs do Evo/Messenger são outro contrato e não devem ser substituídas pelo padrão de site:

```text
utm_source={{entry.source}}
utm_medium=messenger
utm_campaign={{entry.source_key}}
utm_content={{entry.ad_id}}
utm_term={{entry.lead_id}}
ml_page={{entry.page_id}}
user={{contact.user}}
```

## Matriz de suporte

| Destino | Estado | Observação |
| --- | --- | --- |
| Site | Disponível | Imagem ou vídeo, URL base e `url_tags` separados. |
| Messenger | Bloqueado até adaptador | Não reutilizar o payload de site. A Meta descontinuou na API v24 a criação por terceiros de Click-to-Messenger Lead Gen; outros fluxos de mensagem precisam de validação específica. |
| Instagram Direct | Bloqueado até adaptador | Exige ativo e criativo compatíveis com Direct. |
| WhatsApp | Bloqueado até adaptador | Exige identidade/número elegível e payload próprio. |
| Formulário instantâneo | Bloqueado até adaptador | Exige formulário e `promoted_object` próprios. |
| Aplicativo | Bloqueado até adaptador | Exige app, loja e evento de otimização. |

Não se deve habilitar uma opção enquanto os campos obrigatórios, a validação e a verificação pós-criação daquele destino não estiverem implementados.

## Segurança operacional

- Publicações repetidas com o mesmo `request_id` não criam cópias.
- Campanha, conjuntos e anúncios são criados com concorrência limitada.
- Duplicações existentes permanecem pausadas e preservam o rastreamento original.
- Trocar nicho, objetivo ou destino após montar a estrutura pede confirmação e limpa os itens incompatíveis.
- O banco registra os estados `PUBLISHING`, `CAMPAIGN_CREATED`, `ADSETS_CREATED`, `ADSETS_PARTIAL`, `VERIFIED`, `CREATED_UNVERIFIED`, `PARTIAL` ou `FAILED`.
- O limite operacional por publicação é 50 conjuntos e 200 anúncios materializados para impedir envios acidentais.

## Referência da versão

O backend usa a Marketing API `v24.0`. Antes de implementar um novo adaptador, conferir a versão e o changelog do [Meta Business SDK](https://github.com/facebook/facebook-python-business-sdk/releases), porque objetivos, destinos e combinações de otimização mudam entre versões.
