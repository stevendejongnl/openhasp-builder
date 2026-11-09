from .schema import DeviceProfile, Theme

DOMAIN = "openhasp_builder"
STORAGE_SUBDIR = "openhasp_builder"
PANEL_URL_PATH = "openhasp-builder"
PANEL_TITLE = "OpenHASP Builder"
PANEL_ICON = "mdi:tablet-dashboard"

DEFAULT_DEVICE_PROFILES = [
    DeviceProfile(id="square_480", name="480x480 Square Panel", width=480, height=480),
]

# Colors match the real production dashboard/living_room configs
# (dark background, green on-state, grey off-state, muted labels).
DEFAULT_THEMES = [
    Theme(
        id="dark",
        name="Dark",
        colors={
            "bg": "#111111",
            "card_bg": "#1c1c1c",
            "accent_on": "#4caf50",
            "accent_off": "#6F6F6F",
            "text": "#FFFFFF",
            "text_muted": "#9b9b9b",
        },
        fonts={"family": "montserrat", "sizes": {"label": 16, "value": 24}},
        spacing={"grid_unit": 5, "corner_radius": 15, "padding": 10},
    ),
]
