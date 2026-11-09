from custom_components.openhasp_builder.widgets_builtin import BUILTIN_WIDGETS

EXPECTED_TYPES = {"label", "gauge", "toggle_card", "button", "slider", "image", "msgbox"}

def test_all_builtin_types_present():
    assert set(BUILTIN_WIDGETS.keys()) == EXPECTED_TYPES

def test_each_builtin_has_render_spec_and_param_schema():
    for widget_type, widget_def in BUILTIN_WIDGETS.items():
        assert widget_def.type == widget_type
        assert isinstance(widget_def.render_spec, list) and len(widget_def.render_spec) > 0
        assert isinstance(widget_def.param_schema, list)

def test_toggle_card_matches_repeated_pattern_in_fixtures():
    # toggle_card mirrors the bg+icon+label+state pattern seen 6x in living_room.yaml/dashboard.yaml
    toggle = BUILTIN_WIDGETS["toggle_card"]
    assert "entity" in toggle.param_schema
    assert "icon_on" in toggle.param_schema or "icon" in toggle.param_schema
    obj_types = [spec["obj"] for spec in toggle.render_spec]
    assert obj_types.count("label") >= 1

def test_toggle_card_label_text_consumed_in_render_spec():
    # Verify that label_text param is actually used in render_spec (not orphaned)
    toggle = BUILTIN_WIDGETS["toggle_card"]
    assert "label_text" in toggle.param_schema
    # Find the render_spec entry that uses label_text
    render_spec_str = str(toggle.render_spec)
    assert "{label_text}" in render_spec_str, "label_text must be templated in render_spec"
