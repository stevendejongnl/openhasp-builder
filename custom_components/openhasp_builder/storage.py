import json
import os
from .schema import Plate, Version, Theme, CompositeTemplate


class PlateStore:
    def __init__(self, base_dir: str):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)

    def _plate_path(self, plate_id: str) -> str:
        return os.path.join(self.base_dir, f"{plate_id}.json")

    def _versions_path(self, plate_id: str) -> str:
        return os.path.join(self.base_dir, f"{plate_id}.versions.json")

    def save_plate(self, plate: Plate) -> None:
        path = self._plate_path(plate.id)
        tmp_path = path + ".tmp"
        with open(tmp_path, "w") as f:
            json.dump(plate.to_dict(), f, indent=2)
        os.replace(tmp_path, path)

    def load_plate(self, plate_id: str) -> Plate | None:
        path = self._plate_path(plate_id)
        if not os.path.exists(path):
            return None
        with open(path) as f:
            return Plate.from_dict(json.load(f))

    def list_plate_ids(self) -> list[str]:
        """Plate ids that have a saved draft, sorted.

        The store keeps several non-plate files in the same directory
        (`themes.json`, `composites.json`, `{id}.versions.json`, and `.tmp`
        files mid-write), so match only the exact `{id}.json` shape."""
        ids = []
        for name in os.listdir(self.base_dir):
            if not name.endswith(".json") or name.endswith(".versions.json"):
                continue
            stem = name[: -len(".json")]
            if stem in ("themes", "composites"):
                continue
            ids.append(stem)
        return sorted(ids)

    def add_version(self, plate_id: str, snapshot: dict, label: str, published: bool) -> Version:
        versions = self.list_versions(plate_id)
        next_number = (versions[-1].version_number + 1) if versions else 1
        version = Version(
            plate_id=plate_id, version_number=next_number,
            timestamp=snapshot.get("_timestamp", ""), label=label,
            published=published, snapshot=snapshot,
        )
        versions.append(version)
        versions = self._prune(versions)
        self._write_versions(plate_id, versions)
        return version

    def list_versions(self, plate_id: str) -> list:
        path = self._versions_path(plate_id)
        if not os.path.exists(path):
            return []
        with open(path) as f:
            return [Version.from_dict(v) for v in json.load(f)]

    def _write_versions(self, plate_id: str, versions: list) -> None:
        path = self._versions_path(plate_id)
        tmp_path = path + ".tmp"
        with open(tmp_path, "w") as f:
            json.dump([v.to_dict() for v in versions], f, indent=2)
        os.replace(tmp_path, path)

    def _prune(self, versions: list, keep_last: int = 20) -> list:
        if len(versions) <= keep_last:
            return versions
        pinned = [v for v in versions if v.version_number == 1]
        rest = [v for v in versions if v.version_number != 1]
        rest = rest[-(keep_last - len(pinned)):]
        return pinned + rest

    def restore_version(self, plate_id: str, version_number: int) -> Plate:
        versions = self.list_versions(plate_id)
        try:
            match = next(v for v in versions if v.version_number == version_number)
        except StopIteration:
            raise ValueError(f"Version {version_number} not found for plate {plate_id}")
        plate = Plate.from_dict(match.snapshot)
        self.save_plate(plate)
        return plate

    def _themes_path(self) -> str:
        return os.path.join(self.base_dir, "themes.json")

    def list_themes(self) -> list:
        path = self._themes_path()
        if not os.path.exists(path):
            return []
        with open(path) as f:
            return [Theme.from_dict(t) for t in json.load(f)]

    def save_theme(self, theme: Theme) -> None:
        themes = [t for t in self.list_themes() if t.id != theme.id]
        themes.append(theme)
        path = self._themes_path()
        tmp_path = path + ".tmp"
        with open(tmp_path, "w") as f:
            json.dump([t.to_dict() for t in themes], f, indent=2)
        os.replace(tmp_path, path)

    def _composites_path(self) -> str:
        return os.path.join(self.base_dir, "composites.json")

    def list_composites(self) -> list:
        path = self._composites_path()
        if not os.path.exists(path):
            return []
        with open(path) as f:
            return [CompositeTemplate.from_dict(c) for c in json.load(f)]

    def save_composite(self, composite: CompositeTemplate) -> None:
        composites = [c for c in self.list_composites() if c.id != composite.id]
        composites.append(composite)
        path = self._composites_path()
        tmp_path = path + ".tmp"
        with open(tmp_path, "w") as f:
            json.dump([c.to_dict() for c in composites], f, indent=2)
        os.replace(tmp_path, path)
