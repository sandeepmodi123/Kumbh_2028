# Ultimate QR Project Structure

## Root Layout

```text
D:\Ultimate_QR
├── docs/
│   ├── INDEX.md
│   ├── briefs/
│   │   ├── DEMO_READY.md
│   │   ├── FINAL_DELIVERY_SUMMARY.md
│   │   ├── KUMBH_2028_PRO_ANALYSIS_AND_ROADMAP.md
│   │   ├── QUICK_REFERENCE.txt
│   │   └── README_COMPLETE.md
│   └── cm-presentation/
│       ├── pro-flowchart.html
│       ├── pro-flowchart-hi.html
│       └── swimlane-flowchart.html
├── kumbh_system/
│   ├── data/
│   ├── public/
│   │   ├── admin.html
│   │   ├── app.js
│   │   ├── control-room.html
│   │   ├── index.html
│   │   ├── mahakal-visual.svg
│   │   ├── public-basic.html
│   │   ├── styles.css
│   │   └── ultimate-pro-face-qr.html
│   ├── otpProvider.js
│   ├── package.json
│   ├── package-lock.json
│   ├── README.md
│   ├── server.js
│   └── start-system.bat
```

## What To Use

### Run the app
- Folder: `kumbh_system/`
- Start file: `kumbh_system/server.js`
- Public UI: `kumbh_system/public/`

### Two-screen model (current)
- Unified entry hub: `/` -> `kumbh_system/public/index.html`
- Public unified screen: `/ultimate-pro` -> `kumbh_system/public/ultimate-pro-face-qr.html`
- Ops center (Control + Admin Ops tab): `/ops` and `/control-room` -> `kumbh_system/public/control-room.html`
- Legacy backup public screen: `/public-basic.html` -> `kumbh_system/public/public-basic.html`
- Legacy admin page (optional): `/admin` -> `kumbh_system/public/admin.html`

### Demo / CM presentation
- Folder: `docs/briefs/`
- Flowcharts: `docs/cm-presentation/`

## Important Runtime Files

- `kumbh_system/server.js` - main backend server
- `kumbh_system/public/index.html` - two-screen landing page (public + ops entry)
- `kumbh_system/public/control-room.html` - command center UI
- `kumbh_system/public/ultimate-pro-face-qr.html` - public pro registration and QR module
- `kumbh_system/public/public-basic.html` - preserved legacy public flow backup
- `kumbh_system/public/admin.html` - admin panel
- `kumbh_system/data/` - SQLite database storage

## Historical / Support Files

- `docs/briefs/plans/` - planning and architecture HTML files

## Cleanup Applied

- Removed: `kumbh_system/server-v2-complete.js`
- Removed: `face_approch/`
- Removed: `files.zip`
- Removed: `start.log`
