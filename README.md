# Pickup Counter

A TypeScript full-stack demo for a self-service snack counter. Customers browse snacks, build a cart, pay through a simulated UPI/card/net-banking flow, and claim their paid order at a locker. PostgreSQL transactions protect stock and pickup state when requests race.

## Contents

- [Run the project](#run-the-project)
- [Customer and system flow](#customer-and-system-flow)
- [Screenshots](#screenshots)
- [Project structure](#project-structure)
- [API overview](#api-overview)
- [Tests and example cases](#tests-and-example-cases)
- [Try a signed webhook](#try-a-signed-webhook)
- [Design decisions and assumptions](#design-decisions-and-assumptions)
- [Security and limitations](#security-and-limitations)
- [Next steps](#next-steps)

## Run the project

### Docker Compose

From the project root, start PostgreSQL, backend, and frontend with one command:

```bash
docker compose up --build
```

Open the customer app at <http://localhost:5173>. The backend health endpoint is <http://localhost:3000/health>. Compose supplies development defaults, so a `.env` file is not required. To stop the services, press `Ctrl+C`; then run `docker compose down` if needed.

### Run without Docker

Requirements: Node.js 20.6+ and PostgreSQL 16. Create the application and test databases, then use two terminals:

```bash
psql postgres -c "CREATE USER app WITH PASSWORD 'app' SUPERUSER;" \
  -c "CREATE DATABASE pickup OWNER app;" \
  -c "CREATE DATABASE pickup_test OWNER app;"
```

```bash
cd backend
npm ci
npm run dev
```

```bash
cd frontend
npm ci
npm run dev
```

The backend initializes the schema and sample products at startup. For local settings, copy `.env` and configure the database URLs and secrets. On Windows, use `psql -U postgres` if `psql postgres` is not available.

## Customer and system flow

1. The frontend requests the product catalog, including currently available units.
2. The customer filters/browses products, adds quantities to the cart, and submits an order.
3. The backend locks the selected product rows in a stable order, checks availability, and creates a 120-second stock hold and a paise-denominated total in one transaction.
4. The payment screen displays the server-derived countdown and polls order status. The demo payment simulator signs a webhook event and sends it through the same webhook handler used for provider events.
5. A valid capture marks the order paid and continues reserving its stock until pickup. The locker claims it once; a successful claim permanently deducts the quantity from stock.
6. The assistant can answer questions and suggest/pre-fill products, but it cannot create orders or initiate payments.

## Screenshots

Screenshots are stored under [`docs/screenshots/`](docs/screenshots/). The early payment/catalog shots show earlier UI snapshots; the later set shows the app, payment options, and run evidence. it is labelled as such and is not presented as project functionality.

### Catalog and cart

<details>
<summary>View catalog and cart screenshots</summary>

![Early payment hold screen](docs/screenshots/01-payment-hold-early.png)

*Early payment-hold screen snapshot.*

![Early snack catalog](docs/screenshots/02-catalog-early.png)

*Earlier catalog layout with categories and available stock.*



*External visual reference supplied with the screenshots; not part of Pickup Counter.*

![Help button](docs/screenshots/04-help-button.png)

*Floating “Help me choose” entry point.*

![Catalog header crop](docs/screenshots/05-catalog-header.png)

*Catalog category controls and partial product grid.*

![Product catalog](docs/screenshots/06-product-catalog.png)

*Snack catalog cards show product illustrations, category, stock, price, and add controls.*

![Empty cart drawer](docs/screenshots/07-empty-cart.png)


*Header cart summary after adding an item.*

</details>

### Payment and assistant

<details>
<summary>View payment, assistant, and code screenshots</summary>

![UPI payment screen](docs/screenshots/09-upi-payment.png)

*Payment screen with order reference, hold countdown, UPI option, and demo outcome selector.*

![UPI payment screen detail](docs/screenshots/10-upi-payment-detail.png)

*Closer view of the order summary, countdown, payment controls, and help prompts.*

![Card payment form](docs/screenshots/11-card-payment.png)

*Card form shown while the order hold countdown continues.*

![Net banking payment form](docs/screenshots/12-netbanking-payment.png)

*Net-banking selection shown on the payment screen.*

![Payment success rendering in code](docs/screenshots/13-payment-success-code.png)

*The React conditional rendering for the paid thank-you state and demo pickup claim.*

![Assistant panel](docs/screenshots/14-assistant-panel.png)

*Assistant panel with example snack and payment questions.*

</details>

### Test and run evidence

<details>
<summary>View test, Docker, and startup screenshots</summary>

![Backend tests passed](docs/screenshots/15-backend-tests-passed.png)

*Terminal output showing both test files passed and 27 backend tests succeeded.*

![Frontend development server](docs/screenshots/16-frontend-dev-server.png)

*Vite development server started successfully.*

![Docker Compose build](docs/screenshots/17-compose-build.png)

*Docker Compose building the project images.*

![PostgreSQL initialization](docs/screenshots/18-database-initialization.png)

*PostgreSQL container initialization and test database creation.*

![Services starting](docs/screenshots/19-services-starting.png)

*Database, backend, and frontend containers starting.*

![Application services ready](docs/screenshots/20-app-ready.png)

*Frontend and backend report their local addresses and listening status.*

![Docker Desktop services](docs/screenshots/21-docker-desktop-services.png)

*Docker Desktop view of the running project services.*

![Docker images](docs/screenshots/22-docker-images.png)

*Built backend and frontend images alongside the PostgreSQL image.*

![Docker container logs](docs/screenshots/23-docker-logs.png)

*Container logs for the frontend and backend services.*

![Docker build history](docs/screenshots/24-docker-build-history.png)

*Successful Docker build history for the frontend and backend.*

</details>

## Project structure

```text
pickup-counter/
├── docker-compose.yml          # PostgreSQL, backend, and frontend services
├── docker/
│   └── init.sql                 # Creates the separate pickup_test database
├── backend/
│   ├── src/
│   │   ├── app.ts               # Express routes and middleware
│   │   ├── server.ts            # Startup, migrations, expiry sweep, shutdown
│   │   ├── schema.sql           # PostgreSQL tables and constraints
│   │   ├── db.ts                # Pool, transactions, migrations, audit events
│   │   ├── seed.ts              # Sample catalog and categories
│   │   ├── orders.ts            # Availability, order creation, expiry, status
│   │   ├── payments.ts          # Raw-body HMAC validation and webhook state changes
│   │   ├── simulator.ts         # Demo payment methods and signed events
│   │   ├── pickup.ts            # Atomic pickup claim and stock deduction
│   │   ├── admin.ts             # Admin order and review endpoints
│   │   ├── assistant.ts         # Suggestions and optional AI provider integration
│   │   ├── chat.ts              # Assistant responses and product suggestions
│   │   ├── kb.ts                 # Local knowledge base fallback
│   │   ├── errors.ts            # Request IDs and consistent API errors
│   │   └── scripts/
│   │       └── send-webhook.ts   # CLI for sending a signed webhook
│   └── tests/
│       ├── setup.ts             # Dedicated PostgreSQL test database settings
│       ├── pickup.test.ts       # Concurrency, webhook, expiry, pickup integration tests
│       └── features.test.ts     # Catalog, simulator, idempotency, assistant tests
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Top-level screen state and product loading
│   │   ├── Shop.tsx             # Catalog, filters, and stock-aware cart controls
│   │   ├── CartDrawer.tsx       # Cart summary and order placement
│   │   ├── Payment.tsx          # Countdown, payment, polling, and pickup UI
│   │   ├── Chat.tsx             # Assistant panel and suggestion-to-cart flow
│   │   ├── Header.tsx           # Search and cart header
│   │   ├── Boundary.tsx         # UI error boundary
│   │   ├── api.ts               # Frontend API helper and shared types
│   │   └── style.css            # App styling
│   └── public/products/         # Product illustration assets
├── docs/screenshots/            # Screenshots embedded in this README
├── README.md
└── AI_NOTES.md
```

## API overview

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/products` | Product catalog with available units |
| `POST` | `/orders` | Create an order and hold stock for 120 seconds |
| `GET` | `/orders/:id` | Poll order state and remaining hold/late-payment time |
| `POST` | `/payments/webhook` | Verify and process a signed provider event |
| `POST` | `/payments/simulate` | Demo-only payment flow; sends a signed event to the webhook handler |
| `POST` | `/orders/:id/pickup-claim` | Atomically claim a paid order and deduct stock |
| `POST` | `/assistant/chat` | Ask payment/product questions and receive suggestions |
| `GET` | `/health` | Check API/database availability |

The optional admin endpoints are documented in the Admin API paragraph below.

## Tests and example cases

The Vitest integration suite connects to a real PostgreSQL database configured by `TEST_DATABASE_URL`; it does not mock the database. The test setup uses the dedicated `pickup_test` database and resets/seeds the tables between tests.

Run from the project root with Docker:

```bash
docker compose up -d db
docker compose run --rm backend npm test
```

Or with PostgreSQL already running locally and `.env` configured:

```bash
cd backend
npm ci
npm test
```

There are 27 tests. The critical cases and what they assert:

| Scenario | Test behavior | Expected result |
|---|---|---|
| Ten customers race for the last two units | Send ten `POST /orders` requests concurrently, each requesting one unit | 2 responses are `201`, 8 are `409 INSUFFICIENT_STOCK`, and exactly 2 units are held |
| Provider repeats an event | Send two concurrent webhook requests with the same `eventId` and valid signature | One returns `paid`, one returns `duplicate`, and exactly one `paid` order event is recorded |
| Two lockers race to claim | Pay an order, then call pickup claim twice concurrently | One response is `200`, one is `409`, and stock decreases only once |
| Capture arrives beyond grace period | Expire an order by more than 30 seconds, then send a correctly signed capture | Order becomes `needs_review`; the order does not reclaim inventory |
| Multi-item order cannot be fully filled | Request a quantity that exceeds available stock | Request fails with `409`; no line items or holds are created |
| Bad webhook signature | Send a mismatched HMAC signature | Request is rejected with `401`; order remains unpaid |

The main concurrency and payment tests are in [`backend/tests/pickup.test.ts`](backend/tests/pickup.test.ts); catalog, simulator, idempotency, and assistant coverage is in [`backend/tests/features.test.ts`](backend/tests/features.test.ts).

## Try a signed webhook

Create an order in the UI or with `POST /orders`, then run the script from `backend/`:

```bash
npm run send-webhook -- <orderId> <amountPaise>                  # valid capture
npm run send-webhook -- <orderId> <amountPaise> --duplicate      # send same event twice
npm run send-webhook -- <orderId> 100                            # wrong amount -> needs_review
npm run send-webhook -- <orderId> <amountPaise> --bad-signature  # invalid signature -> 401
```

With Docker, invoke it inside the running backend container:

```bash
docker compose exec backend npm run send-webhook -- <orderId> <amountPaise>
```

The customer payment page also has a collapsed “Demo tools” selector for a decline, wrong amount, or duplicate event. Test card `4242 4242 4242 4242` succeeds; `4000 0000 0000 0002` is declined. Card details are validated for the simulator and are not stored or logged.

Pickup can be tested after payment:

```bash
curl -X POST http://localhost:3000/orders/<orderId>/pickup-claim
```

The first successful claim returns `200`; a repeated claim returns `409`.

## Design decisions and assumptions

- **Money:** store and calculate amounts as integer paise. Rupees are formatted only for display.
- **Availability:** physical stock minus active unpaid holds and paid-but-unclaimed orders. Paid orders continue reserving stock until pickup.
- **Concurrency for orders:** lock product rows with `SELECT ... FOR UPDATE` in ascending product-ID order. Check availability after the locks; create the order and its item rows in the same transaction. A failed multi-item order rolls back fully.
- **Hold expiration:** the database clock decides whether a hold is live. A background sweep updates stored `pending` statuses to `expired`; correctness does not depend on the sweep running on time.
- **Late payment:** for up to 30 seconds after expiry, a captured payment can re-reserve the requested stock if it remains available. If stock is gone, or the capture arrives after that window, mark `needs_review` so staff can resolve/refund it. The order API provides the remaining grace time, and the payment screen polls until the window closes.
- **Webhook idempotency:** `eventId` is unique in PostgreSQL. Duplicate deliveries do not apply the payment state transition twice. The HMAC is verified against the raw request bytes.
- **Pickup:** one conditional status update is the claim gate; the status change and stock deduction commit in the same transaction.
- **Countdown:** the browser measures a server-provided remaining duration with `performance.now()`, a monotonic timer that does not depend on the device wall clock. It re-syncs with the server while polling.
- **Order idempotency:** optional `Idempotency-Key` on `POST /orders` allows a retry/double-click to return the original order.
- **Collection:** an order is collected once in full; partial pickup is not supported. The demo assumes locker requests are trusted.
- **Product count:** the seed includes nine products across snack/drink categories (the brief asked for about five).

Admin API endpoints require the `x-admin-token` header (development default: `change-me-admin-token`): `GET /admin/orders`, `GET /admin/needs-review`, `GET /admin/orders/:id/timeline`, and `POST /admin/orders/:id/resolve` with `{"action":"refund"|"accept"}`.

## Security and limitations

Prices and totals are computed on the backend; SQL uses parameters; order IDs are UUIDs; errors have a consistent response shape and request ID. Webhook secrets and admin token are environment settings.

This is a development assignment, not a production payment/locker service. It does not include real provider reconciliation/refunds, authenticated locker devices, webhook timestamp/replay-window validation, TLS termination, a persistent distributed rate limiter, or rate limiting on order creation. The payment simulator is enabled by default in the demo Compose configuration.

## Next steps

Add admin UI, frontend component tests (including a device-clock skew test), CI, load testing, provider reconciliation/refund callbacks, locker authentication, and shared rate limiting. A useful additional concurrency exercise would compare the current row-locking implementation with a deliberately naive read-then-write version in an isolated test.

## How I checked

- The backend PostgreSQL integration suite passed: 27 tests.
- Backend and frontend TypeScript checks passed; the frontend production build completed.
- `npm audit` reported zero vulnerabilities for backend and frontend dependencies after the dependency updates.
- The supplied terminal screenshots document a passing local test run, Vite startup, and Docker Compose service/build startup. They are collected under [`docs/screenshots/`](docs/screenshots/).

## AI usage

See [`AI_NOTES.md`](AI_NOTES.md) for the AI tools used, an example prompt, and a specific mistake found and corrected.
