from dataclasses import dataclass, field, asdict

@dataclass
class Theme:
    id: str
    name: str
    colors: dict
    fonts: dict
    spacing: dict

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "Theme":
        return cls(**d)


@dataclass
class DeviceProfile:
    id: str
    name: str
    width: int
    height: int

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "DeviceProfile":
        return cls(**d)


@dataclass
class WidgetDef:
    id: str
    type: str
    default_w: int
    default_h: int
    param_schema: list
    render_spec: list

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "WidgetDef":
        return cls(**d)


@dataclass
class PlacedWidget:
    widget_def_id: str
    x: int
    y: int
    w: int
    h: int
    page: int
    params: dict
    obj_id_start: int
    obj_id_end: int
    disabled: bool = False

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "PlacedWidget":
        return cls(**d)


@dataclass
class Page:
    id: int
    order: int
    background: str
    widgets: list
    page_props: dict = field(default_factory=dict)
    has_declaration: bool = True

    def to_dict(self) -> dict:
        return {**{k: v for k, v in asdict(self).items() if k != "widgets"},
                "widgets": [w.to_dict() if isinstance(w, PlacedWidget) else w for w in self.widgets]}

    @classmethod
    def from_dict(cls, d: dict) -> "Page":
        widgets = [PlacedWidget.from_dict(w) for w in d["widgets"]]
        return cls(id=d["id"], order=d["order"], background=d["background"], widgets=widgets,
                    page_props=d.get("page_props", {}),
                    has_declaration=d.get("has_declaration", True))


@dataclass
class Plate:
    id: str
    device_profile_id: str
    theme_id: str
    pages: list
    display_name: str = ""

    def __post_init__(self):
        if not self.display_name:
            self.display_name = self.id

    def to_dict(self) -> dict:
        return {"id": self.id, "device_profile_id": self.device_profile_id,
                "theme_id": self.theme_id, "display_name": self.display_name,
                "pages": [p.to_dict() if isinstance(p, Page) else p for p in self.pages]}

    @classmethod
    def from_dict(cls, d: dict) -> "Plate":
        pages = [Page.from_dict(p) for p in d["pages"]]
        return cls(id=d["id"], device_profile_id=d["device_profile_id"],
                    theme_id=d["theme_id"], pages=pages,
                    display_name=d.get("display_name") or d["id"])


@dataclass
class CompositeTemplateMember:
    """One widget within a saved composite, positioned relative to the
    group's top-left anchor rather than absolute canvas coordinates, so the
    group can be re-dropped anywhere."""
    dx: int
    dy: int
    w: int
    h: int
    obj_type: str
    static_props: dict
    properties: dict
    event: dict

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "CompositeTemplateMember":
        return cls(**d)


@dataclass
class CompositeTemplate:
    id: str
    name: str
    members: list

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name,
                "members": [m.to_dict() if isinstance(m, CompositeTemplateMember) else m
                            for m in self.members]}

    @classmethod
    def from_dict(cls, d: dict) -> "CompositeTemplate":
        members = [CompositeTemplateMember.from_dict(m) for m in d["members"]]
        return cls(id=d["id"], name=d["name"], members=members)


@dataclass
class Version:
    plate_id: str
    version_number: int
    timestamp: str
    label: str
    published: bool
    snapshot: dict

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "Version":
        return cls(**d)
