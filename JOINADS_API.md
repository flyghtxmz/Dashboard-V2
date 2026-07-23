# Entendimento da API JoinAds no Dashboard

Atualizado em: 2026-07-20

Este documento registra o que o Dashboard entende dos campos financeiros da JoinAds, quais endpoints utiliza e quais pontos ainda precisam de confirmação formal da JoinAds.

## Regra financeira adotada

| Campo da API | Interpretação adotada | Uso no Dashboard |
| --- | --- | --- |
| `revenue` / `earnings` | Receita bruta, antes do revshare | Auditoria e comparação; não deve alimentar ROAS ou lucro |
| `revenue_client` / `earnings_client` | Receita pertencente ao cliente, depois do revshare da JoinAds | Receita oficial, ROAS e lucro operacional |
| `ecpm` | eCPM bruto, antes do revshare | Diagnóstico |
| `ecpm_client` | eCPM do cliente, depois do revshare | Métricas financeiras do cliente |
| `revshare` | Percentual/indicador de divisão informado pela JoinAds | Informativo; o Dashboard não reaplica esse percentual |

No contexto desta integração, **“Receita (com Revshare)” é entendida como receita já calculada com o revshare**, ou seja, a parcela líquida do cliente. A expressão é ambígua; na interface deve-se preferir **“Receita cliente (após revshare JoinAds)”**.

## Regra contra desconto duplicado

O Dashboard não deve calcular novamente o revshare sobre `revenue_client` ou `earnings_client`.

O cálculo financeiro correto é:

```text
receita_cliente_brl = receita_cliente_usd × câmbio
ROAS = receita_cliente_brl ÷ custo_total_tributado_Meta
lucro_operacional = receita_cliente_brl - custo_total_tributado_Meta
```

Não existe nesta fórmula uma nova multiplicação por `(1 - revshare)`.

Se o campo cliente estiver ausente, o Dashboard deve usar zero/sinalizar dado ausente. Ele não deve substituir silenciosamente pelo campo bruto, pois isso poderia inflar receita, ROAS e lucro.

Quando o mesmo anúncio aparecer simultaneamente nos relatórios `utm_campaign=src_` e `utm_content`, a atribuição persistida por `src_` tem precedência. O relatório por `utm_content` funciona apenas como fallback; os dois valores nunca devem ser somados entre si.

## Endpoints utilizados

### `GET /earnings`

Usado para totais diários do domínio: receita, impressões, cliques, eCPM e visibilidade. Este endpoint existe na implementação, mas sua especificação completa não foi fornecida no briefing da JoinAds. É necessário solicitar a documentação oficial dele.

### `GET /key-value`

Usado para atribuição por chave, especialmente `utm_campaign`. Com `report_type=Analytical`, espera-se receber linhas separadas por `ad_unit` e os pares `earnings`/`earnings_client`, `ecpm`/`ecpm_client`.

### `GET /key-value-country`

Usado para atribuição por `utm_campaign`, país e bloco. O Dashboard envia `report_type=Analytical` para preservar o `ad_unit`.

### `POST /super-filter`

Usado para reconciliação por `utm_campaign`, `utm_content`, `utm_source`, `utm_medium` e `utm_term`. A resposta documentada possui `revenue` e `revenue_client`, além de `revshare`.

### `GET /report/advertiser/campaign`

Usado somente para diagnóstico de anunciantes. A resposta possui `AD_EXCHANGE_LINE_ITEM_LEVEL_REVENUE`, mas não possui um campo `_CLIENT`. Até confirmação formal da JoinAds, esse valor deve ser considerado possivelmente bruto e não deve alimentar ROAS ou lucro.

## Cache e atualização

O cache diário do backend existe para evitar consultar novamente dias históricos consolidados.

- O dia atual continua sendo consultado na JoinAds.
- Se uma consulta ao vivo retornar vazia ou falhar depois de já existir um resultado positivo para o mesmo dia, o Dashboard preserva provisoriamente o último resultado válido daquele dia. Esse fallback nunca cruza datas e aparece nos diagnósticos.
- O dia anterior é provisório até aproximadamente 10h no horário de São Paulo.
- Depois da atualização posterior às 10h, o dia anterior pode ser consolidado no banco.
- Dias históricos consolidados podem ser lidos do banco.
- A interface não deve aplicar um snapshot antigo ao clicar em **Carregar dados**. Ela mantém os dados atuais visíveis e troca o conjunto somente quando a nova consulta termina.
- Uma cotação USD/BRL armazenada só pode ser reutilizada para a mesma data de referência. Uma cotação de outra data não deve recalcular temporariamente ROAS ou lucro.

Essa separação é importante: armazenamento diário consolidado não é o mesmo que exibir temporariamente um snapshot antigo na tela.

## Pontos ainda não confirmados pela JoinAds

1. Confirmação textual de que `revenue_client` e `earnings_client` são exatamente o valor a receber após todos os descontos da JoinAds.
2. Definição precisa de `revshare`: percentual da JoinAds, percentual do cliente ou apenas metadado do contrato.
3. Motivo de exemplos em que `revenue_client` não corresponde aritmeticamente ao `revshare` informado.
4. Natureza bruta ou líquida de `AD_EXCHANGE_LINE_ITEM_LEVEL_REVENUE` no relatório de anunciantes.
5. Documentação completa do endpoint `/earnings`.
6. Garantia de que `ad_unit` sempre é retornado nos relatórios `Analytical` por key value.

## Pergunta recomendada para a JoinAds

> Podem confirmar formalmente se `revenue_client`/`earnings_client` representam o valor líquido pertencente ao cliente, já após a aplicação integral do revshare, e se esse é o valor que será considerado no pagamento? Podem também explicar a fórmula entre `revenue`, `revenue_client` e `revshare`, além de informar se `AD_EXCHANGE_LINE_ITEM_LEVEL_REVENUE` é bruto ou líquido?
