# GeoMine PMS — Architecture Overview
### Full-Stack Production System · Presentation / Slide Deck Reference

**For Microsoft Word:** open `ARCHITECTURE.html` in Word for Times New Roman 12pt formatting, or copy-paste any section below.

---

## 1. SYSTEM OVERVIEW

GeoMine Predictive Maintenance System (PMS) is a full-stack industrial web application for monitoring diesel generators across mining sites.

**What it does:**
- Miners log field readings from tablets or laptops
- Admins and IT staff view live fleet analytics, predictive insights, maintenance priorities, health indices and exportable reports
- Real-time telemetry streaming from generators to dashboard
- Role-based access control (Admin, Miner, IT)
- AI-style predictive maintenance insights with confidence levels
- CSV and PDF report generation
- Activity logging and audit trail

**Who uses it:**
- **Miners (field):** Log generator readings, view own submission history, see generator status
- **Admins (office):** Full fleet analytics, live charts, AI insights, CSV export, demo controls
- **IT / Systems:** System health monitoring, user management, infrastructure oversight

---

## 2. HIGH-LEVEL ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USERS / ACTORS                              │
│   Miner (field)   │   Admin (office)   │   IT / Systems Engineer    │
└──────────┬──────────────┬──────────────────────────┬───────────────┘
           │              │                          │
           ▼              ▼                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     FRONTEND LAYER                                  │
│   React + TypeScript SPA                                             │
│   • Login page (SSO / email)                                        │
│   • Dashboard with live charts                                      │
│   • Generator detail views                                          │
│   • CSV / PDF export                                                │
│   • Runs on CDN / Vercel / Netlify                                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTPS / WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    API GATEWAY / BACKEND                             │
│   Node.js + Express (or Fastify)                                    │
│                                                                     │
│   ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│   │   Auth       │  │  Readings    │  │  Insights / Reports      │  │
│   │   Service    │  │  API         │  │  Service                 │  │
│   └──────────────┘  └──────────────┘  └─────────────────────────┘  │
│                                                                     │
│   Socket.io Server (real-time WebSocket)                            │
│   • Pushes live readings to dashboard                               │
│   • Broadcasts alerts / warnings                                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
┌──────────────────┐  ┌─────────────────┐  ┌──────────────────┐
│   PostgreSQL     │  │      Redis      │  │  Message Queue   │
│   (Primary DB)   │  │   (Cache)       │  │  (MQTT / Rabbit) │
│                   │  │                 │  │                  │
│  • machines       │  │ • Live counts   │  │ • Ingests data   │
│  • readings       │  │ • Session store │  │   from gateway   │
│  • faults         │  │ • Recent cache  │  │ • Buffers spikes │
│  • refuels        │  │                 │  │                  │
│  • users          │  │                 │  │                  │
│  • RLS policies   │  │                 │  │                  │
└──────────────────┘  └─────────────────┘  └──────────────────┘
                             │
                             ▼
                  ┌────────────────────┐
                  │  Generator Edge    │
                  │  Gateway / IoT Hub │
                  │  (on-site device)  │
                  │  • Reads sensors   │
                  │  • Sends JSON via  │
                  │    MQTT / HTTP     │
                  └────────────────────┘
```

---

## 3. COMPONENT DESCRIPTIONS

### 3.1 FRONTEND LAYER

**Technical description:**
React + TypeScript single-page application (SPA) served as static assets on a CDN or edge network. Communicates with the Node.js backend via REST API and Socket.io WebSocket for real-time updates. Uses Recharts or Chart.js for telemetry visualisation, React Router for navigation, and Context API / Zustand for state management.

**Layman's description:**
The user interface — the screens, buttons, charts and forms that operators see in their browser. Built with modern web tools so it feels fast, responsive and professional. Updates instantly when new generator data arrives, without needing to refresh the page.

---

### 3.2 BACKEND LAYER (Node.js + Express)

**Technical description:**
Node.js runtime with Express.js (or Fastify) exposing RESTful endpoints for CRUD operations on machines, readings, faults and users. Business logic for health calculations, maintenance scoring and insight generation lives here. Socket.io server handles bidirectional real-time communication for live telemetry streaming and instant alerts.

**Layman's description:**
The brain of the system. It receives readings from the generators, processes them using health formulas, saves them to the database, and pushes updated dashboards to every user's screen in real time. It also handles login, permissions and file exports.

---

### 3.3 DATABASE LAYER (PostgreSQL)

**Technical description:**
Primary relational database storing machines, parameter definitions, readings, fault events, refuel events, users and roles. The calculation logic maps directly to Postgres stored functions or application-level queries. Row-Level Security (RLS) enforces tenant and role isolation at the database layer.

**Layman's description:**
The permanent memory of the system. Every reading ever taken, every fault logged, every user account — all stored safely here. It is structured so the system can answer questions like "show me all generators with health below 50% in the last 30 days" efficiently and reliably.

---

### 3.4 REAL-TIME LAYER (Socket.io on Node.js)

**Technical description:**
WebSocket server co-located with the Express API. Generator gateways connect and emit `reading` events; the server validates, persists to Postgres, then broadcasts to subscribed dashboard clients. Supports room-based subscriptions per machine or per site.

**Layman's description:**
The live connection between the physical generators and the dashboard. Instead of the dashboard asking "any new data?" every few seconds, the generators push new data the moment it is available. This is what makes the charts and alerts feel instant.

---

### 3.5 AUTHENTICATION LAYER

**Technical description — Option A (Custom):**
JWT-based authentication with bcrypt password hashing, refresh token rotation, and role-based access control (RBAC). Tokens stored in HTTP-only secure cookies. Role claims drive UI feature visibility and API route protection.

**Technical description — Option B (Supabase Auth):**
Supabase Auth handles email/password, SSO (SAML/OAuth), MFA and magic links out of the box. Frontend configured with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Row-Level Security policies in Postgres restrict data access per authenticated user. Optional email templates and redirect URLs configured in the Supabase dashboard.

**Layman's description:**
The security gate. Users must prove who they are before accessing the system. We can either build our own login system (full control, no external dependency) or use Supabase Auth (faster to deploy, enterprise features like SSO and MFA included).

---

### 3.6 MESSAGE QUEUE / EDGE GATEWAY

**Technical description:**
MQTT broker (e.g., EMQX or AWS IoT Core) or lightweight Node.js service that ingests JSON payloads from on-site generator gateways. Handles buffering during network outages, protocol translation (Modbus/SCADA → JSON), and forwards validated readings to the Node.js backend via HTTP or WebSocket.

**Layman's description:**
The translator and postman between the physical generators and the cloud. Generator sensors speak different languages; this layer normalises everything into a standard format the system understands, and ensures no data is lost even if the internet connection flickers.

---

### 3.7 CACHE LAYER (Redis)

**Technical description:**
In-memory cache for hot dashboard aggregations: fleet health summary, recent readings, session data and live counts. Reduces Postgres query load for frequently accessed dashboard widgets. TTL-based expiry keeps cache consistent.

**Layman's description:**
A fast scratchpad. Instead of asking the database the same question hundreds of times a minute (e.g., "what is the current fleet health?"), the system remembers the answer here and serves it instantly. This keeps the dashboard fast even with many users.

---

### 3.8 HOSTING & DEPLOYMENT

**Technical description:**
- Frontend: Vercel / Netlify / Azure Static Web Apps (static build + CDN)
- Backend: Azure App Service, Azure Container Apps or AWS ECS (Docker container)
- Database: Supabase managed Postgres or Azure Database for PostgreSQL
- Redis: Supabase Redis add-on or Azure Cache for Redis
- MQTT / Edge: EMQX cloud or self-hosted on a small edge VM at each site
- CI/CD: GitHub Actions running tests and deployments on merge

**Layman's description:**
Everything runs in the cloud on trusted platforms. The frontend is served from a global content delivery network for speed. The backend and database run on managed cloud services with automatic backups. The on-site edge device sits in the mine's control room and pushes data to the cloud.

---

## 4. AUTHENTICATION CONFIGURATION

### 4.1 Custom Node.js Auth

**Environment variables required:**
```
JWT_SECRET            = strong random string (32+ characters)
JWT_REFRESH_SECRET    = separate strong random string
ACCESS_TOKEN_EXPIRY   = 15m
REFRESH_TOKEN_EXPIRY  = 7d
BCRYPT_ROUNDS         = 12
```

**How it works:**
- Frontend stores access token in memory, refresh token in HTTP-only secure cookie
- Backend validates on every request and refreshes silently
- No external authentication provider dependency

---

### 4.2 Supabase Auth

**Frontend environment variables:**
```
NEXT_PUBLIC_SUPABASE_URL       = https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   = <anon-public-key>
```

**Backend environment variables (service role):**
```
SUPABASE_URL                    = https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY       = <service-role-key>
```

**Supabase dashboard setup steps:**
1. Enable Email provider (or SSO / SAML for enterprise)
2. Configure redirect URLs (e.g., https://app.geomine.com/auth/callback)
3. Create Row-Level Security policies on machines, readings, faults tables
4. Map roles via user_metadata.role or a separate profiles table
5. Enable MFA if required by policy

---

## 5. DATA FLOW — HOW A READING TRAVELS

```
1. Generator sensor measures current, RPM, temp, power factor
2. Edge gateway reads sensor, builds JSON payload
3. MQTT broker receives payload (or gateway calls Node.js API directly)
4. Node.js validates data, applies business rules
5. Node.js saves reading to PostgreSQL
6. Node.js broadcasts update via Socket.io to connected dashboards
7. Frontend receives push, updates charts, recalculates health, shows alerts
8. If health drops below threshold, Node.js pushes warning to all admins
```

**Layman's version:**
The generator measures itself → the local device packages that data → sends it to the cloud → the server checks it, saves it, and immediately pushes it to every screen that is watching → operators see the update instantly and the system flags any problems automatically.

---

## 6. TECHNOLOGY SELECTION RATIONALE

| Concern | Decision | Reason |
|---------|----------|--------|
| Language | JavaScript / TypeScript | Demo logic is already JS — zero paradigm shift |
| Backend | Node.js + Express | Native JSON handling, ideal for IoT telemetry, large ecosystem |
| Database | PostgreSQL | Matches the existing schema, strong relational model, RLS for security |
| Real-time | Socket.io | Battle-tested WebSocket library, works seamlessly with Express |
| Frontend | React + TypeScript | Component model fits dashboard widgets, huge talent pool |
| Auth | Custom JWT or Supabase Auth | Custom = full control. Supabase = faster, enterprise-ready |
| Hosting | Cloud (Azure / AWS / Vercel) | Managed services, automatic backups, global CDN |
| Monitoring | Application Insights / Datadog | Node.js-native telemetry, structured logs, alerting |

---

## 7. DELIVERY TIMELINE

### Phase 1 — MVP (4–6 weeks)
- React frontend with dashboard, detail view and login
- Node.js + Express backend with health calculation APIs
- PostgreSQL with seeded data and RLS
- Socket.io for live updates
- Authentication (custom or Supabase)
- CSV export
- Deployed to cloud (frontend CDN, backend container, managed Postgres)

### Phase 2 — Production Hardening (2–3 weeks)
- MQTT edge gateway integration
- PDF report generation
- Email / Teams alerts for critical health drops
- Audit logging
- Automated backups and disaster recovery plan
- Load testing and performance tuning

### Phase 3 — Advanced Features (4–6 weeks)
- Predictive maintenance ML model (Python scikit-learn or TensorFlow, served via Node.js microservice or Python FastAPI sidecar)
- Multi-site tenant isolation
- Offline mobile app for miners (React Native or Flutter)
- Advanced RUL (Remaining Useful Life) modelling
- Integration with existing mine ERP / CMMS

---

## 8. KEY BENEFITS

- **No rewrite needed** — the demo formulas map 1:1 to Postgres functions and Node.js service logic
- **Incremental delivery** — we can ship the MVP in 4–6 weeks and add features in phases
- **Enterprise-ready** — SSO, MFA, row-level security and cloud hosting from day one
- **Scalable** — Node.js + Postgres + Redis handles thousands of generators and concurrent users
- **Maintainable** — single full-stack JavaScript/TypeScript codebase, modern tooling, strong typing
- **Future-proof** — ML and mobile can be added without re-architecting

---

## 9. QUESTIONS FOR THE PANEL / STAKEHOLDERS

1. Do we want custom auth or Supabase Auth for faster delivery?
2. Are generator gateways already in place, or do we need to spec the edge hardware?
3. Should we prioritise the ML predictive model in Phase 1, or treat it as Phase 3?
4. Do we need multi-tenant isolation (different mining companies) from the start?
5. What is the target go-live date for the MVP?

---

*Prepared for the GeoMine PMS university project panel.*
