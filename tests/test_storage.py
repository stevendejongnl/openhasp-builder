import tempfile, os
import pytest
from custom_components.openhasp_builder.schema import (
    Plate, Page, PlacedWidget, Theme, CompositeTemplate, CompositeTemplateMember,
)
from custom_components.openhasp_builder.storage import PlateStore

def make_plate(plate_id="dashboard"):
    widget = PlacedWidget(widget_def_id="label", x=0, y=0, w=100, h=40, page=1,
                           params={}, obj_id_start=1, obj_id_end=1)
    page = Page(id=1, order=0, background="#111111", widgets=[widget])
    return Plate(id=plate_id, device_profile_id="square_480", theme_id="dark", pages=[page])

def test_save_and_load_plate():
    with tempfile.TemporaryDirectory() as tmp:
        store = PlateStore(tmp)
        plate = make_plate()
        store.save_plate(plate)
        loaded = store.load_plate("dashboard")
        assert loaded == plate

def test_load_missing_plate_returns_none():
    with tempfile.TemporaryDirectory() as tmp:
        store = PlateStore(tmp)
        assert store.load_plate("nonexistent") is None

def test_add_and_list_versions():
    with tempfile.TemporaryDirectory() as tmp:
        store = PlateStore(tmp)
        plate = make_plate()
        v1 = store.add_version("dashboard", plate.to_dict(), label="Initial import", published=True)
        v2 = store.add_version("dashboard", plate.to_dict(), label="Published 2026-07-27T10:00:00", published=True)
        versions = store.list_versions("dashboard")
        assert [v.version_number for v in versions] == [1, 2]
        assert v1.version_number == 1
        assert v2.version_number == 2

def test_prune_keeps_version_1_pinned():
    with tempfile.TemporaryDirectory() as tmp:
        store = PlateStore(tmp)
        plate = make_plate()
        for i in range(25):
            store.add_version("dashboard", plate.to_dict(), label=f"v{i}", published=False)
        versions = store.list_versions("dashboard")
        assert len(versions) == 20
        assert versions[0].version_number == 1
        assert versions[0].label == "v0"

def test_restore_version():
    with tempfile.TemporaryDirectory() as tmp:
        store = PlateStore(tmp)
        plate_v1 = make_plate()
        store.save_plate(plate_v1)
        store.add_version("dashboard", plate_v1.to_dict(), label="Initial import", published=True)

        plate_v2 = make_plate()
        plate_v2.theme_id = "light"
        store.save_plate(plate_v2)
        store.add_version("dashboard", plate_v2.to_dict(), label="v2", published=False)

        restored = store.restore_version("dashboard", 1)
        assert restored.theme_id == "dark"
        assert store.load_plate("dashboard").theme_id == "dark"

def test_restore_version_raises_clear_error_for_missing_version():
    with tempfile.TemporaryDirectory() as tmp:
        store = PlateStore(tmp)
        with pytest.raises(ValueError, match="Version 99 not found"):
            store.restore_version("dashboard", 99)

def make_theme(theme_id="dark"):
    return Theme(
        id=theme_id, name="Dark",
        colors={"bg": "#111111", "card_bg": "#1c1c1c", "accent_on": "#4caf50",
                "accent_off": "#6F6F6F", "text": "#FFFFFF", "text_muted": "#9b9b9b"},
        fonts={"family": "montserrat", "sizes": {"label": 16, "value": 24}},
        spacing={"grid_unit": 5, "corner_radius": 15, "padding": 10},
    )

def test_list_themes_empty_when_none_saved():
    with tempfile.TemporaryDirectory() as tmp:
        store = PlateStore(tmp)
        assert store.list_themes() == []

def test_save_and_list_themes():
    with tempfile.TemporaryDirectory() as tmp:
        store = PlateStore(tmp)
        theme = make_theme()
        store.save_theme(theme)
        themes = store.list_themes()
        assert themes == [theme]

def test_save_theme_overwrites_existing_theme_with_same_id():
    with tempfile.TemporaryDirectory() as tmp:
        store = PlateStore(tmp)
        store.save_theme(make_theme())
        updated = make_theme()
        updated.name = "Dark (updated)"
        store.save_theme(updated)
        themes = store.list_themes()
        assert len(themes) == 1
        assert themes[0].name == "Dark (updated)"

def make_composite(composite_id="light_toggle_group"):
    member = CompositeTemplateMember(
        dx=0, dy=0, w=160, h=75, obj_type="obj",
        static_props={"bg_color": "#1c1c1c"}, properties={}, event={},
    )
    return CompositeTemplate(id=composite_id, name="Light Toggle Group", members=[member])

def test_list_composites_empty_when_none_saved():
    with tempfile.TemporaryDirectory() as tmp:
        store = PlateStore(tmp)
        assert store.list_composites() == []

def test_save_and_list_composites():
    with tempfile.TemporaryDirectory() as tmp:
        store = PlateStore(tmp)
        composite = make_composite()
        store.save_composite(composite)
        composites = store.list_composites()
        assert composites == [composite]

def test_save_composite_overwrites_existing_composite_with_same_id():
    with tempfile.TemporaryDirectory() as tmp:
        store = PlateStore(tmp)
        store.save_composite(make_composite())
        updated = make_composite()
        updated.name = "Renamed Group"
        store.save_composite(updated)
        composites = store.list_composites()
        assert len(composites) == 1
        assert composites[0].name == "Renamed Group"
