# Ujjain Kumbh 2028 Pro Upgrade

## 2025 Kumbh Analysis Summary

1. Crowd surges happened near high-density zones (major ghats, gate corridors, aarti windows).
2. Lost-person and lost-document tickets spiked at peak movement hours.
3. Manual queue sorting delayed response for some high-risk tickets.
4. Multi-lingual and low-literacy users needed a simpler complaint flow.
5. Control room operators faced repetitive tasks during peaks.

## 2028 Upgrade Strategy (Implemented in This Sprint)

1. Pro citizen module with face + QR lifecycle:
- Registration start with face image
- OTP verification
- Instant QR pass generation
- Phone-based QR lookup

2. Control room pro acceleration:
- Urgency scoring feed for open/in-progress tickets
- Auto assign of open unassigned queue
- Auto escalation run for due items

3. Data readiness for CM demo:
- Bulk seed endpoint for 50 registrations + 50 tickets + diversified criteria coverage

4. Mahakal-themed UX direction:
- Saffron + white citizen-first theme
- Mahakal inspired visual integration

## New/Upgraded Endpoints

1. GET /api/insights/kumbh-2025-analysis
2. GET /api/pro/registration/by-phone/:phone
3. GET /api/pro/registration/:id/qr
4. GET /api/control-room/priority-feed?limit=12
5. POST /api/control-room/auto-assign-open
6. POST /api/control-room/resolve-quick/:ticketId
7. POST /api/admin/demo-seed-bulk

## New/Upgraded Pages

1. /ultimate-pro
2. /control-room (enhanced with pro operation tools)
3. /admin (bulk seed control + Mahakal visual)

## CM Demo Flow (Advanced)

1. Open /ultimate-pro and show 2025 analysis block.
2. Start registration with face image and verify OTP.
3. Generate QR pass and show phone-based QR lookup.
4. Raise HELP/COMPLAINT ticket from same page.
5. Open /control-room and run urgency feed.
6. Trigger auto-assign and auto-escalate.
7. Show KPI movement in dashboard.

## Next Upgrade Queue (Can Continue Iteratively)

1. Geo-zone routing with sector heatmap tiles.
2. Voice complaint capture + speech-to-text (Hindi/Marathi).
3. Public transport and parking occupancy module.
4. Drone feed event tagging and incident replay timeline.
5. Offline kiosk sync conflict resolution workflow.
6. Festival peak predictor (hourly demand forecast).
