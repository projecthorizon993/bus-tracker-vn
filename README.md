# Bus Tracker VN

Simple web app that wraps the **BusMaps Widget** for Ho Chi Minh City and Hanoi, Vietnam.

## Live Demo
https://projecthorizon993.github.io/bus-tracker-vn/

## Features
- ✅ Free BusMaps widget - no API key required
- ✅ Real-time bus tracking map
- ✅ Works on mobile and desktop
- ✅ No build step - pure HTML/JS

## How it Works

The app is a simple iframe wrapper around the [BusMaps](https://busmaps.com) transit widget. The widget covers **90+ countries** including Vietnam with live bus tracking.

Open: `https://projecthorizon993.github.io/bus-tracker-vn/`

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main page with iframe widget |
| `style.css` | Fullscreen iframe styling |
| `app.js` | Sets the widget URL with Ho Chi Minh City coordinates |
| `wrangler.toml` | Cloudflare Worker config (legacy) |

## Want Real-Time Bus Data?

Get a free API key at [https://busmaps.com/en/developers](https://busmaps.com/en/developers) and add it as `?key=YOUR_KEY` to the iframe URL in `index.html`.
