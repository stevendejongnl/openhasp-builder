import json
import yaml as pyyaml
from .schema import Plate

UNGROUPED = "Ungrouped"


def compile_plate(plate: Plate) -> tuple[str, str]:
    jsonl_lines = [json.dumps({"plate_name": plate.display_name or plate.id})]
    yaml_objects = []

    for page in plate.pages:
        if page.has_declaration:
            # Emit the FULL stored page declaration (bg_color, prev, next,
            # and any other keys captured on import), not just a
            # hardcoded bg_color-only reconstruction (C3).
            decl = dict(page.page_props) if page.page_props else {}
            decl["page"] = page.id
            decl["id"] = 0
            if "bg_color" not in decl:
                decl["bg_color"] = page.background
            jsonl_lines.append(json.dumps(decl))
        # A comment line names every widget after it, so emit one whenever the
        # group changes. A widget without a group that follows a named one
        # (e.g. one added in the editor) gets "Ungrouped": without it the next
        # import would merge it into the group above.
        last_group = ""
        for widget in page.widgets:
            label = widget.group or (UNGROUPED if last_group else "")
            if label and label != last_group:
                jsonl_lines.append(json.dumps({"comment": label}))
                last_group = label
            if widget.widget_def_id == "raw":
                static_props = dict(widget.params.get("static_props", {}))
                static_props["page"] = page.id
                static_props["id"] = widget.obj_id_start
                static_props["x"] = widget.x
                static_props["y"] = widget.y
                static_props["w"] = widget.w
                static_props["h"] = widget.h

                if widget.disabled:
                    # Re-emit disabled widgets as `//`-prefixed commented
                    # lines instead of deleting them, mirroring the exact
                    # on-disk format the importer reads them from (C6).
                    jsonl_lines.append("// " + json.dumps(static_props))
                    continue

                jsonl_lines.append(json.dumps(static_props))

                obj_ref = f"p{page.id}b{widget.obj_id_start}"
                properties = widget.params.get("properties", {})
                event = widget.params.get("event", {})
                if properties or event:
                    entry = {"obj": obj_ref}
                    if properties:
                        entry["properties"] = properties
                    if event:
                        entry["event"] = event
                    yaml_objects.append(entry)
            else:
                raise NotImplementedError(
                    f"compiling widget_def_id={widget.widget_def_id!r} "
                    "requires widget render_spec expansion (Task 7)"
                )

    yaml_content = pyyaml.dump({plate.id: {"objects": yaml_objects}}, sort_keys=False)
    jsonl_content = "\n".join(jsonl_lines) + "\n"
    return jsonl_content, yaml_content
