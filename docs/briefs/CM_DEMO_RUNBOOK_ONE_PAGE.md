# CM Demo Runbook (One Page)
## Ujjain Kumbh 2028 Digital Command Platform

## 1) Objective (2-Screen Demo)
- Public Unified Screen: registration, OTP, QR pass, complaints/help, and lookup.
- Ops Center: live queue, assign/resolve, urgency feed, escalation, admin-ops tab.

## 2) Pre-Demo Setup (5 minutes)
1. Open terminal in `d:\Ultimate_QR\kumbh_system`.
2. Install once: `npm install`.
3. Start app (recommended): `start-system.bat`.
4. If needed alternate start: `set PORT=8090 && node server.js`.
5. Health check in browser: `http://127.0.0.1:8090/api/health`.

## 3) URLs to Open
- Entry Hub: `http://127.0.0.1:8090/`
- Public Unified: `http://127.0.0.1:8090/ultimate-pro`
- Ops Center: `http://127.0.0.1:8090/ops` (fallback: `/control-room`)
- Admin (legacy optional): `http://127.0.0.1:8090/admin`

## 4) Demo Credentials
- Admin: `admin / Admin@123`
- Control Room: `control / Control@123`
- Police Officer: `police / Police@123`
- Queue Manager: `queue / Queue@123`

## 5) 12-Minute Live Flow
1. Open Entry Hub (`/`) and explain 2-screen architecture.
2. Go to Public Unified (`/ultimate-pro`) and register one family.
3. Verify OTP using test OTP shown by API response (mock mode).
4. Generate/show QR pass.
5. Raise one HELP or COMPLAINT ticket.
6. Go to Ops Center (`/ops`) and login as `control`.
7. Show queue item appears in real time.
8. Assign ticket to officer.
9. Resolve ticket and show status changed to CLOSED.
10. Highlight urgency feed, heatmap, and admin-ops controls.

## 6) Key Messages for CM
- Citizen response acceleration: issue creation to action in minutes.
- Field accountability: every assign/resolve action tracked.
- Safety-first operations: quick issue intake and rapid field response.
- Scalable architecture: suitable for high-volume Kumbh operations.
- Audit-ready governance: role-based access with log trail.

## 7) Contingency Plan (If Any Screen Fails)
1. Use Entry Hub (`/`) to navigate again.
2. Open direct fallback: `/control-room` instead of `/ops`.
3. Re-login with admin/control credentials.
4. If no open ticket, create one quickly from Public Unified screen.

## 8) Success Criteria (Demo Sign-Off)
- Registration completed with OTP verification.
- QR pass generated.
- Ticket created from public side.
- Ticket assigned and resolved in Ops Center.
- Dashboard/queue reflects final CLOSED status.

## 9) Validation Snapshot (Latest)
- Fresh instance validated on port 8090.
- `/ops` mapped to ops screen.
- End-to-end chain passed: register -> OTP verify -> QR -> ticket -> assign -> resolve.
