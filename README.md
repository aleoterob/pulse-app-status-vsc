# Pulse App Status

<sub>by <a href="mailto:aleoterob@gmail.com">Ale Otero</a></sub>

Pulse App Status is a VS Code panel extension to inspect localhost ports and stop processes quickly.

[Repository](https://github.com/aleoterob/pulse-app-status-vsc)

[![Donate](https://img.shields.io/badge/Donate-PayPal-00457C?logo=paypal&logoColor=white)](https://paypal.me/aleoterob)

## What It Does

- Scans active localhost ports.
- Shows process runtime and app name when available.
- Prioritizes Node/Bun processes at the top.
- Detects Docker published ports and allows stopping Docker containers.
- Lets you open each port in the browser.

![Pulse App Status screenshot](https://raw.githubusercontent.com/aleoterob/pulse-app-status-vsc/master/media/screenshot.png)

## How To Use

1. Open the Pulse App Status panel.
2. Click `Refresh` to rescan ports.
3. Click `Open` to open `http://localhost:<port>`.
4. Click `Stop` to stop a process or Docker container (with confirmation dialog).

## Enable / Disable / Uninstall

VS Code manages this from the extension details page:

1. Open Extensions view (`Ctrl+Shift+X`).
2. Search for `Pulse App Status` and open details.
3. Use the built-in actions to:
   - Enable / Disable
   - Disable (Workspace)
   - Uninstall

You can also open Pulse App Status details directly from the panel title bar using the info icon.

## Notes

- Stopping Docker containers requires Docker engine availability.
- If Docker engine is unavailable, Docker entries may not appear.
