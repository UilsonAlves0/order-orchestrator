# Order Orchestrator

API NestJS para receber pedidos via webhook, enfileirar processamento assíncrono (BullMQ), enriquecer dados com APIs externas e consultar o estado dos pedidos.

## Sumário

- [Visão geral](#visão-geral)
- [Stack](#stack)
- [Arquitetura](#arquitetura)
- [Fluxo do pedido](#fluxo-do-pedido)
- [Pré-requisitos](#pré-requisitos)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Subir com Docker](#subir-com-docker)
- [Rodar localmente (sem Docker da API)](#rodar-localmente-sem-docker-da-api)
- [Endpoints](#endpoints)
- [Payload do webhook](#payload-do-webhook)
- [Status do pedido](#status-do-pedido)
- [Filas e retries](#filas-e-retries)
- [Integrações externas](#integrações-externas)
- [Ferramentas auxiliares](#ferramentas-auxiliares)
- [Testes](#testes)
- [Logs](#logs)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Troubleshooting](#troubleshooting)

## Visão geral

O sistema atende ao desafio de **Orquestrador de Pedidos**:

1. Recebe pedidos em `POST /webhooks/orders`
2. Valida o payload e garante idempotência
3. Enfileira o processamento (BullMQ + Redis)
4. Persiste o pedido com status `RECEIVED`
5. Enriquece com câmbio (Frankfurter) e, opcionalmente, CEP (ViaCEP)
6. Em falha definitiva: retry com backoff → DLQ → status `FAILED_ENRICHMENT`
7. Expõe consultas em `/orders` e painel da fila em `/queue/metrics`

## Stack

| Camada | Tecnologia |
| --- | --- |
| API | NestJS 11 + TypeScript |
| Filas | BullMQ + Redis |
| Banco | MongoDB (Mongoose) |
| Painel de filas | Bull Board (`/queue/metrics`) |
| Integrações | Frankfurter (câmbio), ViaCEP (endereço) |
| Infra local | Docker Compose |

## Arquitetura

```
HTTP → OrderProcessorController
         ↓
   ReceiveOrderUseCase  → Redis (idempotência) → BullMQ (order-processor)
                                                      ↓
                                            OrderProcessorWorker
                                                      ↓
                                            ProcessOrderUseCase
                                 ┌────────────────────┼────────────────────┐
                                 ↓                    ↓                    ↓
                           OrdersService         ViaCEP (opc.)       Frankfurter
                              MongoDB
```

Padrões usados:

- **Controller → Use Case → Service**
- **Fila assíncrona** para não bloquear o webhook
- **Idempotência** por `idempotency_key` (Redis `SET NX` + `jobId` estável)
- **Lock Redis** durante o processamento do pedido
- **DLQ** para falhas finais

## Fluxo do pedido

1. **Receive (rápido)**  
   Valida DTO → reivindica `idempotency_key` no Redis → enfileira → `202 Accepted`.

2. **Worker**  
   Cria o pedido no Mongo (`RECEIVED`) se ainda não existir → enriquece → atualiza o documento.

3. **Falha**  
   Até 3 tentativas com backoff exponencial. Na última: marca `FAILED_ENRICHMENT` e envia para `order-processor-dlq`.

## Pré-requisitos

- Docker + Docker Compose **ou**
- Node.js 24+, MongoDB e Redis locais

## Variáveis de ambiente

O arquivo `.env` na raiz é usado pelo Compose e pela aplicação.

| Variável | Descrição | Exemplo local (Docker) |
| --- | --- | --- |
| `NODE_ENV` | Ambiente | `development` |
| `APP_PORT` | Porta da API | `3000` |
| `APP_CORS_ORIGINS` | Origens CORS | `*` |
| `DATABASE_USERNAME` | Usuário Mongo | `root` |
| `DATABASE_PASSWORD` | Senha Mongo | `secret` |
| `DATABASE_PORT` | Porta Mongo publicada | `27017` |
| `DATABASE_URL` | URI Mongoose | `mongodb://root:secret@mongo:27017/api?authSource=admin` |
| `WORKER_HOST` | Redis (BullMQ) | `redis://redis:6379/0` |
| `QUEUE_PREFIX` | Prefixo das chaves Bull | `order-orchestrator` |

> Se a API rodar **fora** do Docker (só Mongo/Redis no Compose), use hosts `localhost` em `DATABASE_URL` e `WORKER_HOST`.

## Subir com Docker

```bash
docker compose --env-file .env up --build
```

Após subir:

| Serviço | URL |
| --- | --- |
| API | http://localhost:3000 |
| Swagger | http://localhost:3000/docs |
| Bull Board | http://localhost:3000/queue/metrics |
| Mongo Express | http://localhost:8081 (`root` / `secret`) |

Parar:

```bash
docker compose down
```

Rebuild após mudanças de código (a imagem da API **não** monta `src` em volume):

```bash
docker compose --env-file .env up --build
```

Logs:

```bash
docker compose logs -f api
```

## Rodar localmente (sem Docker da API)

1. Suba só a infra:

```bash
docker compose --env-file .env up mongo redis -d
```

2. Ajuste o `.env` para hosts locais, por exemplo:

```env
DATABASE_URL=mongodb://root:secret@localhost:27017/api?authSource=admin
WORKER_HOST=redis://localhost:6379/0
```

3. Instale e rode:

```bash
npm install
npm run start:dev
```

## Endpoints

Base: `http://localhost:3000`

### `POST /webhooks/orders`

Recebe o pedido. Resposta `202`.

```bash
curl.exe -s -X POST http://localhost:3000/webhooks/orders ^
  -H "Content-Type: application/json" ^
  -d "{\"order_id\":\"ext-123\",\"customer\":{\"email\":\"user@example.com\",\"name\":\"Ana\"},\"items\":[{\"sku\":\"ABC123\",\"qty\":2,\"unit_price\":59.9}],\"currency\":\"USD\",\"idempotency_key\":\"uuid-or-hash-1\"}"
```

Resposta de sucesso:

```json
{
  "accepted": true,
  "duplicate": false,
  "order_id": "ext-123"
}
```

Se a mesma `idempotency_key` for reenviada:

```json
{
  "accepted": true,
  "duplicate": true,
  "order_id": "ext-123"
}
```

### `GET /orders`

Lista pedidos. Filtro opcional por status:

```bash
curl.exe -s http://localhost:3000/orders
curl.exe -s "http://localhost:3000/orders?status=RECEIVED"
curl.exe -s "http://localhost:3000/orders?status=FAILED_ENRICHMENT"
```

### `GET /orders/:id`

Detalhe por `order_id` externo:

```bash
curl.exe -s http://localhost:3000/orders/ext-123
```

### `GET /queue/metrics`

Painel HTML do Bull Board (filas `order-processor` e `order-processor-dlq`).

Abra no navegador: http://localhost:3000/queue/metrics

## Payload do webhook

```json
{
  "order_id": "ext-123",
  "customer": {
    "email": "user@example.com",
    "name": "Ana",
    "cep": "01001-000"
  },
  "items": [
    {
      "sku": "ABC123",
      "qty": 2,
      "unit_price": 59.9
    }
  ],
  "currency": "USD",
  "idempotency_key": "uuid-or-hash"
}
```

| Campo | Obrigatório | Observação |
| --- | --- | --- |
| `order_id` | sim | Identificador externo único |
| `customer.email` / `customer.name` | sim | Dados do cliente |
| `customer.cep` | não | Se informado, consulta ViaCEP |
| `items[]` | sim | Pelo menos 1 item (`sku`, `qty`, `unit_price`) |
| `currency` | sim | Código ISO 3 letras (ex.: `USD`) |
| `idempotency_key` | sim | Evita reprocessar o mesmo envio |

## Status do pedido

| Status | Quando |
| --- | --- |
| `RECEIVED` | Criado e/ou enriquecido com sucesso |
| `FAILED_ENRICHMENT` | Todas as tentativas do job falharam |

Após enriquecimento bem-sucedido o pedido permanece `RECEIVED`, com campos extras:

- `currency_conversion` (from/to/rate/amount/converted_amount/date)
- `items[].converted_unit_price` / `converted_currency`
- `customer.address` (se CEP foi validado)

## Filas e retries

| Fila | Função |
| --- | --- |
| `order-processor` | Processamento principal |
| `order-processor-dlq` | Dead Letter Queue |

Configuração padrão:

- **3 tentativas**
- **Backoff exponencial** (delay inicial 1s)
- **Job ID** estável: `order-processor-{idempotency_key}`
- Prefixo Redis: valor de `QUEUE_PREFIX`

## Integrações externas

| Serviço | Uso |
| --- | --- |
| [Frankfurter](https://www.frankfurter.app/) | Converte o total do pedido para `BRL` |
| [ViaCEP](https://viacep.com.br/) | Valida endereço quando `customer.cep` existe |

## Ferramentas auxiliares

| Ferramenta | URL / comando |
| --- | --- |
| Swagger | http://localhost:3000/docs |
| Bull Board | http://localhost:3000/queue/metrics |
| Mongo Express | http://localhost:8081 |
| Redis CLI | `docker compose exec redis redis-cli` |

## Testes

```bash
# Suite completa
npm test

# Domínio do orquestrador
npm test -- --runInBand --testPathPatterns="order-processor|frankfurter|via-cep|redis-cache|queue.config"

# Coverage
npm run test:cov
```

Os testes cobrem validação, idempotência, publisher, worker (retry/DLQ), enriquecimento e serviços externos (com mocks).

## Logs

A aplicação usa `Logger` do NestJS em:

- Bootstrap
- Controller HTTP
- Receive / publish / process / worker
- Mongo (`OrdersService`)
- Redis (idempotência e locks)
- ViaCEP e Frankfurter

Com Docker:

```bash
docker compose logs -f api
```

## Estrutura do projeto

```text
src/
  common/
    constants/order-status.ts
    schemas/order.schema.ts
    services/
      frankfurter/
      redis-cache/
      via-cep/
  config/
  modules/
    order-processor/
      consumers/          # worker BullMQ
      publishers/         # enqueue
      services/           # persistência Mongo
      use-cases/          # regras de negócio
      dto/
      utils/
      order-processor.controller.ts
      order-processor.module.ts
  main.ts
  app.module.ts
```

## Troubleshooting

**Endpoints 404 (`/webhooks/orders`)**  
A imagem Docker está desatualizada. Rode:

```bash
docker compose --env-file .env up --build
```

**`Custom Id cannot contain :`**  
IDs de job do BullMQ não podem ter `:`. O projeto usa `order-processor-{idempotency_key}`.

**Pedido não aparece no Mongo**  
O webhook só enfileira; a persistência é no worker. Aguarde alguns segundos ou veja logs/`/queue/metrics`.

**`DATABASE_URL` / Redis connection refused**  
Confirme se a API está na rede Docker (`mongo`/`redis`) ou se, rodando no host, as URLs usam `localhost`.

**Duplicata não detectada**  
A idempotência depende do Redis. Verifique se o serviço `redis` está up e se `WORKER_HOST` aponta para ele.
