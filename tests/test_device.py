import asyncio
import base64
import struct
from unittest.mock import patch
import zlib

import pytest
from homeassistant.setup import async_setup_component

from custom_components.openhasp_builder import device
from custom_components.openhasp_builder.api import async_register_api_views
from custom_components.openhasp_builder.storage import PlateStore


def make_bmp(pixels, width, height, top_down=True):
    """A 16-bit RGB565 BMP laid out exactly like the one openHASP serves
    (BI_BITFIELDS, 66-byte header, negative height = top-down)."""
    rows = [pixels[y * width:(y + 1) * width] for y in range(height)]
    if not top_down:
        rows.reverse()
    pad = (-(width * 2)) % 4
    body = b"".join(struct.pack(f"<{width}H", *row) + b"\x00" * pad for row in rows)
    header = (
        b"BM" + struct.pack("<IHHI", 66 + len(body), 0, 0, 66)
        + struct.pack("<IiiHHIIiiII", 40, width, -height if top_down else height, 1, 16, 3, len(body), 2836, 2836, 0, 0)
        + struct.pack("<III", 0xF800, 0x07E0, 0x001F)
    )
    return header + body


def decode_png(png):
    """Minimal PNG reader for the files bmp_to_png writes: returns (w, h, rows of (r,g,b))."""
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    pos, idat, size = 8, b"", None
    while pos < len(png):
        (length,) = struct.unpack_from(">I", png, pos)
        kind = png[pos + 4:pos + 8]
        payload = png[pos + 8:pos + 8 + length]
        (crc,) = struct.unpack_from(">I", png, pos + 8 + length)
        assert crc == zlib.crc32(kind + payload), "bad chunk CRC"
        if kind == b"IHDR":
            size = struct.unpack(">II", payload[:8])
        elif kind == b"IDAT":
            idat += payload
        pos += 12 + length
    w, h = size
    raw = zlib.decompress(idat)
    stride = 1 + w * 3
    rows = []
    for y in range(h):
        assert raw[y * stride] == 0  # filter type 0
        row = raw[y * stride + 1:(y + 1) * stride]
        rows.append([tuple(row[x * 3:x * 3 + 3]) for x in range(w)])
    return w, h, rows


RED, GREEN, BLUE, BLACK = 0xF800, 0x07E0, 0x001F, 0x0000


def test_bmp_colours_use_lvgl_rounding_not_bit_replication():
    png, w, h = device.bmp_to_png(make_bmp([RED, GREEN, BLUE, BLACK], 4, 1))
    assert (w, h) == (4, 1)
    _, _, rows = decode_png(png)
    assert rows[0] == [(255, 0, 0), (0, 255, 0), (0, 0, 255), (0, 0, 0)]
    # a grey from the dashboard: #1c1c1c -> RGB565 (3,7,3) -> (25,28,25), as measured on the panel
    png, _, _ = device.bmp_to_png(make_bmp([(3 << 11) | (7 << 5) | 3], 1, 1))
    assert decode_png(png)[2][0][0] == (25, 28, 25)


def test_top_down_and_bottom_up_bitmaps_give_the_same_picture():
    px = [RED, GREEN, BLUE, BLACK, RED, BLUE]  # 3 wide, 2 tall
    top = decode_png(device.bmp_to_png(make_bmp(px, 3, 2, top_down=True))[0])[2]
    bottom = decode_png(device.bmp_to_png(make_bmp(px, 3, 2, top_down=False))[0])[2]
    assert top == bottom
    assert top[0][0] == (255, 0, 0) and top[1][2] == (0, 0, 255)


def test_row_padding_is_skipped():
    # width 3 -> 6 bytes per row, padded to 8
    _, _, rows = decode_png(device.bmp_to_png(make_bmp([RED, GREEN, BLUE] * 2, 3, 2))[0])
    assert rows[1] == [(255, 0, 0), (0, 255, 0), (0, 0, 255)]


@pytest.mark.parametrize("bad", [b"", b"not a bmp at all" * 10, b"BM" + b"\x00" * 60])
def test_garbage_is_rejected_not_crashed_on(bad):
    with pytest.raises(device.DeviceScreenshotError):
        device.bmp_to_png(bad)


def test_truncated_pixel_data_is_rejected():
    data = make_bmp([RED] * 16, 4, 4)
    with pytest.raises(device.DeviceScreenshotError):
        device.bmp_to_png(data[:-10])


def test_only_private_addresses_are_fetched():
    assert device.is_lan_address("192.168.1.50")
    assert device.is_lan_address("10.0.0.7")
    assert not device.is_lan_address("8.8.8.8")
    assert not device.is_lan_address("example.com")
    assert not device.is_lan_address("")


@pytest.mark.asyncio
async def test_device_is_found_through_the_openhasp_entity(hass):
    hass.states.async_set("openhasp.somename", "1", {"node": "dash", "ip": "192.168.1.50"})
    hass.states.async_set("openhasp.other", "1", {"node": "other", "ip": "192.168.1.51"})
    hass.states.async_set("sensor.unrelated", "1", {"node": "dash", "ip": "6.6.6.6"})
    assert device.find_device_ip(hass, "dash") == "192.168.1.50"
    assert device.find_device_ip(hass, "missing") is None


async def _client(hass, hass_client, tmp_path):
    await async_setup_component(hass, "http", {})
    async_register_api_views(hass, PlateStore(str(tmp_path)))
    return await hass_client()


URL = "/api/openhasp_builder/plates/dash/device_screenshot"


@pytest.mark.asyncio
async def test_endpoint_returns_a_png(hass, hass_client, tmp_path, aioclient_mock):
    client = await _client(hass, hass_client, tmp_path)
    hass.states.async_set("openhasp.dash", "1", {"node": "dash", "ip": "192.168.1.50"})
    aioclient_mock.get("http://192.168.1.50/screenshot?q=0", content=make_bmp([RED, GREEN, BLUE, BLACK], 2, 2))
    resp = await client.get(URL)
    assert resp.status == 200
    body = await resp.json()
    assert (body["width"], body["height"]) == (2, 2)
    assert decode_png(base64.b64decode(body["png_base64"]))[2][0][0] == (255, 0, 0)


@pytest.mark.asyncio
async def test_endpoint_404_when_no_device_is_known(hass, hass_client, tmp_path):
    client = await _client(hass, hass_client, tmp_path)
    assert (await client.get(URL)).status == 404


@pytest.mark.asyncio
async def test_endpoint_refuses_a_public_address(hass, hass_client, tmp_path, aioclient_mock):
    client = await _client(hass, hass_client, tmp_path)
    hass.states.async_set("openhasp.dash", "1", {"node": "dash", "ip": "8.8.8.8"})
    resp = await client.get(URL)
    assert resp.status == 400
    assert aioclient_mock.call_count == 0  # nothing was fetched


@pytest.mark.asyncio
async def test_endpoint_424_when_the_device_is_down(hass, hass_client, tmp_path, aioclient_mock):
    client = await _client(hass, hass_client, tmp_path)
    hass.states.async_set("openhasp.dash", "1", {"node": "dash", "ip": "192.168.1.50"})
    aioclient_mock.get("http://192.168.1.50/screenshot?q=0", status=500)
    assert (await client.get(URL)).status == 424


@pytest.mark.asyncio
async def test_endpoint_424_when_the_device_sends_junk(hass, hass_client, tmp_path, aioclient_mock):
    client = await _client(hass, hass_client, tmp_path)
    hass.states.async_set("openhasp.dash", "1", {"node": "dash", "ip": "192.168.1.50"})
    aioclient_mock.get("http://192.168.1.50/screenshot?q=0", content=b"<html>nope</html>")
    assert (await client.get(URL)).status == 424


@pytest.mark.asyncio
async def test_endpoint_rejects_a_path_traversal_plate_id(hass, hass_client, tmp_path):
    client = await _client(hass, hass_client, tmp_path)
    assert (await client.get("/api/openhasp_builder/plates/..%2Fetc/device_screenshot")).status in (400, 404)


@pytest.mark.asyncio
async def test_plate_is_matched_by_friendly_name_when_attributes_are_missing(hass):
    """Right after an HA restart the entity has only friendly_name/icon/numPages."""
    hass.states.async_set("openhasp.plate", "1", {"friendly_name": "living_room", "numPages": 12})
    assert device.find_device_ip(hass, "living_room") is None  # known plate, address not yet reported


@pytest.mark.asyncio
async def test_panel_is_asked_to_report_its_address_and_waited_for(hass):
    hass.states.async_set("openhasp.plate", "1", {"friendly_name": "living_room", "numPages": 12})
    asked = []

    async def fake_publish(call):
        asked.append((call.data["topic"], call.data["payload"]))
        # the panel answers with a status update, which gives the entity its attributes
        hass.states.async_set("openhasp.plate", "1", {"friendly_name": "living_room", "node": "living_room", "ip": "192.168.1.115"})

    hass.services.async_register("mqtt", "publish", fake_publish)
    assert await device.resolve_device_ip(hass, "living_room") == "192.168.1.115"
    assert asked == [("hasp/living_room/command/statusupdate", "")]


@pytest.mark.asyncio
async def test_panel_is_not_asked_when_the_address_is_already_known(hass):
    hass.states.async_set("openhasp.plate", "1", {"node": "living_room", "ip": "192.168.1.115"})
    asked = []

    async def fake_publish(call):
        asked.append(call)

    hass.services.async_register("mqtt", "publish", fake_publish)
    assert await device.resolve_device_ip(hass, "living_room") == "192.168.1.115"
    assert asked == []


@pytest.mark.asyncio
async def test_gives_up_when_the_panel_never_answers(hass, monkeypatch):
    monkeypatch.setattr(device, "_STATUS_WAIT_SECONDS", 0.3)
    hass.states.async_set("openhasp.plate", "1", {"friendly_name": "living_room"})

    async def silent(call):
        pass

    hass.services.async_register("mqtt", "publish", silent)
    assert await device.resolve_device_ip(hass, "living_room") is None


@pytest.mark.asyncio
async def test_no_mqtt_service_means_no_address_not_a_crash(hass):
    hass.states.async_set("openhasp.plate", "1", {"friendly_name": "living_room"})
    assert await device.resolve_device_ip(hass, "living_room") is None


@pytest.mark.asyncio
async def test_a_screenshot_that_arrives_in_pieces_is_read_completely(hass, hass_client, tmp_path):
    """Regression: `content.read(n)` returned only the first chunk of a real,
    slowly delivered screenshot and the decoder then saw 'truncated pixel data'."""
    from aiohttp import web
    from aiohttp.test_utils import TestServer

    bmp = make_bmp([RED, GREEN, BLUE, BLACK] * 2000, 80, 100)

    async def slow(request):
        resp = web.StreamResponse(headers={"Content-Length": str(len(bmp))})
        await resp.prepare(request)
        for i in range(0, len(bmp), 1500):  # several small writes, with pauses
            await resp.write(bmp[i:i + 1500])
            await asyncio.sleep(0.01)
        return resp

    app = web.Application()
    app.router.add_get("/screenshot", slow)
    server = TestServer(app)
    await server.start_server()
    try:
        client = await _client(hass, hass_client, tmp_path)
        hass.states.async_set("openhasp.dash", "1", {"node": "dash", "ip": "127.0.0.1"})
        with patch.object(device, "_device_url", lambda ip: f"http://127.0.0.1:{server.port}/screenshot"):
            resp = await client.get(URL)
        assert resp.status == 200
        body = await resp.json()
        assert (body["width"], body["height"]) == (80, 100)
    finally:
        await server.close()
