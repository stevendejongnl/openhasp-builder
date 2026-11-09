from custom_components.openhasp_builder.schema import (
    Theme, DeviceProfile, WidgetDef, PlacedWidget, Page, Plate, Version,
    CompositeTemplate, CompositeTemplateMember,
)

def test_theme_round_trip():
    theme = Theme(
        id="dark",
        name="Dark",
        colors={"bg": "#111111", "card_bg": "#1c1c1c", "accent_on": "#4caf50",
                "accent_off": "#6F6F6F", "text": "#FFFFFF", "text_muted": "#9b9b9b"},
        fonts={"family": "montserrat", "sizes": {"label": 16, "value": 24}},
        spacing={"grid_unit": 5, "corner_radius": 15, "padding": 10},
    )
    d = theme.to_dict()
    restored = Theme.from_dict(d)
    assert restored == theme


def test_device_profile_round_trip():
    dp = DeviceProfile(id="square_480", name="480x480 Square Panel", width=480, height=480)
    assert DeviceProfile.from_dict(dp.to_dict()) == dp


def test_plate_round_trip():
    widget_def = WidgetDef(
        id="toggle_card", type="toggle_card", default_w=160, default_h=75,
        param_schema=["entity", "icon", "color_on"],
        render_spec=[{"obj": "obj", "template_props": {"bg_color": "{color}"}}],
    )
    placed = PlacedWidget(
        widget_def_id="toggle_card", x=5, y=5, w=160, h=75, page=1,
        params={"entity": "light.hue", "icon": "lightbulb", "color_on": "#4caf50"},
        obj_id_start=20, obj_id_end=27, disabled=False,
    )
    page = Page(id=1, order=0, background="#111111", widgets=[placed])
    plate = Plate(id="dashboard", device_profile_id="square_480", theme_id="dark", pages=[page])
    version = Version(
        plate_id="dashboard", version_number=1, timestamp="2026-07-27T10:00:00",
        label="Initial import", published=True, snapshot=plate.to_dict(),
    )

    assert WidgetDef.from_dict(widget_def.to_dict()) == widget_def
    assert PlacedWidget.from_dict(placed.to_dict()) == placed
    assert Page.from_dict(page.to_dict()) == page
    assert Plate.from_dict(plate.to_dict()) == plate
    assert Version.from_dict(version.to_dict()) == version

def test_composite_template_round_trip():
    member = CompositeTemplateMember(
        dx=0, dy=0, w=160, h=75, obj_type="obj",
        static_props={"bg_color": "#1c1c1c"}, properties={}, event={},
    )
    composite = CompositeTemplate(id="light_toggle_group", name="Light Toggle Group", members=[member])

    assert CompositeTemplateMember.from_dict(member.to_dict()) == member
    assert CompositeTemplate.from_dict(composite.to_dict()) == composite
