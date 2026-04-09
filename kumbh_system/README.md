# Kumbh QR Face Enterprise Demo

This is a runnable end-to-end system for Ujjain Kumbh operations:
- Common QR scan entry
- Family registration with duplicate prevention and OTP completion
- Mandatory face capture and mandatory two-phone registration
- Help/Complaint ticketing with strict Kumbh categories
- Control-room queue with assign, face-match, resolve, and escalation run
- Authenticated admin/control-room dashboards with RBAC and audit trail

## Repository structure

- `kumbh_system/` contains runnable code only
- `../docs/briefs/` contains demo notes, summaries, and roadmap documents
- `../docs/cm-presentation/` contains CM presentation flowcharts
- `../docs/INDEX.md` is the documentation entry point

## Implemented rule set

- Registration requires: `headName`, `phone`, `relativePhone`, `language`, `facePhoto`
- OTP verification is final step, after dependent addition stage
- Action type allowed only: `HELP`, `COMPLAINT`
- Action category must match the selected action type
- Action phone is mandatory
- Direct media capture/upload only (no URL fields)
- Video duration max: 20 seconds

## Enterprise features in this build

- JWT login: `/api/auth/login`
- RBAC roles:
	- `ADMIN`
	- `CONTROL_ROOM`
- Protected admin/control-room APIs
- Audit logging for critical operations (login, status updates, assignments, resolutions, escalations)
- SLA due-time on ticket creation and escalation engine endpoint

Default demo users:
- `admin` / `Admin@123`
- `control` / `Control@123`

## Run

1. Open terminal in this folder.
2. Install dependencies:

```bash
npm install
```

3. Start server:

```bash
npm start
```

4. Open on laptop:

```text
http://localhost:8080
```

If `8080` is already in use:

```bash
set PORT=8081 && npm start
```

## Test on phone (same Wi-Fi)

1. Find laptop IP (example `192.168.1.15`).
2. Open:

```text
http://<LAPTOP_IP>:8080
```

Server binds to `0.0.0.0` for laptop + phone access.

## API surface

Public:
- `GET /api/health`
- `GET /api/qr`
- `POST /api/auth/login`
- `POST /api/register/start`
- `POST /api/register/dependent`
- `POST /api/register/verify-otp`
- `POST /api/action/report`

Protected (`ADMIN` or `CONTROL_ROOM` unless noted):
- `GET /api/admin/summary`
- `PATCH /api/admin/tickets/:id/status`
- `GET /api/control-room/queue`
- `GET /api/control-room/face-match/:ticketId`
- `POST /api/control-room/assign/:ticketId`
- `POST /api/control-room/resolve/:ticketId`
- `POST /api/control-room/escalations/run`
- `POST /api/admin/demo-seed` (`ADMIN` only)

## OTP adapter modes

Set env var `OTP_MODE` before starting server:
- `MOCK` (default): OTP returned in API response for testing
- `LOG`: OTP logged in terminal for testing
- `VENDOR`: plug real SMS provider in `otpProvider.js`

## Storage

- SQLite database: `data/kumbh.db`
- Main tables: `registrations`, `dependents`, `tickets`, `users`, `audit_logs`
