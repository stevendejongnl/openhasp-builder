import json
import yaml as pyyaml
from .schema import Plate, Page, PlacedWidget


def _parse_jsonl_text(jsonl_text: str, source_label: str = "jsonl") -> tuple[dict, dict, str | None, list[str]]:
    """Parses the jsonl source into:
      - pages: {page_id: {obj_id: {geometry+props}}} for placeable widgets
        (never includes the page's own `id:0` declaration line)
      - page_decls: {page_id: {full declaration object}} for LIVE `id:0`
        declaration lines only (never commented ones)
      - plate_name: the human-readable name captured from the `plate_name`
        line, or None if absent
      - warnings: list of warning strings

    Lines starting with `//` are treated as commented-out entries: the `//`
    is stripped and the remainder is parsed as JSON; if it parses and has
    both `page` and `id` keys, it is stored like a live entry but flagged
    with `_disabled: True` so it can be imported as a disabled widget
    instead of being lost. Lines that are `//`-prefixed but not valid
    page/id JSON (e.g. plain human comments) are skipped silently.

    Key invariant (C1): a commented (`_disabled: True`) entry must never
    overwrite a LIVE entry that already occupies the same (page_id, obj_id)
    key -- the live version always wins. Commented duplicates arriving
    after another commented duplicate may still overwrite each other since
    both are disabled anyway.

    Key invariant (C3): the `id:0` page-declaration line is captured
    separately (`page_decls`) and is NEVER added to `pages[page_id]`, so it
    can never be treated as a placeable widget downstream.
    """
    pages: dict = {}
    page_decls: dict = {}
    plate_name: str | None = None
    warnings: list[str] = []
    for lineno, raw_line in enumerate(jsonl_text.splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue
        disabled = False
        if line.startswith("//"):
            disabled = True
            line = line[2:].strip()
            if not line:
                continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            if disabled:
                continue
            warnings.append(f"{source_label}:{lineno}: could not parse JSON, skipped")
            continue
        if "comment" in obj and "page" not in obj:
            continue
        if "plate_name" in obj:
            if not disabled and plate_name is None:
                plate_name = obj["plate_name"]
            continue
        page_id = obj.get("page")
        obj_id = obj.get("id")
        if page_id is None or obj_id is None:
            continue

        if obj_id == 0:
            # Page declaration line. Only a LIVE declaration is stored;
            # commented declarations don't count as "the page had a
            # real declaration" (C3).
            if not disabled:
                page_decls[page_id] = obj
            continue

        if disabled:
            obj = dict(obj, _disabled=True)

        existing = pages.get(page_id, {}).get(obj_id)
        if existing is not None and disabled and not existing.get("_disabled", False):
            # C1: a commented duplicate must never overwrite a live entry.
            continue
        pages.setdefault(page_id, {})[obj_id] = obj
    return pages, page_decls, plate_name, warnings


def _parse_yaml_bindings_text(yaml_text: str, plate_id: str, source_label: str = "yaml") -> tuple[dict, str | None]:
    """Returns ({obj_ref (e.g. 'p1b5'): {'properties':..., 'event':...}}, warning).

    If `plate_id` is not present as a root key in the parsed YAML, returns an
    empty bindings dict plus a warning string describing the failure loudly
    (instead of silently dropping every binding)."""
    data = pyyaml.safe_load(yaml_text) or {}
    if plate_id not in data:
        return {}, (
            f"{source_label}: root key '{plate_id}' not found in YAML bindings file "
            "-- all entity bindings, templates, and event handlers for this "
            "plate were NOT imported (empty bindings)"
        )
    bindings: dict = {}
    root = data.get(plate_id, {}) or {}
    for entry in root.get("objects", []):
        obj_ref = entry.get("obj")
        if not obj_ref:
            continue
        bindings[obj_ref] = {k: v for k, v in entry.items() if k != "obj"}
    return bindings, None


def import_plate_text(plate_id: str, jsonl_text: str, yaml_text: str,
                       device_profile_id: str, theme_id: str,
                       jsonl_label: str = "jsonl", yaml_label: str = "yaml") -> tuple[Plate, list[str]]:
    """Same as `import_plate`, but takes source content directly instead of
    file paths -- used by the raw config editor to preview unsaved edits
    without ever touching the on-disk openhasp/openhasp_configs files."""
    pages_geo, page_decls, plate_name, warnings = _parse_jsonl_text(jsonl_text, jsonl_label)
    bindings, yaml_warning = _parse_yaml_bindings_text(yaml_text, plate_id, yaml_label)
    if yaml_warning:
        warnings.append(yaml_warning)

    # Union of page ids that have real content: either a live declaration
    # line, or at least one associated object (live or commented).
    all_page_ids = set(page_decls.keys()) | set(pages_geo.keys())

    pages = []
    for page_id in sorted(all_page_ids):
        widgets = []
        # Preserve jsonl declaration order, NOT numeric obj_id order: LVGL
        # paints objects in the order they're created, so a card's bg/icon/
        # label stack only renders correctly if later-declared (visually on
        # top) objects stay later in the list even when their obj_id happens
        # to be numerically lower than an earlier-declared object's id.
        for obj_id, geo in pages_geo.get(page_id, {}).items():
            obj_ref = f"p{page_id}b{obj_id}"
            binding = bindings.get(obj_ref, {})
            is_disabled = bool(geo.get("_disabled", False))
            static_props = {k: v for k, v in geo.items() if k != "_disabled"}
            widget = PlacedWidget(
                widget_def_id="raw",
                x=geo.get("x", 0), y=geo.get("y", 0),
                w=geo.get("w", 0), h=geo.get("h", 0),
                page=page_id,
                params={"obj_type": geo.get("obj", "obj"), "static_props": static_props,
                        "properties": binding.get("properties", {}),
                        "event": binding.get("event", {})},
                obj_id_start=obj_id, obj_id_end=obj_id,
                disabled=is_disabled,
            )
            widgets.append(widget)

        decl = page_decls.get(page_id)
        has_declaration = decl is not None
        page_props = dict(decl) if decl is not None else {}
        background = page_props.get("bg_color", "#111111")

        pages.append(Page(id=page_id, order=page_id - 1,
                           background=background,
                           widgets=widgets,
                           page_props=page_props,
                           has_declaration=has_declaration))

    plate = Plate(id=plate_id, device_profile_id=device_profile_id,
                  theme_id=theme_id, pages=pages,
                  display_name=plate_name or plate_id)
    return plate, warnings


def import_plate(plate_id: str, jsonl_path: str, yaml_path: str,
                  device_profile_id: str, theme_id: str) -> tuple[Plate, list[str]]:
    with open(jsonl_path) as f:
        jsonl_text = f.read()
    with open(yaml_path) as f:
        yaml_text = f.read()
    return import_plate_text(plate_id, jsonl_text, yaml_text, device_profile_id, theme_id,
                              jsonl_label=jsonl_path, yaml_label=yaml_path)
