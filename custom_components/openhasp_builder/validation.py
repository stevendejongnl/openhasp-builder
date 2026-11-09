from .schema import Plate, DeviceProfile


def validate_plate(plate: Plate, device_profile: DeviceProfile, widget_defs: dict | None = None) -> list[str]:
    errors: list[str] = []
    widget_defs = widget_defs or {}

    for page in plate.pages:
        seen_ids: dict = {}
        for widget in page.widgets:
            if widget.obj_id_start in seen_ids:
                errors.append(
                    f"Page {page.id}: obj id collision on id={widget.obj_id_start} "
                    f"(shared by two widgets)"
                )
            seen_ids[widget.obj_id_start] = widget

            if widget.x < 0 or widget.y < 0:
                errors.append(
                    f"Page {page.id}, obj id={widget.obj_id_start}: negative position "
                    f"(x={widget.x}, y={widget.y})"
                )
            if widget.x >= device_profile.width or widget.y >= device_profile.height:
                errors.append(
                    f"Page {page.id}, obj id={widget.obj_id_start}: starting position "
                    f"is off-screen for device profile {device_profile.width}x"
                    f"{device_profile.height} (x={widget.x}, y={widget.y})"
                )

            widget_def = widget_defs.get(widget.widget_def_id)
            if widget_def is not None:
                for required_param in widget_def.param_schema:
                    if required_param not in widget.params:
                        errors.append(
                            f"Page {page.id}, obj id={widget.obj_id_start} "
                            f"(widget type={widget.widget_def_id}): missing required "
                            f"param '{required_param}'"
                        )
    return errors
