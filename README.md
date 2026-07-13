# GeoMine Predictive Maintenance System (PMS)

Frontend-only industrial demo app. Runs entirely in the browser with `localStorage` as the database. No backend, no build step, no Node.js runtime required — just open `index.html` in any modern browser.

## Quick start

1. Open `index.html` in a browser.
2. Sign in with a demo account (see below) or create a new Miner account.
3. The app redirects to `dashboard.html` automatically.

## Demo accounts

| Role   | Email                  | Password |
|--------|------------------------|----------|
| Admin  | admin@geomine.com      | admin123 |
| Miner  | miner@geomine.com      | miner123 |
| IT     | it@geomine.com         | it123    |

- **Admin / IT**: full fleet analytics, charts, AI insights, CSV export, demo controls.
- **Miner**: can log generator readings, view own submissions, and see a read-only fleet status screen.

## Project structure

```
geomine-pms/
├── index.html            # Login page
├── signup.html           # Miner registration
├── dashboard.html        # Main app shell (all screens)
├── css/
│   ├── auth.css          # Login / signup glass-card theme
│   ├── dashboard.css     # Industrial dark theme, layout, components
│   ├── animations.css    # Keyframes, page transitions
│   └── responsive.css    # Tablet & mobile breakpoints
├── js/
│   ├── utils.js          # Shared helpers, PARAM_DEFS, THEME
│   ├── store.js          # localStorage "database", seed data, users, session, activity
│   ├── auth.js           # Login, signup, session persistence, role redirects
│   ├── health.js         # All metric & health calculations (preserved verbatim)
│   ├── notifications.js  # Toast system + notification centre
│   ├── charts.js         # Chart.js visualisations (trends, doughnut, bar, gauge)
│   ├── simulation.js     # Live data walk (± current, rpm, temp, pf)
│   ├── csv.js            # CSV export of readings
│   ├── demo-enhancements.js  # AI insights, activity feed, demo controls
│   └── dashboard.js      # Rendering, navigation, wiring, init
├── assets/
│   ├── logo.svg          # GeoMine brand mark
│   └── favicon.png       # 64×64 branded favicon
└── README.md
```

## Key features

- **Generator monitoring** — 6 seeded generators with realistic 14-day history.
- **Primary parameters** — Current (A), RPM, Temperature (°C), Power Factor. All other metrics (loading, kVA, kW, frequency, thermal stress, health index, maintenance priority, fuel efficiency) are calculated from these.
- **Live simulation** — every 4 s the latest readings nudge within realistic bands; charts, KPIs, health, recommendations and status update live.
- **Charts** — Temperature, Current, RPM and Power Factor fleet trend lines; Fleet Health doughnut; Maintenance Priority bar chart; per-machine Health Gauge and parameter trends on the detail screen.
- **Health engine** — colour-coded health index, maintenance priority score, thermal stress, power factor trend, overload/idle minutes.
- **AI Insights** — rule-based predictive messages with confidence percentages (bearing overheating, high loading, cooling efficiency, lubrication, PF degrading).
- **Notifications** — toast popups + slide-in notification centre for system events, warnings and demo actions.
- **Activity feed** — timeline of logins, submissions, exports, demo control usage and warnings.
- **Demo Controls** (admin only) — instant Healthy / Warning / Critical / Reset buttons for controlled demonstrations.
- **CSV Export** — filter by generator and date range.
- **Session** — "Remember Me" persists login across tabs; clears when unchecked.
- **Responsive** — sidebar collapses on mobile, chart grids reflow.

## Deployment

Works on GitHub Pages, Netlify, Render Static Sites, or any static host. Just upload the folder. No build step.

## Notes

- All data lives in `localStorage`. "Reset demo data" restores the original seeded dataset.
- Calculations mirror the original Postgres-backed system and were preserved verbatim.
- Charts use [Chart.js 4](https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js) from CDN.
- Icons use [Font Awesome 6](https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css) from CDN.
