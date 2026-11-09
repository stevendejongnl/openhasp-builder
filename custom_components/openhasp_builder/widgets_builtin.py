from .schema import WidgetDef

BUILTIN_WIDGETS = {
    "label": WidgetDef(
        id="label", type="label", default_w=145, default_h=40,
        param_schema=["text_template", "text_font", "text_color"],
        render_spec=[{"obj": "label", "props": {"text": "{text_template}",
                     "text_font": "{text_font}", "text_color": "{text_color}"}}],
    ),
    "gauge": WidgetDef(
        id="gauge", type="gauge", default_w=145, default_h=145,
        param_schema=["entity", "min", "max", "critical_value"],
        render_spec=[{"obj": "gauge", "props": {
            "val": "{{{{ states('{entity}') | float(default=0) | round(0) }}}}",
            "min": "{min}", "max": "{max}", "critical_value": "{critical_value}"}}],
    ),
    "toggle_card": WidgetDef(
        id="toggle_card", type="toggle_card", default_w=160, default_h=75,
        param_schema=["entity", "icon_on", "icon_off", "label_text"],
        render_spec=[
            {"obj": "obj", "props": {"bg_color": "#1c1c1c"}, "event": {
                "down": [{"service": "homeassistant.toggle", "entity_id": "{entity}"}]}},
            {"obj": "obj", "template_props": {
                "bg_color": '{{{{ "#253926" if is_state("{entity}", "on") else "#2C2C2C" }}}}'}},
            {"obj": "label", "template_props": {
                "text": '{{{{ "{icon_on}" if is_state("{entity}", "on") else "{icon_off}" }}}}',
                "text_color": '{{{{ "#4caf50" if is_state("{entity}", "on") else "#6F6F6F" }}}}'}},
            {"obj": "label", "template_props": {
                "text": '{{{{ "{label_text}" if is_state("{entity}", "on") else "Off" }}}}'}},
        ],
    ),
    "button": WidgetDef(
        id="button", type="button", default_w=100, default_h=40,
        param_schema=["entity", "service", "label_text"],
        render_spec=[{"obj": "btn", "props": {"text": "{label_text}"},
                      "event": {"down": [{"service": "{service}", "entity_id": "{entity}"}]}}],
    ),
    "slider": WidgetDef(
        id="slider", type="slider", default_w=200, default_h=40,
        param_schema=["entity", "min", "max"],
        render_spec=[{"obj": "slider", "props": {"min": "{min}", "max": "{max}"},
                      "template_props": {"val": "{{{{ states('{entity}') }}}}"}}],
    ),
    "image": WidgetDef(
        id="image", type="image", default_w=100, default_h=100,
        param_schema=["src"],
        render_spec=[{"obj": "img", "props": {"src": "{src}"}}],
    ),
    "msgbox": WidgetDef(
        id="msgbox", type="msgbox", default_w=0, default_h=0,
        param_schema=["text", "options"],
        render_spec=[{"obj": "msgbox", "props": {"text": "{text}", "options": "{options}",
                     "auto_close": 0}}],
    ),
}
