# FactoryOps CMMS

Computerized Maintenance Management System (CMMS) for factory operations.

## Structure

```
backend/
  factoryops.API             ASP.NET Core Web API (entry point)
  factoryops.Application     Use cases and application services
  factoryops.Domain          Domain entities and business rules
  factoryops.Infrastructure  Persistence and external integrations
  factoryops.Tests           Tests
frontend/                         React + TypeScript web app (PWA), one app for all roles
docs/                             Documentation
```

## Getting started

### Backend

```sh
dotnet build backend/factoryops.slnx
dotnet run --project backend/factoryops.API
dotnet test backend/factoryops.slnx
```

### Frontend

```sh
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run typecheck && npm run lint && npm run build
```

The frontend currently runs on in-browser demo data (`VITE_DATA_SOURCE=mock`, see
`frontend/.env.example`). In development a demo sign-in lets you enter as any role
(Admin, Supervisor, Technician, Operator; operator kiosk PINs 1111–4444). Demo sign-in is
off in production builds unless `VITE_DEMO_AUTH=true` is set explicitly, and it is not a
security boundary: the API must enforce authorization.

Frontend layout (`frontend/src`):

```
domain/       entity types, enums, permissions, work-order rules, KPI calculations
services/     data-access contracts + mock implementation (API implementation to come)
mocks/        deterministic demo dataset
features/     domain features (auth, work orders, notifications, …)
roles/        route trees and screens per role experience
components/   ui primitives, shared components, layouts
```
