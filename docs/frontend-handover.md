# FactoryOps CMMS frontend: handover

Status at the end of the initial build (phases 1–8). The frontend is feature-complete for all
four roles and runs on in-browser demo data. The ASP.NET Core API that replaces the demo data
is the next piece of work; this document is mainly for whoever builds it.

## What is built

| Role                      | Device           | Screens                                                                                                                                      |
| ------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin / Manager           | Desktop          | KPI dashboard, reports (7, CSV export), equipment register with QR labels, PM schedules and calendar, inventory, organization, users, settings |
| Supervisor / Planner      | Desktop / tablet | Operations dashboard, request review, work orders, Kanban board, week planner and month calendar, technician workload, equipment status     |
| Technician                | Phone            | Today's jobs, job execution (start/pause/complete, checklist, photos, parts, notes), QR scanner, machine history, own history, profile         |
| Operator / Requester      | Phone / kiosk    | 3-step breakdown report with duplicate warning, own reports with progress timeline, kiosk PIN sign-in with idle sign-out                       |

All roles: installable app (PWA) that opens offline, update prompt, notifications, WCAG 2.1 AA
(axe-checked), responsive from 320 px phones to desktop.

## Architecture in one minute

```
frontend/src
  domain/      types, enums (C# names), permissions, work-order rules, metrics — pure, unit-tested
  services/    contracts.ts (the API surface) · mock/ (demo implementation) · api/http.ts (fetch client)
  features/    cross-role features: auth, work orders, requests (report wizard), equipment, PWA
  roles/       one route tree per role: admin/, supervisor/, technician/, operator/
  components/  ui primitives (Radix), shared components, layouts (desktop shell, mobile shell)
```

- Screens only talk to `services` (TanStack Query for reads, `useServiceMutation` for writes).
  `services/index.ts` chooses the demo or the API implementation from `VITE_DATA_SOURCE`.
- Screens are lazy-loaded per route; phones never download charts, tables or forms they don't use.
- Frontend permission checks only decide what is shown. **The API must authorize every call.**

## Connecting the API

Implement each interface in `src/services/contracts.ts` under `src/services/api/` using the
`http()` client, then export it from `services/index.ts` when `env.dataSource === 'api'`.
The demo implementation in `src/services/mock/` is the reference behaviour, and
`src/services/mock/services.test.ts` is effectively the acceptance test: the same rules must
hold on the server.

### Conventions the frontend expects

- **JSON enums as C# member names** (`JsonStringEnumConverter`), e.g. `"InProgress"`, `"OutOfService"`.
- **Dates:** timestamps as ISO-8601 UTC (`createdAtUtc`), calendar days as `yyyy-MM-dd` (`dueDate`, `scheduledDate`).
- **Errors as RFC 7807 problem details.** Status → UI behaviour: 400/422 validation message shown
  as-is, 401 sends the user to sign-in, 403 "not allowed", 404 not found, 409 conflict message
  shown as-is, anything else "server". Put a user-readable sentence in `detail`.
- **Auth:** bearer token (`setAccessToken`); `AuthService.currentUser/signIn/signOut`.
- **Identity comes from the token, never from the request body** (e.g. `mine: true`, reviewer,
  technician executing work).

### Server-side rules the API must enforce

Permission matrix: `src/domain/permissions.ts` (`ROLE_PERMISSIONS`). In particular:

- Technicians only see and execute work orders assigned to them; they cannot assign, plan,
  edit or cancel. Supervisors and admins cannot start, pause or complete on a technician's behalf.
- Operators only see their own requests and no work orders.
- Status changes follow `WORK_ORDER_TRANSITIONS` (`src/domain/workOrderRules.ts`); work in
  progress cannot be reassigned; closed work orders cannot change.
- Completing needs labor hours > 0 and actions taken; part usage cannot exceed stock and is
  recorded as an inventory issue transaction.
- Approving creates the corrective work order (and can assign/schedule it); a request can only be
  reviewed once; rejecting needs a reason.
- Side effects (see `services/mock/effects.ts`): a critical report marks the machine out of
  service and opens downtime; starting corrective work sets "under maintenance"; closing the
  last open corrective job returns the machine to service and ends downtime; completing PM
  advances the schedule; audit log entries for every change; notifications as listed below.

### Endpoints that are not plain CRUD

| Contract method                       | Why it exists                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `workOrders.plan(id, {assigneeId, scheduledDate})` | Board and planner: set technician and day atomically                                  |
| `requests.activeIssues(equipmentId)`  | Duplicate warning for reporters: open requests and corrective work on a machine (minimal fields)  |
| `MaintenanceRequest.progress`         | Read-only projection of the resulting work order so requesters can follow the repair              |
| `equipment.history(equipmentId)`      | Completed work on a machine for technicians, who otherwise only see their own work orders         |
| `equipment.findByAssetId(assetId)`    | QR label resolution                                                                               |
| `users.activity(id)`                  | Admin "recent activity" for a user                                                                |

### Notifications

Created server-side with an in-app `link` (the client only follows paths starting with `/`):
new request → supervisors (`/supervisor/requests?id=…`), assignment / reschedule / cancellation →
technician (`/tech/jobs/…`), approval, rejection, repair completed → operator
(`/operator/requests/…`), completion → supervisors, low stock → admins. Respect the settings toggles
(`notifyOnNewRequest`, `notifyOnAssignment`, `lowStockAlerts`). `notifyOnOverdue` needs a scheduled job.

### Still needed on the API side

- **Kiosk sign-in** by PIN or badge (demo-only today): endpoint, PIN hashing, lockout after failed
  attempts, PIN management for admins.
- **User directory for non-admins**: the screens only need id, name, role, title (and skills/shift
  for planners). Don't return emails and phone numbers to operators.
- **File upload for photos**: demo mode stores compressed data URLs. The API should accept the
  upload and return a download URL (`AttachmentsUploader`).
- **Report endpoints**: reports are aggregated in the browser from full lists today; move the
  aggregation server-side before data volumes grow.
- **Overdue notifications** and **PM work-order generation** as background jobs.

## Deployment

- `npm run build` → static files in `frontend/dist`. Serve over **HTTPS** (required for the installable
  app and the camera) with SPA fallback to `index.html`.
- Cache headers: `index.html`, `sw.js`, `manifest.webmanifest` → `no-cache`;
  `/assets/*` → `public, max-age=31536000, immutable`.
- Environment: `VITE_DATA_SOURCE=api`, `VITE_API_URL` (default `/api`). Leave `VITE_DEMO_AUTH` unset
  in production; demo sign-in is never a security boundary.
- The service worker never caches API responses (`/api/*` is excluded from navigation fallback).

## Quality checks

| Command             | What it checks                                                                 |
| ------------------- | ------------------------------------------------------------------------------ |
| `npm run typecheck` | TypeScript strict                                                              |
| `npm run lint`      | ESLint                                                                         |
| `npm test`          | 36 unit tests: domain rules, metrics, URL/CSV safety, role permissions and business rules of the services |
| `npm run e2e`       | 7 browser suites, ~200 checks: every role's workflows, PWA/offline, responsive (6 sizes), accessibility, outage handling (see `frontend/e2e/README.md`) |

Results at handover: all green; `npm audit --omit=dev` reports 0 vulnerabilities (remaining
advisories are in build tooling only).

## Known limitations

- No offline write queue: offline, the app is read-only with the API (fully usable in demo mode).
- Camera QR scanning and the iOS installed app are untested on physical devices (the typed-asset-ID
  fallback is covered by tests).
- Shift capacity in the planner is a fixed "3 jobs per day" flag; real capacity needs shift hours and job
  estimates on work orders.
- Kiosk idle timeout (90 s) and roles/permissions are not configurable in Settings.
- Changing the planned day through the work order Edit form does not notify the technician
  (Assign / planner moves do).
- Single language (English) and light theme only.
