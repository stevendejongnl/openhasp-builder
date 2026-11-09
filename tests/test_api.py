import os
import shutil
import pytest
from homeassistant.setup import async_setup_component
from custom_components.openhasp_builder.storage import PlateStore
from custom_components.openhasp_builder.schema import Theme
from custom_components.openhasp_builder.api import async_register_api_views


@pytest.fixture(autouse=True)
def _clean_publish_output_dirs(hass):
    """hass.config.path() resolves to a shared, non-test-isolated
    `testing_config` directory (not tmp_path), so a successful publish in
    one test leaves jsonl/yaml files behind that can leak into later tests.
    Clean the publish output dirs before and after every test in this module."""
    def _clean():
        for subdir in ("openhasp", "openhasp_configs"):
            path = hass.config.path(subdir)
            shutil.rmtree(path, ignore_errors=True)

    _clean()
    yield
    _clean()


@pytest.mark.asyncio
async def test_get_missing_plate_returns_404(hass, hass_client, tmp_path):
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()
    resp = await client.get("/api/openhasp_builder/plates/nonexistent")
    assert resp.status == 404


@pytest.mark.asyncio
async def test_post_then_get_plate_round_trips(hass, hass_client, tmp_path):
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()

    plate_json = {
        "id": "dashboard", "device_profile_id": "square_480", "theme_id": "dark",
        "pages": [{"id": 1, "order": 0, "background": "#111111", "widgets": []}],
    }
    resp = await client.post("/api/openhasp_builder/plates/dashboard", json=plate_json)
    assert resp.status == 200

    resp2 = await client.get("/api/openhasp_builder/plates/dashboard")
    assert resp2.status == 200
    data = await resp2.json()
    assert data["theme_id"] == "dark"


@pytest.mark.asyncio
async def test_versions_list_and_restore(hass, hass_client, tmp_path):
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()

    plate_json = {
        "id": "dashboard", "device_profile_id": "square_480", "theme_id": "dark",
        "pages": [{"id": 1, "order": 0, "background": "#111111", "widgets": []}],
    }
    await client.post("/api/openhasp_builder/plates/dashboard", json=plate_json)
    store.add_version("dashboard", plate_json, label="Initial import", published=True)

    resp = await client.get("/api/openhasp_builder/plates/dashboard/versions")
    assert resp.status == 200
    versions = await resp.json()
    assert len(versions) == 1
    assert versions[0]["label"] == "Initial import"

    resp2 = await client.post("/api/openhasp_builder/plates/dashboard/versions/1/restore")
    assert resp2.status == 200


@pytest.mark.asyncio
async def test_publish_blocks_on_obj_id_collision(hass, hass_client, tmp_path):
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()

    plate_json = {
        "id": "dashboard", "device_profile_id": "square_480", "theme_id": "dark",
        "pages": [{"id": 1, "order": 0, "background": "#111111", "widgets": [
            {"widget_def_id": "raw", "x": 0, "y": 0, "w": 10, "h": 10, "page": 1,
             "params": {"obj_type": "label", "static_props": {}, "properties": {}, "event": {}},
             "obj_id_start": 5, "obj_id_end": 5, "disabled": False},
            {"widget_def_id": "raw", "x": 20, "y": 20, "w": 10, "h": 10, "page": 1,
             "params": {"obj_type": "label", "static_props": {}, "properties": {}, "event": {}},
             "obj_id_start": 5, "obj_id_end": 5, "disabled": False},
        ]}],
    }
    await client.post("/api/openhasp_builder/plates/dashboard", json=plate_json)

    resp = await client.post("/api/openhasp_builder/plates/dashboard/publish")
    assert resp.status == 200
    data = await resp.json()
    assert len(data["errors"]) > 0
    assert "collision" in data["errors"][0].lower()


@pytest.mark.asyncio
async def test_publish_blocked_does_not_write_files_or_add_version(hass, hass_client, tmp_path):
    """Self-review check: a validation-failing publish must not write jsonl/yaml
    output files and must not add a new version to the store."""
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()

    plate_json = {
        "id": "dashboard", "device_profile_id": "square_480", "theme_id": "dark",
        "pages": [{"id": 1, "order": 0, "background": "#111111", "widgets": [
            {"widget_def_id": "raw", "x": 0, "y": 0, "w": 10, "h": 10, "page": 1,
             "params": {"obj_type": "label", "static_props": {}, "properties": {}, "event": {}},
             "obj_id_start": 5, "obj_id_end": 5, "disabled": False},
            {"widget_def_id": "raw", "x": 20, "y": 20, "w": 10, "h": 10, "page": 1,
             "params": {"obj_type": "label", "static_props": {}, "properties": {}, "event": {}},
             "obj_id_start": 5, "obj_id_end": 5, "disabled": False},
        ]}],
    }
    await client.post("/api/openhasp_builder/plates/dashboard", json=plate_json)

    versions_before = store.list_versions("dashboard")
    assert versions_before == []

    resp = await client.post("/api/openhasp_builder/plates/dashboard/publish")
    assert resp.status == 200
    data = await resp.json()
    assert len(data["errors"]) > 0

    jsonl_path = hass.config.path("openhasp", "dashboard_pages.jsonl")
    yaml_path = hass.config.path("openhasp_configs", "dashboard.yaml")
    import os
    assert not os.path.exists(jsonl_path)
    assert not os.path.exists(yaml_path)

    versions_after = store.list_versions("dashboard")
    assert versions_after == []


@pytest.mark.asyncio
async def test_publish_label_is_server_generated_timestamp_not_client_header(hass, hass_client, tmp_path):
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()

    plate_json = {
        "id": "dashboard", "device_profile_id": "square_480", "theme_id": "dark",
        "pages": [{"id": 1, "order": 0, "background": "#111111", "widgets": []}],
    }
    await client.post("/api/openhasp_builder/plates/dashboard", json=plate_json)
    # deliberately do NOT send an X-Timestamp header
    resp = await client.post("/api/openhasp_builder/plates/dashboard/publish")
    assert resp.status == 200

    versions = store.list_versions("dashboard")
    assert len(versions) == 1
    assert versions[0].label != "Published "
    assert versions[0].label.startswith("Published ")
    assert len(versions[0].label) > len("Published ")  # actual timestamp content present


@pytest.mark.asyncio
async def test_publish_returns_clean_error_for_unknown_device_profile(hass, hass_client, tmp_path):
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()

    plate_json = {
        "id": "dashboard", "device_profile_id": "nonexistent_profile", "theme_id": "dark",
        "pages": [{"id": 1, "order": 0, "background": "#111111", "widgets": []}],
    }
    await client.post("/api/openhasp_builder/plates/dashboard", json=plate_json)

    resp = await client.post("/api/openhasp_builder/plates/dashboard/publish")
    assert resp.status == 200
    data = await resp.json()
    assert len(data["errors"]) > 0
    assert "nonexistent_profile" in data["errors"][0]


@pytest.mark.asyncio
async def test_restore_missing_version_returns_404_not_500(hass, hass_client, tmp_path):
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()

    resp = await client.post("/api/openhasp_builder/plates/dashboard/versions/99/restore")
    assert resp.status == 404


@pytest.mark.asyncio
async def test_get_themes_includes_builtin_dark(hass, hass_client, tmp_path):
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()

    resp = await client.get("/api/openhasp_builder/themes")
    assert resp.status == 200
    themes = await resp.json()
    ids = [t["id"] for t in themes]
    assert "dark" in ids


@pytest.mark.asyncio
async def test_post_theme_then_get_includes_custom_theme(hass, hass_client, tmp_path):
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()

    custom_theme = {
        "id": "light", "name": "Light",
        "colors": {"bg": "#FFFFFF", "card_bg": "#EEEEEE", "accent_on": "#4caf50",
                   "accent_off": "#999999", "text": "#000000", "text_muted": "#666666"},
        "fonts": {"family": "montserrat", "sizes": {"label": 16, "value": 24}},
        "spacing": {"grid_unit": 5, "corner_radius": 15, "padding": 10},
    }
    resp = await client.post("/api/openhasp_builder/themes", json=custom_theme)
    assert resp.status == 200

    resp2 = await client.get("/api/openhasp_builder/themes")
    themes = await resp2.json()
    ids = [t["id"] for t in themes]
    assert "light" in ids
    assert "dark" in ids


@pytest.mark.asyncio
async def test_post_theme_overrides_builtin_of_same_id(hass, hass_client, tmp_path):
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()

    override = {
        "id": "dark", "name": "Dark (customized)",
        "colors": {"bg": "#000000", "card_bg": "#111111", "accent_on": "#00FF00",
                   "accent_off": "#555555", "text": "#FFFFFF", "text_muted": "#AAAAAA"},
        "fonts": {"family": "roboto", "sizes": {"label": 14, "value": 20}},
        "spacing": {"grid_unit": 4, "corner_radius": 10, "padding": 8},
    }
    await client.post("/api/openhasp_builder/themes", json=override)

    resp = await client.get("/api/openhasp_builder/themes")
    themes = await resp.json()
    dark = next(t for t in themes if t["id"] == "dark")
    assert dark["name"] == "Dark (customized)"
    assert dark["colors"]["bg"] == "#000000"


@pytest.mark.asyncio
async def test_get_composites_empty_by_default(hass, hass_client, tmp_path):
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()

    resp = await client.get("/api/openhasp_builder/composites")
    assert resp.status == 200
    assert await resp.json() == []


@pytest.mark.asyncio
async def test_post_composite_then_get_round_trips(hass, hass_client, tmp_path):
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()

    composite = {
        "id": "light_toggle_group", "name": "Light Toggle Group",
        "members": [
            {"dx": 0, "dy": 0, "w": 160, "h": 75, "obj_type": "obj",
             "static_props": {"bg_color": "#1c1c1c"}, "properties": {}, "event": {}},
        ],
    }
    resp = await client.post("/api/openhasp_builder/composites", json=composite)
    assert resp.status == 200

    resp2 = await client.get("/api/openhasp_builder/composites")
    composites = await resp2.json()
    assert len(composites) == 1
    assert composites[0]["name"] == "Light Toggle Group"


@pytest.mark.asyncio
async def test_import_seeds_plate_and_version_1(hass, hass_client, tmp_path):
    """Import reads the live config paths and seeds a v1 snapshot."""
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()

    fixtures = os.path.join(os.path.dirname(__file__), "fixtures")
    os.makedirs(hass.config.path("openhasp"), exist_ok=True)
    os.makedirs(hass.config.path("openhasp_configs"), exist_ok=True)
    shutil.copy(os.path.join(fixtures, "dashboard_pages.jsonl"),
                hass.config.path("openhasp", "dashboard_pages.jsonl"))
    shutil.copy(os.path.join(fixtures, "dashboard.yaml"),
                hass.config.path("openhasp_configs", "dashboard.yaml"))

    resp = await client.post("/api/openhasp_builder/plates/dashboard/import", json={})
    assert resp.status == 200
    data = await resp.json()
    assert data["plate"]["display_name"] == "Dashboard"
    assert len(data["plate"]["pages"]) > 0

    versions = store.list_versions("dashboard")
    assert [v.version_number for v in versions] == [1]
    assert versions[0].label == "Initial import"

    # Non-destructive: source files are untouched and re-import is refused.
    resp2 = await client.post("/api/openhasp_builder/plates/dashboard/import", json={})
    assert resp2.status == 409


@pytest.mark.asyncio
async def test_import_overwrite_snapshots_then_replaces(hass, hass_client, tmp_path):
    """overwrite=true re-imports live files, keeping the old plate in history."""
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()

    fixtures = os.path.join(os.path.dirname(__file__), "fixtures")
    os.makedirs(hass.config.path("openhasp"), exist_ok=True)
    os.makedirs(hass.config.path("openhasp_configs"), exist_ok=True)
    jsonl_dst = hass.config.path("openhasp", "dashboard_pages.jsonl")
    shutil.copy(os.path.join(fixtures, "dashboard_pages.jsonl"), jsonl_dst)
    shutil.copy(os.path.join(fixtures, "dashboard.yaml"),
                hass.config.path("openhasp_configs", "dashboard.yaml"))

    resp = await client.post("/api/openhasp_builder/plates/dashboard/import", json={})
    assert resp.status == 200

    # Local edits: a renamed plate and a different theme must survive re-import.
    plate = store.load_plate("dashboard")
    plate.display_name = "Office"
    plate.theme_id = "custom-theme"
    store.save_plate(plate)
    widgets_before = sum(len(p.widgets) for p in plate.pages)

    # The live file gains an extra widget since the first import.
    with open(jsonl_dst, "a") as f:
        f.write('{"page":1,"id":250,"obj":"label","x":0,"y":0,"w":50,"h":20,"text":"new"}\n')

    resp2 = await client.post(
        "/api/openhasp_builder/plates/dashboard/import", json={"overwrite": True}
    )
    assert resp2.status == 200
    data = await resp2.json()
    assert data["plate"]["display_name"] == "Office"
    assert data["plate"]["theme_id"] == "custom-theme"
    assert sum(len(p["widgets"]) for p in data["plate"]["pages"]) == widgets_before + 1

    versions = store.list_versions("dashboard")
    assert [v.label for v in versions] == [
        "Initial import", "Before live re-import", "Live re-import",
    ]
    # The pre-import snapshot holds the old plate (without the new widget).
    before = versions[1].snapshot
    assert sum(len(p["widgets"]) for p in before["pages"]) == widgets_before


@pytest.mark.asyncio
async def test_import_missing_source_returns_404(hass, hass_client, tmp_path):
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()
    resp = await client.post("/api/openhasp_builder/plates/nosuchplate/import", json={})
    assert resp.status == 404


@pytest.mark.asyncio
async def test_import_rejects_bad_plate_id(hass, hass_client, tmp_path):
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()
    resp = await client.post("/api/openhasp_builder/plates/..%2F..%2Fconfiguration/import", json={})
    assert resp.status in (400, 404)


@pytest.mark.asyncio
async def test_plates_list_reports_stored_and_importable(hass, hass_client, tmp_path):
    """The picker sees saved drafts as 'stored' and unimported live configs as
    'importable'; an already-imported plate must not appear twice."""
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()

    fixtures = os.path.join(os.path.dirname(__file__), "fixtures")
    os.makedirs(hass.config.path("openhasp"), exist_ok=True)
    os.makedirs(hass.config.path("openhasp_configs"), exist_ok=True)
    for plate_id in ("dashboard", "living_room"):
        shutil.copy(os.path.join(fixtures, f"{plate_id}_pages.jsonl"),
                    hass.config.path("openhasp", f"{plate_id}_pages.jsonl"))
        shutil.copy(os.path.join(fixtures, f"{plate_id}.yaml"),
                    hass.config.path("openhasp_configs", f"{plate_id}.yaml"))

    resp = await client.get("/api/openhasp_builder/plates")
    assert resp.status == 200
    data = await resp.json()
    by_id = {p["id"]: p for p in data["plates"]}
    assert by_id["dashboard"]["source"] == "importable"
    assert by_id["living_room"]["source"] == "importable"
    assert [p["id"] for p in data["device_profiles"]] == ["square_480"]

    # After importing, dashboard flips to stored and is listed exactly once.
    assert (await client.post("/api/openhasp_builder/plates/dashboard/import", json={})).status == 200
    data2 = await (await client.get("/api/openhasp_builder/plates")).json()
    dash = [p for p in data2["plates"] if p["id"] == "dashboard"]
    assert len(dash) == 1
    assert dash[0]["source"] == "stored"
    assert dash[0]["display_name"] == "Dashboard"


@pytest.mark.asyncio
async def test_plates_list_ignores_non_plate_store_files(hass, hass_client, tmp_path):
    """themes.json/composites.json/{id}.versions.json share the store dir and
    must never be mistaken for plates."""
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()

    plate_json = {
        "id": "kitchen", "device_profile_id": "square_480", "theme_id": "dark",
        "pages": [{"id": 1, "order": 0, "background": "#111111", "widgets": []}],
    }
    await client.post("/api/openhasp_builder/plates/kitchen", json=plate_json)
    store.add_version("kitchen", plate_json, label="v", published=False)
    store.save_theme(Theme(id="t", name="T", colors={}, fonts={}, spacing={}))

    data = await (await client.get("/api/openhasp_builder/plates")).json()
    assert [p["id"] for p in data["plates"]] == ["kitchen"]


@pytest.mark.asyncio
async def test_create_plate_then_refuses_duplicate(hass, hass_client, tmp_path):
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()

    resp = await client.post("/api/openhasp_builder/plates/kitchen/create",
                             json={"display_name": "Kitchen"})
    assert resp.status == 200
    plate = await resp.json()
    assert plate["display_name"] == "Kitchen"
    assert len(plate["pages"]) == 1
    assert plate["pages"][0]["widgets"] == []
    assert [v.version_number for v in store.list_versions("kitchen")] == [1]

    # Must not silently overwrite the plate we just made.
    resp2 = await client.post("/api/openhasp_builder/plates/kitchen/create", json={})
    assert resp2.status == 409


@pytest.mark.asyncio
async def test_create_plate_rejects_bad_id_and_profile(hass, hass_client, tmp_path):
    await async_setup_component(hass, "http", {})
    store = PlateStore(str(tmp_path))
    async_register_api_views(hass, store)
    client = await hass_client()

    resp = await client.post("/api/openhasp_builder/plates/bad%20id/create", json={})
    assert resp.status in (400, 404)
    resp2 = await client.post("/api/openhasp_builder/plates/kitchen/create",
                              json={"device_profile_id": "nope"})
    assert resp2.status == 400
