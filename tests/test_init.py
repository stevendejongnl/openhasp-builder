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
