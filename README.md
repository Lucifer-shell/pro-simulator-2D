# 2D Kinematic Vector Simulator

A browser-based 2D projectile physics simulator built with vanilla JavaScript, HTML5 Canvas, and a Neo-Brutalist UI. No frameworks, no build step, no dependencies.

---

## Features

- **5 scenarios** — flat ground, ascending incline, descending incline, bounded ramp, elastic vertical barrier
- **Configurable physics** — launch velocity/angle, 4 gravity presets (Earth/Moon/Mars/Jupiter), quadratic air drag
- **Ramp launch control** — start from top or bottom of any ramp
- **Full 2D camera** — drag to pan, cursor-anchored scroll zoom, auto-follow, recenter
- **Live telemetry** — time, position, velocity, apogee, range; hover trajectory points for instant metrics
- **CSV export** — one-click download of the full trajectory
- **High-DPI rendering** — crisp on Retina displays
- **Zero dependencies** — works offline

---

## Quick Start

1. Place `simulator.html`, `styles.css`, and `app.js` in the same folder.
2. Open `simulator.html` in a modern browser.
3. Press **LAUNCH**.

For CSV export, serve over HTTP to avoid `file://` blob restrictions:

```bash
python -m http.server 8000
# open http://localhost:8000/simulator.html
