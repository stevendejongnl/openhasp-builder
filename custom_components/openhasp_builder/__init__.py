import hashlib
import os
import logging
from aiohttp import web
from homeassistant.core import HomeAssistant
from homeassistant.components import panel_custom
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.setup import async_setup_component
from .const import DOMAIN, PANEL_URL_PATH, PANEL_TITLE, PANEL_ICON, STORAGE_SUBDIR
from .storage import PlateStore

_LOGGER = logging.getLogger(__name__)


def _bundle_fingerprint(path: str) -> str:
    """Short content hash of the panel bundle, used to cache-bust `module_url`.

    The bundle is served from a fixed URL, and the HA frontend (browser module
    cache + service worker) will happily keep serving a previously imported
    copy after a redeploy, so a fresh build silently does nothing. Keying the
    URL on content makes every deploy a new URL automatically -- no manual
    version bumping to forget."""
    try:
        with open(path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()[:12]
    except OSError:
        _LOGGER.warning("Panel bundle missing at %s; serving without cache-busting", path)
        return "missing"


class PanelLoaderView(HomeAssistantView):
    """A tiny, never-cached module that imports the real bundle by content hash.

    HA bakes `module_url` into the panel config once, at startup, and
    Cloudflare plus the frontend's service worker cache whatever URL that is,
    so a redeployed bundle only reached browsers after an HA restart. The panel
    points at this loader instead. It is served `no-store`, and names the
    bundle by its *current* hash on every request, so a new build is a new URL
    on the next page load -- no restart."""

    url = f"/api/{DOMAIN}/static/loader.js"
    name = "api:openhasp_builder:loader"
    requires_auth = False  # the bundle itself is served unauthenticated too

    def __init__(self, hass: HomeAssistant, bundle_path: str):
        self.hass = hass
        self.bundle_path = bundle_path
        self._memo: tuple[tuple[float, int], str] | None = None

    def _fingerprint(self) -> str:
        try:
            st = os.stat(self.bundle_path)
            key = (st.st_mtime, st.st_size)
        except OSError:
            return _bundle_fingerprint(self.bundle_path)
        if self._memo is None or self._memo[0] != key:
            self._memo = (key, _bundle_fingerprint(self.bundle_path))
        return self._memo[1]

    async def get(self, request: web.Request) -> web.Response:
        fingerprint = await self.hass.async_add_executor_job(self._fingerprint)
        body = f'import "/api/{DOMAIN}/static/openhasp-builder-panel.js?v={fingerprint}";\n'
        return web.Response(
            text=body,
            content_type="text/javascript",
            headers={"Cache-Control": "no-store"},
        )


async def async_register_panel(hass: HomeAssistant) -> None:
    frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")
    bundle_path = os.path.join(frontend_dir, "openhasp-builder-panel.js")
    await hass.http.async_register_static_paths([
        StaticPathConfig(
            f"/api/{DOMAIN}/static/openhasp-builder-panel.js",
            bundle_path,
            cache_headers=False,
        ),
        # Static assets (fonts, etc) never change content at a fixed name --
        # served as a directory so new assets don't need a code change here.
        StaticPathConfig(
            f"/api/{DOMAIN}/static/assets",
            frontend_dir,
            cache_headers=True,
        ),
    ])
    hass.http.register_view(PanelLoaderView(hass, bundle_path))
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="openhasp-builder-panel",
        frontend_url_path=PANEL_URL_PATH,
        module_url=PanelLoaderView.url,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        require_admin=True,
    )


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    from .api import async_register_api_views

    await async_setup_component(hass, "http", {})

    storage_dir = hass.config.path(".storage", STORAGE_SUBDIR)
    store = PlateStore(storage_dir)
    hass.data.setdefault(DOMAIN, {})["store"] = store

    async_register_api_views(hass, store)
    await async_register_panel(hass)
    return True
