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
npm test           # unit tests (domain rules, permissions, service behaviour)
npm run e2e        # browser suites in Chrome: workflows, PWA, responsive, accessibility, outages
```

See [docs/frontend-handover.md](docs/frontend-handover.md) for the architecture, what the API
must implement and enforce, deployment notes and known limitations.

The frontend currently runs on in-browser demo data (`VITE_DATA_SOURCE=mock`, see
`frontend/.env.example`). In development a demo sign-in lets you enter as any role
(Admin, Supervisor, Technician, Operator; operator kiosk PINs 1111–4444). Demo sign-in is
off in production builds unless `VITE_DEMO_AUTH=true` is set explicitly, and it is not a
security boundary: the API must enforce authorization.

#### Installable app (PWA)

Production builds register a service worker and a web app manifest, so the app can be
installed on phones, tablets and shared kiosks (account menu → "Install app on this device",
or Share → Add to Home Screen on iOS). The service worker is not active under `npm run dev`;
to try it locally:

```sh
VITE_DEMO_AUTH=true npm run build && npm run preview   # http://localhost:4173
```

- The app shell and every screen are precached, so the app opens without a connection and
  shows an offline banner. Demo data lives on the device and keeps working offline; with the
  API, reads show the last loaded data and writes need a connection.
- API responses are never cached by the service worker.
- New versions are not applied silently: users get an "Update now" prompt, so nobody loses a
  half-filled form. Open apps check for updates hourly.
- Installed apps and the camera (QR scanning) require HTTPS outside `localhost`.

Frontend layout (`frontend/src`):

```
domain/       entity types, enums, permissions, work-order rules, KPI calculations
services/     data-access contracts + mock implementation (API implementation to come)
mocks/        deterministic demo dataset
features/     domain features (auth, work orders, notifications, …)
roles/        route trees and screens per role experience
components/   ui primitives, shared components, layouts
```

## License

Copyright (c) 2026 Joemar Quest. All rights reserved. See [LICENSE](LICENSE).

The source is published for viewing only. Viewing it on GitHub does not grant a license to use,
copy, modify or distribute the code; contact the author for permission.
