import os
from custom_components.openhasp_builder.importer import import_plate

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def test_import_dashboard_produces_plate_with_pages():
    plate, warnings = import_plate(
        plate_id="dashboard",
        jsonl_path=os.path.join(FIXTURES, "dashboard_pages.jsonl"),
        yaml_path=os.path.join(FIXTURES, "dashboard.yaml"),
        device_profile_id="square_480",
        theme_id="dark",
    )
    assert plate.id == "dashboard"
    assert len(plate.pages) >= 1
    # Page 0 (global overlay, e.g. msgbox popups) is now imported like any
    # other page (C2), so it legitimately sorts first; page 1 is the first
    # real user-facing page.
    page_ids = [p.id for p in plate.pages]
    assert 0 in page_ids
    assert 1 in page_ids
    assert page_ids[0] == 0


def test_commented_jsonl_line_not_crashed(tmp_path):
    jsonl = tmp_path / "test_pages.jsonl"
    jsonl.write_text(
        '{"plate_name":"Test"}\n'
        '{"page":1,"id":0,"bg_color":"#111111"}\n'
        '// human comment, not json\n'
        '// {"page":1,"id":99,"obj":"label","x":0,"y":0,"w":10,"h":10}\n'
        '{"page":1,"id":5,"obj":"label","x":10,"y":10,"w":50,"h":20}\n'
    )
    yaml_file = tmp_path / "test.yaml"
    yaml_file.write_text("test_plate:\n  objects: []\n")

    plate, warnings = import_plate("test_plate", str(jsonl), str(yaml_file), "square_480", "dark")
    widgets_by_id = {w.obj_id_start: w for p in plate.pages for w in p.widgets}
    # Commented-out JSON with page/id keys is imported as a disabled widget, not lost.
    assert 99 in widgets_by_id
    assert widgets_by_id[99].disabled is True
    assert 5 in widgets_by_id
    assert widgets_by_id[5].disabled is False


def test_commented_json_line_becomes_disabled_widget(tmp_path):
    jsonl = tmp_path / "test_pages.jsonl"
    jsonl.write_text(
        '{"plate_name":"Test"}\n'
        '{"page":1,"id":0,"bg_color":"#111111"}\n'
        '// {"page":1,"id":57,"obj":"label","x":0,"y":0,"w":10,"h":10,"text":"hidden"}\n'
        '{"page":1,"id":5,"obj":"label","x":10,"y":10,"w":50,"h":20}\n'
    )
    yaml_file = tmp_path / "test.yaml"
    yaml_file.write_text("test_plate:\n  objects: []\n")

    plate, warnings = import_plate("test_plate", str(jsonl), str(yaml_file), "square_480", "dark")
    widgets_by_id = {w.obj_id_start: w for p in plate.pages for w in p.widgets}
    assert 57 in widgets_by_id
    assert widgets_by_id[57].disabled is True
    assert 5 in widgets_by_id
    assert widgets_by_id[5].disabled is False


def test_dashboard_fixture_commented_widget_57_imported_disabled():
    plate, warnings = import_plate(
        plate_id="dashboard",
        jsonl_path=os.path.join(FIXTURES, "dashboard_pages.jsonl"),
        yaml_path=os.path.join(FIXTURES, "dashboard.yaml"),
        device_profile_id="square_480", theme_id="dark",
    )
    widgets_by_id = {w.obj_id_start: w for p in plate.pages for w in p.widgets}
    assert 57 in widgets_by_id
    assert widgets_by_id[57].disabled is True


def test_malformed_json_line_produces_warning_not_crash(tmp_path):
    jsonl = tmp_path / "bad_pages.jsonl"
    jsonl.write_text(
        '{"plate_name":"Test"}\n'
        '{"page":1,"id":0,"bg_color":"#111111"}\n'
        '{not valid json,,,}\n'
        '{"page":1,"id":5,"obj":"label","x":10,"y":10,"w":50,"h":20}\n'
    )
    yaml_file = tmp_path / "bad.yaml"
    yaml_file.write_text("bad_plate:\n  objects: []\n")

    plate, warnings = import_plate("bad_plate", str(jsonl), str(yaml_file), "square_480", "dark")
    assert len(warnings) == 1
    assert "could not parse JSON" in warnings[0]
    obj_ids = [w.obj_id_start for p in plate.pages for w in p.widgets]
    assert 5 in obj_ids


def test_widgets_take_the_name_of_the_preceding_comment_line():
    plate, _ = import_plate(
        plate_id="dashboard",
        jsonl_path=os.path.join(FIXTURES, "dashboard_pages.jsonl"),
        yaml_path=os.path.join(FIXTURES, "dashboard.yaml"),
        device_profile_id="square_480",
        theme_id="dark",
    )
    page1 = next(p for p in plate.pages if p.id == 1)
    groups = [w.group for w in page1.widgets]
    assert "Attic CO2" in groups
    assert "Attic Hue Light" in groups
    assert "" not in groups  # every widget on this page follows a comment
    # The page's own id:0 declaration is not a widget and carries no group.
    assert all(w.obj_id_start != 0 for w in page1.widgets)
    # Overlay widgets (page 0) are grouped under the "Overlay" comment.
    page0 = next(p for p in plate.pages if p.id == 0)
    assert {w.group for w in page0.widgets} == {"Overlay"}


def test_group_is_not_part_of_the_widgets_device_props():
    plate, _ = import_plate(
        plate_id="dashboard",
        jsonl_path=os.path.join(FIXTURES, "dashboard_pages.jsonl"),
        yaml_path=os.path.join(FIXTURES, "dashboard.yaml"),
        device_profile_id="square_480",
        theme_id="dark",
    )
    for page in plate.pages:
        for widget in page.widgets:
            assert "_group" not in widget.params["static_props"]
            assert "_disabled" not in widget.params["static_props"]


def test_commented_out_comment_line_does_not_rename_the_group(tmp_path):
    jsonl = tmp_path / "p.jsonl"
    jsonl.write_text(
        '{"comment":"Real group"}\n'
        '// {"comment":"Not a group"}\n'
        '{"page":1,"id":1,"obj":"label","x":0,"y":0,"w":10,"h":10,"text":"a"}\n'
    )
    yaml_file = tmp_path / "p.yaml"
    yaml_file.write_text("p:\n  objects: []\n")
    plate, _ = import_plate("p", str(jsonl), str(yaml_file), "square_480", "dark")
    assert plate.pages[0].widgets[0].group == "Real group"
