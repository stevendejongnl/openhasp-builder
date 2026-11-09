# openHASP Builder

A visual editor for [openHASP](https://www.openhasp.com) touch-display plates.
It runs inside Home Assistant as a custom panel.

You edit a plate on a canvas that looks like the real display.
When you are done, you publish it back to the plate's config files.

## What it does

- **Import** a plate from your openHASP files (`<id>_pages.jsonl` and `<id>.yaml`).
  Import again at any time to get the latest files. The old state is saved to history first.
- **Edit** layers: select, drag, nudge with the arrow keys, change text, colours, fonts and Home Assistant bindings.
  Layers are grouped by the comments in the jsonl file.
- **Preview** the result as the device draws it: same font, text placement and colours.
- **Compare with device** shows a live screenshot of the panel over the canvas.
  A *difference* mode shows only the pixels that do not match.
- **Publish** with a confirmation step. Every publish is saved as a version you can restore.
- The panel follows your Home Assistant theme (light, dark or custom).

## Requirements

- Home Assistant with the [openHASP custom component](https://github.com/HASwitchPlate/openHASP-custom-component) already set up.
- An administrator account (the panel is admin-only).
- Node.js 18 or newer to build the panel once.

## Install

1. Build the panel. The built file is not stored in git.

   ```sh
   cd frontend
   npm install
   npm run build
   ```

   The build writes into `custom_components/openhasp_builder/frontend/`.

2. Copy the folder `custom_components/openhasp_builder` to `<config>/custom_components/` on your Home Assistant.

3. Add this line to `configuration.yaml`:

   ```yaml
   openhasp_builder:
   ```

4. Restart Home Assistant. A new item, **OpenHASP Builder**, appears in the sidebar.

A change to the frontend shows on the next page load. A change to the Python files needs a restart.

## Use

Open **OpenHASP Builder**. The picker lists the plates it found in `/config/openhasp/` and the plates you already stored.
Pick one and press **Import** or **Open**.

| To do this | Do this |
|---|---|
| Select a layer or group | Click it in the Layers list or on the canvas |
| Move a layer | Drag it, or use the arrow keys (hold Shift for 5 px), or the X/Y fields |
| Re-read the device files | Publish menu → **Import live from device** |
| Check the preview against the device | **Compare with device** in the bar above the canvas |
| Save without publishing | `Ctrl`+`S` |

The builder reads and writes only these files:
`/config/openhasp/<id>_pages.jsonl` and `/config/openhasp_configs/<id>.yaml`.
It never writes before you press **Publish**.

## Develop

```sh
# backend tests (this installs Home Assistant, so use a virtual environment)
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
pytest

# frontend
cd frontend
npm test            # unit tests
npm run build       # build the panel
```

The code that decides how the device draws things is in `frontend/src/lib/`.
Each rule there was measured on a screenshot of a real panel, and the tests keep it that way.

## License

AGPL-3.0-only. See [LICENSE](LICENSE).

Bundled fonts keep their own licenses, next to the font files in `frontend/public/`:

| Font | License |
|---|---|
| Roboto Condensed | Apache-2.0 (`ROBOTO-CONDENSED-LICENSE.txt`) |
| Montserrat | SIL OFL 1.1 (`MONTSERRAT-OFL.txt`) |
| Material Design Icons | Pictogrammers Free License (`MDI-LICENSE.txt`) |
