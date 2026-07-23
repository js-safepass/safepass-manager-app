# Store assets checklist — SafePass Manager

Sizes are current store requirements; confirm against the console at submission
time (Apple/Google update device classes periodically). Put finished art in this
directory (e.g. `store/assets/`) or your design system.

## Google Play
| Asset | Spec | Status |
|---|---|---|
| App icon | 512×512 PNG, 32-bit (with alpha) | ☐ ‹TBD› |
| Feature graphic | 1024×500 PNG/JPG (required) | ☐ ‹TBD› |
| Phone screenshots | 2–8; PNG/JPG; 16:9 or 9:16; each side 320–3840 px | ☐ ‹TBD› |
| 7" tablet screenshots | optional (only if promoting tablet) | ☐ |
| 10" tablet screenshots | optional | ☐ |

## Apple App Store
| Asset | Spec | Status |
|---|---|---|
| App icon | 1024×1024 PNG, no alpha, no rounded corners | ☐ ‹TBD› |
| iPhone 6.7"/6.9" screenshots | required; e.g. 1290×2796 / 1320×2868; 2–10 | ☐ ‹TBD› |
| iPhone 6.5" screenshots | fallback set if not using 6.9" only | ☐ |
| iPad 12.9"/13" screenshots | **only if the app supports iPad** | ☐ ‹TBD device support›|
| App preview video | optional | ☐ |

## Notes
- Screenshots should show real product surfaces: Dashboard, Visitors directory,
  Visit detail / check-in, Notifications. Avoid exposing real visitor PII — use
  the mock/demo data (`VITE_MANAGER_MOCK=true`).
- Decide **iPad support** before generating Apple assets — it changes the
  required screenshot set. (Capacitor iOS targets iPhone + iPad by default; set
  the device family in Xcode if iPhone-only.)
- Keep a neutral status-bar/time in captures; localize later if needed.
