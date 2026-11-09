# End-to-end tests

Browser tests that drive the production build in Google Chrome (via `playwright-core`, so no
browser download is needed).

```sh
npm run e2e                        # build, serve and run every suite (~8 minutes)
npm run e2e -- technician admin    # selected suites only
npm run e2e -- --no-build          # reuse the previous builds
```

The runner builds two variants and serves them with `vite preview`:

| Build          | Port | Purpose                                                         |
| -------------- | ---- | --------------------------------------------------------------- |
| `dist-e2e`     | 4173 | Demo data and demo sign-in: every role's workflows              |
| `dist-e2e-api` | 4174 | API mode with no API running: behaves like a full server outage |

| Suite            | Covers                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `admin`          | Dashboard, equipment register and QR labels, PM, inventory, reports, organization, users, settings  |
| `supervisor`     | Request review, work orders, Kanban board, week planner, technicians, equipment monitoring          |
| `technician`     | Jobs, start/pause/complete, checklist, photos, parts, scanning, history, profile (phone viewport)   |
| `operator`       | 3-step report, duplicate warning, request timeline through to "Fixed", kiosk PIN and idle sign-out  |
| `pwa-responsive` | Manifest, offline start, update prompt; every screen of every role at six viewport sizes            |
| `accessibility`  | axe-core WCAG 2.1 A/AA on 40 screens and states; skip link, dialog focus, keyboard drag             |
| `error-states`   | With the API unreachable, every screen shows an error with "Try again", never a crash or blank page |

Each suite exits non-zero on any failed check or browser console error. Screenshots are written
to `e2e/screenshots/` (git-ignored).

Environment variables: `CHROME_PATH` to use a specific Chrome/Chromium binary (default: the
installed stable Chrome), `E2E_BASE_URL` / `E2E_API_BASE_URL` to point at other servers.
