import json
import os

from custom_components.openhasp_builder.schema import Plate, Page, PlacedWidget
from custom_components.openhasp_builder.compiler import compile_plate
from custom_components.openhasp_builder.importer import import_plate

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def test_compile_raw_widget_reproduces_geometry():
    widget = PlacedWidget(
        widget_def_id="raw", x=10, y=10, w=50, h=20, page=1,
        params={"obj_type": "label", "static_props": {"page": 1, "id": 5, "obj": "label",
                "x": 10, "y": 10, "w": 50, "h": 20, "text": "hello"},
                "properties": {}, "event": {}},
        obj_id_start=5, obj_id_end=5,
    )
    page = Page(id=1, order=0, background="#111111", widgets=[widget])
    plate = Plate(id="test_plate", device_profile_id="square_480", theme_id="dark", pages=[page])

    jsonl_content, yaml_content = compile_plate(plate)
    lines = [l for l in jsonl_content.splitlines() if l.strip()]
    parsed = [json.loads(l) for l in lines if l.strip().startswith("{")]
    matching = [p for p in parsed if p.get("id") == 5 and p.get("page") == 1]
    assert len(matching) == 1
    assert matching[0]["text"] == "hello"
    assert matching[0]["x"] == 10


def _widget_content_key(widget):
    """Extract the meaningful, comparable content of a widget for round-trip
    verification: geometry, disabled flag, and the parts of static_props
    that matter semantically (obj_type/text), not just its obj id."""
    static_props = widget.params.get("static_props", {})
    return (
        widget.obj_id_start,
        widget.x,
        widget.y,
        widget.w,
        widget.h,
        widget.disabled,
        widget.params.get("obj_type"),
        static_props.get("text"),
    )


def _assert_round_trip_preserves_all_widgets(plate, reimported):
    """Compares full widget content (not just obj id sets) between the
    original and reimported plate, across ALL pages (including page 0) and
    including disabled widgets -- a disabled widget must still be present
    and still marked disabled after a full import -> compile -> reimport
    cycle, it must never silently vanish (C7).

    Keyed by (page_id, obj_id_start): obj ids are only unique within a
    page, not across the whole plate (e.g. ids 203-208 legitimately repeat
    on multiple pages in the living_room fixture)."""
    original_by_key = {
        (p.id, w.obj_id_start): _widget_content_key(w)
        for p in plate.pages for w in p.widgets
    }
    reimported_by_key = {
        (p.id, w.obj_id_start): _widget_content_key(w)
        for p in reimported.pages for w in p.widgets
    }

    assert set(original_by_key.keys()) == set(reimported_by_key.keys()), (
        f"widget (page,id) sets differ: only in original="
        f"{set(original_by_key) - set(reimported_by_key)}, only in reimported="
        f"{set(reimported_by_key) - set(original_by_key)}"
    )
    for key, original_content in original_by_key.items():
        assert reimported_by_key[key] == original_content, (
            f"widget {key} content differs after round trip: "
            f"original={original_content}, reimported={reimported_by_key[key]}"
        )

    original_count = sum(len(p.widgets) for p in plate.pages)
    reimported_count = sum(len(p.widgets) for p in reimported.pages)
    assert original_count == reimported_count == len(original_by_key)


def _round_trip(plate_id, jsonl_fixture, yaml_fixture, tmp_path):
    plate, warnings = import_plate(
        plate_id=plate_id,
        jsonl_path=os.path.join(FIXTURES, jsonl_fixture),
        yaml_path=os.path.join(FIXTURES, yaml_fixture),
        device_profile_id="square_480", theme_id="dark",
    )
    jsonl_content, yaml_content = compile_plate(plate)

    jsonl_out = tmp_path / f"_test_{plate_id}_pages.jsonl"
    yaml_out = tmp_path / f"_test_{plate_id}.yaml"
    jsonl_out.write_text(jsonl_content)
    yaml_out.write_text(yaml_content)

    reimported, warnings2 = import_plate(
        plate_id=plate_id,
        jsonl_path=str(jsonl_out),
        yaml_path=str(yaml_out),
        device_profile_id="square_480", theme_id="dark",
    )
    return plate, reimported


def test_dashboard_round_trip_preserves_all_widgets_including_disabled_and_page_zero(tmp_path):
    plate, reimported = _round_trip(
        "dashboard", "dashboard_pages.jsonl", "dashboard.yaml", tmp_path
    )
    _assert_round_trip_preserves_all_widgets(plate, reimported)
    assert plate.display_name == "Dashboard"
    assert reimported.display_name == "Dashboard"


def test_living_room_round_trip_preserves_all_widgets_including_disabled_and_page_zero(tmp_path):
    plate, reimported = _round_trip(
        "living_room", "living_room_pages.jsonl", "living_room.yaml", tmp_path
    )
    _assert_round_trip_preserves_all_widgets(plate, reimported)
    assert plate.display_name == "Living Room"
    assert reimported.display_name == "Living Room"
