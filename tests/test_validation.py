from custom_components.openhasp_builder.schema import Plate, Page, PlacedWidget, DeviceProfile
from custom_components.openhasp_builder.validation import validate_plate


def make_widget(obj_id, x=0, y=0, w=10, h=10, page=1):
    return PlacedWidget(widget_def_id="raw", x=x, y=y, w=w, h=h, page=page,
                         params={"obj_type": "label", "static_props": {}, "properties": {}, "event": {}},
                         obj_id_start=obj_id, obj_id_end=obj_id)


def test_detects_obj_id_collision():
    page = Page(id=1, order=0, background="#111111",
                widgets=[make_widget(5), make_widget(5)])
    plate = Plate(id="test", device_profile_id="square_480", theme_id="dark", pages=[page])
    profile = DeviceProfile(id="square_480", name="480x480", width=480, height=480)

    errors = validate_plate(plate, profile)
    assert any("collision" in e.lower() and "5" in e for e in errors)


def test_detects_missing_required_param():
    from custom_components.openhasp_builder.widgets_builtin import BUILTIN_WIDGETS
    widget = PlacedWidget(widget_def_id="toggle_card", x=0, y=0, w=160, h=75, page=1,
                           params={"entity": "light.hue"},  # missing icon_on/icon_off/label_text
                           obj_id_start=10, obj_id_end=17)
    page = Page(id=1, order=0, background="#111111", widgets=[widget])
    plate = Plate(id="test", device_profile_id="square_480", theme_id="dark", pages=[page])
    profile = DeviceProfile(id="square_480", name="480x480", width=480, height=480)

    errors = validate_plate(plate, profile, widget_defs=BUILTIN_WIDGETS)
    assert any("icon_on" in e for e in errors)
