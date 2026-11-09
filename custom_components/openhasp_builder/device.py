"""Live screenshot of the real openHASP panel, for the "compare with device" overlay.

The panel serves `GET /screenshot` as a 16-bit RGB565 BMP over plain HTTP on the
LAN. A browser can't use that directly (mixed content from an HTTPS page, and
BMP-with-bitfields support is patchy), so the backend fetches it and converts it
to PNG. No new dependencies: the BMP decode and PNG encode are small and pure.
"""
from __future__ import annotations

import asyncio
import base64
import ipaddress
import logging
import struct
import sys
import time
import zlib
from array import array
from datetime import datetime, timezone

from aiohttp import ClientError, ClientTimeout
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

_LOGGER = logging.getLogger(__name__)

_MAX_BYTES = 4 * 1024 * 1024  # a 480x480x16bpp screenshot is ~460 kB; refuse anything absurd
_CACHE_SECONDS = 2.0
# The device (the upstream we depend on) failed. Not 502: Cloudflare, which sits in
# front of Home Assistant, replaces any origin 502 with its own bare "error code:
# 502" page, so the message explaining what went wrong would never reach the user.
_DEVICE_ERROR = 424
_STATUS_WAIT_SECONDS = 4.0  # how long to wait for a panel to report its address after we ask


class DeviceScreenshotError(Exception):
    """The device answered, but not with a screenshot we can decode."""


def find_device_ip(hass: HomeAssistant, plate_id: str) -> str | None:
    """The address of the panel running `plate_id`, from Home Assistant itself.

    The openHASP integration exposes one `openhasp.*` entity per plate. Its
    `friendly_name` is always the plate's node name; the `node` and `ip`
    attributes only appear once the panel has sent a status message, which is
    not the case for a while after Home Assistant restarts. No address has to
    be configured or stored anywhere."""
    for state in hass.states.async_all("openhasp"):
        node = state.attributes.get("node") or state.attributes.get("friendly_name")
        if node == plate_id:
            ip = state.attributes.get("ip")
            return str(ip) if ip else None
    return None


async def resolve_device_ip(hass: HomeAssistant, plate_id: str) -> str | None:
    """Like find_device_ip, but if the panel hasn't reported its address since
    Home Assistant started, ask it to (`statusupdate` over MQTT) and wait a moment."""
    ip = find_device_ip(hass, plate_id)
    if ip is not None:
        return ip
    try:
        await hass.services.async_call(
            "mqtt",
            "publish",
            {"topic": f"hasp/{plate_id}/command/statusupdate", "payload": ""},
            blocking=True,
        )
    except Exception:  # MQTT not set up, or the call failed: nothing more we can try
        _LOGGER.debug("Could not ask %s for a status update", plate_id, exc_info=True)
        return None
    deadline = time.monotonic() + _STATUS_WAIT_SECONDS
    while time.monotonic() < deadline:
        await asyncio.sleep(0.25)
        ip = find_device_ip(hass, plate_id)
        if ip is not None:
            return ip
    return None


def is_lan_address(ip: str) -> bool:
    """Only ever fetch from a private-network address (never a public host)."""
    try:
        return ipaddress.ip_address(ip).is_private
    except ValueError:
        return False


def _device_url(ip: str) -> str:
    return f"http://{ip}/screenshot?q=0"


def _expand_table(bits: int) -> list[int]:
    """LVGL expands n-bit channels with rounding (v * 255 / max), not by bit
    replication, so the colours here match what the canvas shows."""
    top = (1 << bits) - 1
    return [round(v * 255 / top) for v in range(top + 1)]


def _mask_info(mask: int) -> tuple[int, int]:
    """(shift, bit width) of a contiguous channel mask."""
    if mask == 0:
        return 0, 0
    shift = (mask & -mask).bit_length() - 1
    return shift, (mask >> shift).bit_length()


def bmp_to_png(data: bytes) -> tuple[bytes, int, int]:
    """Decode a 16-bit BMP (RGB565 via bitfields, as openHASP serves) into PNG
    bytes. Returns (png, width, height). Raises DeviceScreenshotError."""
    if len(data) < 54 or data[:2] != b"BM":
        raise DeviceScreenshotError("not a BMP file")
    (data_offset,) = struct.unpack_from("<I", data, 10)
    (dib_size,) = struct.unpack_from("<I", data, 14)
    width, height = struct.unpack_from("<ii", data, 18)
    (planes, bpp, compression) = struct.unpack_from("<HHI", data, 26)
    if dib_size < 40 or planes != 1 or bpp != 16 or compression not in (0, 3):
        raise DeviceScreenshotError(f"unsupported BMP (bpp={bpp}, compression={compression})")
    top_down = height < 0
    height = abs(height)
    if width <= 0 or height <= 0 or width > 4096 or height > 4096:
        raise DeviceScreenshotError(f"implausible size {width}x{height}")

    if compression == 3:
        if len(data) < 14 + 40 + 12:
            raise DeviceScreenshotError("truncated bitfield masks")
        mr, mg, mb = struct.unpack_from("<III", data, 54)
    else:  # BI_RGB at 16 bpp is RGB555
        mr, mg, mb = 0x7C00, 0x03E0, 0x001F
    (sr, br), (sg, bg), (sb, bb) = _mask_info(mr), _mask_info(mg), _mask_info(mb)
    if not (br and bg and bb):
        raise DeviceScreenshotError("invalid channel masks")

    row_bytes = ((width * 16 + 31) // 32) * 4
    if len(data) < data_offset + row_bytes * height:
        raise DeviceScreenshotError("truncated pixel data")

    tr, tg, tb = _expand_table(br), _expand_table(bg), _expand_table(bb)
    lut: list[bytes] = [b""] * 65536
    for p in range(65536):
        lut[p] = bytes((tr[(p & mr) >> sr], tg[(p & mg) >> sg], tb[(p & mb) >> sb]))

    rows: list[bytes] = []
    for y in range(height):
        start = data_offset + y * row_bytes
        px = array("H")
        px.frombytes(data[start : start + width * 2])
        if sys.byteorder == "big":
            px.byteswap()
        rows.append(b"\x00" + b"".join(lut[p] for p in px))  # PNG filter type 0 per row
    if not top_down:
        rows.reverse()  # BMP rows are stored bottom-up unless the height is negative

    def chunk(kind: bytes, payload: bytes) -> bytes:
        body = kind + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(b"".join(rows), 6))
        + chunk(b"IEND", b"")
    )
    return png, width, height


class DeviceScreenshotView(HomeAssistantView):
    url = "/api/openhasp_builder/plates/{plate_id}/device_screenshot"
    name = "api:openhasp_builder:device_screenshot"
    requires_auth = True

    def __init__(self, hass: HomeAssistant):
        self.hass = hass
        self._cache: dict[str, tuple[float, dict]] = {}

    async def get(self, request, plate_id):
        from .api import _invalid_plate_id_response  # shared trust-boundary check

        invalid = _invalid_plate_id_response(self, plate_id)
        if invalid is not None:
            return invalid

        cached = self._cache.get(plate_id)
        if cached and time.monotonic() - cached[0] < _CACHE_SECONDS:
            return self.json(cached[1])

        ip = await resolve_device_ip(self.hass, plate_id)
        if ip is None:
            return self.json_message(
                f"No openHASP device found for plate {plate_id!r}. Is it online in Home Assistant?",
                status_code=404,
            )
        if not is_lan_address(ip):
            return self.json_message(
                "The device address is not on a private network; refusing to fetch it.",
                status_code=400,
            )

        try:
            session = async_get_clientsession(self.hass)
            async with session.get(_device_url(ip), timeout=ClientTimeout(total=10)) as resp:
                if resp.status != 200:
                    return self.json_message(f"The device answered HTTP {resp.status}.", status_code=_DEVICE_ERROR)
                if (getattr(resp, "content_length", None) or 0) > _MAX_BYTES:
                    return self.json_message("The device sent an unexpectedly large screenshot.", status_code=_DEVICE_ERROR)
                # `resp.read()` waits for the whole body. (`content.read(n)` returns
                # whatever has arrived so far, which truncated real screenshots.)
                data = await resp.read()
        except (ClientError, TimeoutError):
            return self.json_message("The device did not answer.", status_code=_DEVICE_ERROR)
        if len(data) > _MAX_BYTES:
            return self.json_message("The device sent an unexpectedly large screenshot.", status_code=_DEVICE_ERROR)

        try:
            png, width, height = await self.hass.async_add_executor_job(bmp_to_png, data)
        except DeviceScreenshotError as err:
            _LOGGER.warning("Could not decode the screenshot of plate %s: %s", plate_id, err)
            return self.json_message(f"Could not read the device screenshot: {err}", status_code=_DEVICE_ERROR)

        body = {
            "png_base64": base64.b64encode(png).decode("ascii"),
            "width": width,
            "height": height,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
        self._cache[plate_id] = (time.monotonic(), body)
        return self.json(body)
