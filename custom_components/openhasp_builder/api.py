import logging
import os
import re
from datetime import datetime, timezone
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers.template import Template
from .storage import PlateStore
from .schema import Plate, Page, Theme, CompositeTemplate
from .widgets_builtin import BUILTIN_WIDGETS
from .compiler import compile_plate
from .importer import import_plate, import_plate_text
from .validation import validate_plate
from .const import DEFAULT_DEVICE_PROFILES, DEFAULT_THEMES

_LOGGER = logging.getLogger(__name__)

_PROFILES_BY_ID = {p.id: p for p in DEFAULT_DEVICE_PROFILES}

_PLATE_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def _invalid_plate_id_response(view: HomeAssistantView, plate_id: str):
    """Returns a 400 error response if plate_id fails validation, else None.

    This is the trust boundary: plate_id arrives here directly from the URL
    path of an external REST request and is later interpolated into file
    paths (storage.py, and the jsonl/yaml publish paths below) without
    further sanitization, so it must be rejected here before it can ever
    reach a path-construction call (prevents path traversal via values like
    "../../configuration")."""
    if not _PLATE_ID_RE.match(plate_id):
        return view.json_message(
            f"Invalid plate_id: {plate_id!r} (must match ^[A-Za-z0-9_-]+$)",
            status_code=400,
        )
    return None


class PlatesListView(HomeAssistantView):
    """What the picker offers: saved drafts, plus live configs not yet imported.

    A plate is "importable" when both source files exist on disk but no draft
    has been saved for it yet; once imported it moves to "stored". Anything
    already stored is never reported as importable, so the picker can't invite
    an import that ImportView would reject with a 409.
    """

    url = "/api/openhasp_builder/plates"
    name = "api:openhasp_builder:plates"
    requires_auth = True

    def __init__(self, store: PlateStore, hass: HomeAssistant):
        self.store = store
        self.hass = hass

    def _discover_importable(self, stored_ids: set) -> list[dict]:
        jsonl_dir = self.hass.config.path("openhasp")
        if not os.path.isdir(jsonl_dir):
            return []
        found = []
        for name in sorted(os.listdir(jsonl_dir)):
            if not name.endswith("_pages.jsonl"):
                continue
            plate_id = name[: -len("_pages.jsonl")]
            if plate_id in stored_ids or not _PLATE_ID_RE.match(plate_id):
                continue
            yaml_path = self.hass.config.path("openhasp_configs", f"{plate_id}.yaml")
            if not os.path.exists(yaml_path):
                # Layout without bindings can't be imported meaningfully.
                continue
            found.append({"id": plate_id, "display_name": plate_id, "source": "importable"})
        return found

    async def get(self, request):
        stored_ids = await self.hass.async_add_executor_job(self.store.list_plate_ids)
        stored = []
        for plate_id in stored_ids:
            plate = self.store.load_plate(plate_id)
            stored.append({
                "id": plate_id,
                "display_name": plate.display_name if plate else plate_id,
                "source": "stored",
            })
        importable = await self.hass.async_add_executor_job(
            self._discover_importable, set(stored_ids)
        )
        return self.json({
            "plates": stored + importable,
            "device_profiles": [p.to_dict() for p in DEFAULT_DEVICE_PROFILES],
        })


class PlateView(HomeAssistantView):
    url = "/api/openhasp_builder/plates/{plate_id}"
    name = "api:openhasp_builder:plate"
    requires_auth = True

    def __init__(self, store: PlateStore):
        self.store = store

    async def get(self, request, plate_id):
        invalid = _invalid_plate_id_response(self, plate_id)
        if invalid is not None:
            return invalid
        plate = self.store.load_plate(plate_id)
        if plate is None:
            return self.json_message("Plate not found", status_code=404)
        return self.json(plate.to_dict())

    async def post(self, request, plate_id):
        invalid = _invalid_plate_id_response(self, plate_id)
        if invalid is not None:
            return invalid
        body = await request.json()
        plate = Plate.from_dict(body)
        self.store.save_plate(plate)
        return self.json(plate.to_dict())


class WidgetsView(HomeAssistantView):
    url = "/api/openhasp_builder/widgets"
    name = "api:openhasp_builder:widgets"
    requires_auth = True

    async def get(self, request):
        return self.json({wtype: wdef.to_dict() for wtype, wdef in BUILTIN_WIDGETS.items()})


class ThemesView(HomeAssistantView):
    url = "/api/openhasp_builder/themes"
    name = "api:openhasp_builder:themes"
    requires_auth = True

    def __init__(self, store: PlateStore):
        self.store = store

    async def get(self, request):
        # Custom (saved) themes take precedence over a built-in of the same
        # id, so a user can override "dark" without losing the ability to
        # get it back by deleting their saved copy.
        saved = {t.id: t for t in self.store.list_themes()}
        merged = {t.id: t for t in DEFAULT_THEMES}
        merged.update(saved)
        return self.json([t.to_dict() for t in merged.values()])

    async def post(self, request):
        body = await request.json()
        theme = Theme.from_dict(body)
        self.store.save_theme(theme)
        return self.json(theme.to_dict())


class CompositesView(HomeAssistantView):
    url = "/api/openhasp_builder/composites"
    name = "api:openhasp_builder:composites"
    requires_auth = True

    def __init__(self, store: PlateStore):
        self.store = store

    async def get(self, request):
        composites = self.store.list_composites()
        return self.json([c.to_dict() for c in composites])

    async def post(self, request):
        body = await request.json()
        composite = CompositeTemplate.from_dict(body)
        self.store.save_composite(composite)
        return self.json(composite.to_dict())


class VersionsView(HomeAssistantView):
    url = "/api/openhasp_builder/plates/{plate_id}/versions"
    name = "api:openhasp_builder:versions"
    requires_auth = True

    def __init__(self, store: PlateStore):
        self.store = store

    async def get(self, request, plate_id):
        invalid = _invalid_plate_id_response(self, plate_id)
        if invalid is not None:
            return invalid
        versions = self.store.list_versions(plate_id)
        return self.json([v.to_dict() for v in versions])


class RestoreVersionView(HomeAssistantView):
    url = "/api/openhasp_builder/plates/{plate_id}/versions/{version_number}/restore"
    name = "api:openhasp_builder:restore_version"
    requires_auth = True

    def __init__(self, store: PlateStore):
        self.store = store

    async def post(self, request, plate_id, version_number):
        invalid = _invalid_plate_id_response(self, plate_id)
        if invalid is not None:
            return invalid
        try:
            plate = self.store.restore_version(plate_id, int(version_number))
        except ValueError as e:
            return self.json_message(str(e), status_code=404)
        return self.json(plate.to_dict())


class CreatePlateView(HomeAssistantView):
    """Create an empty plate from scratch.

    Deliberately not `POST /plates/{id}` (Save Draft): that overwrites by
    design, so routing "create new" through it would silently destroy an
    existing plate if the user typed a name that already exists. This refuses
    with 409 instead. The empty plate is built server-side so the frontend
    doesn't have to duplicate the schema's shape.
    """

    url = "/api/openhasp_builder/plates/{plate_id}/create"
    name = "api:openhasp_builder:create"
    requires_auth = True

    def __init__(self, store: PlateStore):
        self.store = store

    async def post(self, request, plate_id):
        invalid = _invalid_plate_id_response(self, plate_id)
        if invalid is not None:
            return invalid
        if self.store.load_plate(plate_id) is not None:
            return self.json_message(
                f"Plate {plate_id} already exists", status_code=409,
            )

        body = await request.json() if request.can_read_body else {}
        device_profile_id = body.get("device_profile_id", DEFAULT_DEVICE_PROFILES[0].id)
        theme_id = body.get("theme_id", DEFAULT_THEMES[0].id)
        if device_profile_id not in _PROFILES_BY_ID:
            return self.json_message(
                f"Unknown device profile: {device_profile_id}", status_code=400
            )
        display_name = (body.get("display_name") or "").strip() or plate_id

        theme = next((t for t in DEFAULT_THEMES if t.id == theme_id), None)
        background = theme.colors.get("bg", "#111111") if theme else "#111111"
        plate = Plate(
            id=plate_id,
            device_profile_id=device_profile_id,
            theme_id=theme_id,
            display_name=display_name,
            pages=[Page(id=1, order=0, background=background, widgets=[])],
        )
        self.store.save_plate(plate)
        self.store.add_version(
            plate_id, plate.to_dict(), label="Created empty", published=False,
        )
        return self.json(plate.to_dict())


class ImportView(HomeAssistantView):
    """Read the live OpenHASP files into a stored Plate.

    Only ever reads `/config/openhasp/{plate_id}_pages.jsonl` and
    `/config/openhasp_configs/{plate_id}.yaml`. By default it refuses to
    overwrite a plate that already exists in storage (409) so a stray click
    can never discard editing work. With `{"overwrite": true}` it re-imports
    the latest live files over an existing plate, after snapshotting the
    current stored plate into version history (so it can be restored) and
    keeping the plate's device profile, theme and display name.
    """

    url = "/api/openhasp_builder/plates/{plate_id}/import"
    name = "api:openhasp_builder:import"
    requires_auth = True

    def __init__(self, store: PlateStore, hass: HomeAssistant):
        self.store = store
        self.hass = hass

    async def post(self, request, plate_id):
        invalid = _invalid_plate_id_response(self, plate_id)
        if invalid is not None:
            return invalid
        body = await request.json() if request.can_read_body else {}
        existing = self.store.load_plate(plate_id)
        overwrite = bool(body.get("overwrite"))
        if existing is not None and not overwrite:
            return self.json_message(
                f"Plate {plate_id} already exists; pass overwrite=true to re-import",
                status_code=409,
            )

        if existing is not None:
            device_profile_id = existing.device_profile_id
            theme_id = existing.theme_id
        else:
            device_profile_id = body.get("device_profile_id", DEFAULT_DEVICE_PROFILES[0].id)
            theme_id = body.get("theme_id", DEFAULT_THEMES[0].id)
        if device_profile_id not in _PROFILES_BY_ID:
            return self.json_message(
                f"Unknown device profile: {device_profile_id}", status_code=400
            )

        jsonl_path = self.hass.config.path("openhasp", f"{plate_id}_pages.jsonl")
        yaml_path = self.hass.config.path("openhasp_configs", f"{plate_id}.yaml")
        for path in (jsonl_path, yaml_path):
            if not os.path.exists(path):
                return self.json_message(
                    f"Source file not found: {path}", status_code=404
                )

        plate, warnings = await self.hass.async_add_executor_job(
            import_plate, plate_id, jsonl_path, yaml_path, device_profile_id, theme_id
        )
        if existing is not None:
            self.store.add_version(
                plate_id, existing.to_dict(), label="Before live re-import", published=False,
            )
            plate.display_name = existing.display_name
        self.store.save_plate(plate)
        self.store.add_version(
            plate_id, plate.to_dict(),
            label="Live re-import" if existing is not None else "Initial import",
            published=True,
        )
        return self.json({"plate": plate.to_dict(), "warnings": warnings})


class PublishView(HomeAssistantView):
    url = "/api/openhasp_builder/plates/{plate_id}/publish"
    name = "api:openhasp_builder:publish"
    requires_auth = True

    def __init__(self, store: PlateStore, hass: HomeAssistant):
        self.store = store
        self.hass = hass

    async def post(self, request, plate_id):
        invalid = _invalid_plate_id_response(self, plate_id)
        if invalid is not None:
            return invalid
        plate = self.store.load_plate(plate_id)
        if plate is None:
            return self.json_message("Plate not found", status_code=404)

        profile = _PROFILES_BY_ID.get(plate.device_profile_id)
        if profile is None:
            return self.json({"errors": [f"Unknown device profile: {plate.device_profile_id}"]})
        errors = validate_plate(plate, profile, widget_defs=BUILTIN_WIDGETS)
        if errors:
            return self.json({"errors": errors})

        jsonl_content, yaml_content = compile_plate(plate)
        jsonl_path = self.hass.config.path("openhasp", f"{plate_id}_pages.jsonl")
        yaml_path = self.hass.config.path("openhasp_configs", f"{plate_id}.yaml")

        for path, content in [(jsonl_path, jsonl_content), (yaml_path, yaml_content)]:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            tmp_path = path + ".tmp"
            with open(tmp_path, "w") as f:
                f.write(content)
            os.replace(tmp_path, path)

        label = f"Published {datetime.now(timezone.utc).isoformat()}"
        version = self.store.add_version(
            plate_id, plate.to_dict(),
            label=label,
            published=True,
        )

        try:
            # The `openhasp` integration (a separate, existing custom_component
            # not part of this codebase) is configured via YAML
            # (`openhasp: !include_dir_merge_named openhasp_configs/`), so it
            # is reloaded via its own `<domain>.reload` service -- the
            # conventional reload service for YAML-configured HA
            # integrations -- not via `homeassistant.reload_config_entry`,
            # which only applies to config-entry-based integrations and
            # this integration declares `config_flow: false` and has no
            # entry_id to reload anyway.
            await self.hass.services.async_call(
                "openhasp", "reload", {}, blocking=True,
            )
        except Exception:
            _LOGGER.exception(
                "openhasp.reload service call failed after publishing plate %s",
                plate_id,
            )
            return self.json({"errors": [], "warning": "push failed, retry",
                               "version": version.version_number})

        return self.json({"errors": [], "version": version.version_number})


class ConfigTextView(HomeAssistantView):
    """Read-only view of what Publish would write, for the raw config editor.

    Always derived from the current in-memory (possibly unsaved-to-disk)
    plate the client POSTs -- never reads the on-disk openhasp/openhasp_configs
    files, so what you see in the editor matches what "Preview" would parse
    back, not stale published output."""

    url = "/api/openhasp_builder/plates/{plate_id}/config"
    name = "api:openhasp_builder:config_text"
    requires_auth = True

    async def post(self, request, plate_id):
        invalid = _invalid_plate_id_response(self, plate_id)
        if invalid is not None:
            return invalid
        body = await request.json()
        try:
            plate = Plate.from_dict(body)
        except Exception as exc:
            return self.json_message(f"Invalid plate payload: {exc}", status_code=400)

        jsonl_content, yaml_content = compile_plate(plate)
        return self.json({"jsonl": jsonl_content, "yaml": yaml_content})


class ConfigPreviewView(HomeAssistantView):
    """Re-parses edited jsonl/yaml text into a Plate, without ever writing to
    disk -- lets the raw config editor show what a hand-edit would produce in
    the canvas before the user commits to Save Draft or Publish."""

    url = "/api/openhasp_builder/plates/{plate_id}/config/preview"
    name = "api:openhasp_builder:config_preview"
    requires_auth = True

    async def post(self, request, plate_id):
        invalid = _invalid_plate_id_response(self, plate_id)
        if invalid is not None:
            return invalid
        body = await request.json()
        jsonl_text = body.get("jsonl", "")
        yaml_text = body.get("yaml", "")
        device_profile_id = body.get("device_profile_id", DEFAULT_DEVICE_PROFILES[0].id)
        theme_id = body.get("theme_id", DEFAULT_THEMES[0].id)

        plate, warnings = import_plate_text(
            plate_id, jsonl_text, yaml_text, device_profile_id, theme_id,
        )
        return self.json({"plate": plate.to_dict(), "warnings": warnings})


class TemplateEvalView(HomeAssistantView):
    url = "/api/openhasp_builder/template_eval"
    name = "api:openhasp_builder:template_eval"
    requires_auth = True

    def __init__(self, hass: HomeAssistant):
        self.hass = hass

    async def post(self, request):
        body = await request.json()
        templates = body.get("templates", [])
        if not isinstance(templates, list):
            return self.json_message("templates must be a list", status_code=400)

        results = []
        for tpl in templates:
            try:
                value = Template(str(tpl), self.hass).async_render(parse_result=False)
                results.append(str(value))
            except Exception as exc:
                results.append(f"[error: {exc}]")
        return self.json({"results": results})


def async_register_api_views(hass: HomeAssistant, store: PlateStore) -> None:
    hass.http.register_view(PlatesListView(store, hass))
    hass.http.register_view(PlateView(store))
    hass.http.register_view(WidgetsView())
    hass.http.register_view(ThemesView(store))
    hass.http.register_view(CompositesView(store))
    hass.http.register_view(VersionsView(store))
    hass.http.register_view(RestoreVersionView(store))
    hass.http.register_view(CreatePlateView(store))
    hass.http.register_view(ImportView(store, hass))
    hass.http.register_view(PublishView(store, hass))
    hass.http.register_view(ConfigTextView())
    hass.http.register_view(ConfigPreviewView())
    hass.http.register_view(TemplateEvalView(hass))
