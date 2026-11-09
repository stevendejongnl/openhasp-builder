import pytest
from unittest.mock import patch

from custom_components.openhasp_builder.const import DOMAIN, DEFAULT_DEVICE_PROFILES


def test_domain_is_openhasp_builder():
    assert DOMAIN == "openhasp_builder"


def test_default_device_profiles_include_square_480():
    profile_ids = [p.id for p in DEFAULT_DEVICE_PROFILES]
    assert "square_480" in profile_ids
    square = next(p for p in DEFAULT_DEVICE_PROFILES if p.id == "square_480")
    assert square.width == 480
    assert square.height == 480


from custom_components.openhasp_builder import async_setup


@pytest.mark.asyncio
async def test_async_setup_registers_panel(hass):
    with patch("custom_components.openhasp_builder.async_register_panel") as mock_register:
        result = await async_setup(hass, {})
        assert result is True
        mock_register.assert_called_once()


from homeassistant.setup import async_setup_component
from custom_components.openhasp_builder import PanelLoaderView


@pytest.mark.asyncio
async def test_panel_loader_names_the_bundle_by_its_current_hash(hass, hass_client, tmp_path):
    """A redeployed bundle must get a new URL without an HA restart."""
    await async_setup_component(hass, "http", {})
    bundle = tmp_path / "bundle.js"
    bundle.write_text("console.log('v1')")
    hass.http.register_view(PanelLoaderView(hass, str(bundle)))
    client = await hass_client()

    first = await client.get(PanelLoaderView.url)
    assert first.status == 200
    assert first.headers["Content-Type"].startswith("text/javascript")
    # never cached by the browser, the service worker or a CDN
    assert first.headers["Cache-Control"] == "no-store"
    body1 = await first.text()
    assert body1.startswith('import "/api/openhasp_builder/static/openhasp-builder-panel.js?v=')

    bundle.write_text("console.log('v2 -- a different build')")
    body2 = await (await client.get(PanelLoaderView.url)).text()
    assert body2 != body1


@pytest.mark.asyncio
async def test_panel_loader_is_stable_while_the_bundle_is_unchanged(hass, hass_client, tmp_path):
    await async_setup_component(hass, "http", {})
    bundle = tmp_path / "bundle.js"
    bundle.write_text("same")
    hass.http.register_view(PanelLoaderView(hass, str(bundle)))
    client = await hass_client()
    assert await (await client.get(PanelLoaderView.url)).text() == await (await client.get(PanelLoaderView.url)).text()
