import json
import re
import urllib.request
from html import unescape
from pathlib import Path
from typing import Any


SOURCE_URL = "https://a.4399.cn/rocom/tools/inquiry"
OUT_DIR = Path(__file__).resolve().parents[1] / "public" / "element-icons"

ICON_FILES = {
    "普通": "normal.png",
    "草": "grass.png",
    "火": "fire.png",
    "水": "water.png",
    "光": "light.png",
    "地": "earth.png",
    "冰": "ice.png",
    "电": "electric.png",
    "龙": "dragon.png",
    "毒": "poison.png",
    "虫": "bug.png",
    "武": "martial.png",
    "翼": "wing.png",
    "萌": "cute.png",
    "幽": "ghost.png",
    "恶": "dark.png",
    "幻": "illusion.png",
    "机械": "machine.png",
}


def main() -> int:
    html = fetch_text(SOURCE_URL)
    data = parse_next_data(html)
    items = find_items(data)
    icon_items = [item for item in items if "1" in [str(category) for category in item.get("category", [])]]
    by_name = {str(item["name"]).strip(): item for item in icon_items}

    missing = [name for name in ICON_FILES if name not in by_name]
    if missing:
        raise RuntimeError(f"element icons missing from 4399 source: {', '.join(missing)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, Any] = {"sourceUrl": SOURCE_URL, "icons": {}}
    for name, file_name in ICON_FILES.items():
        source_url = normalize_url(str(by_name[name]["pic_url"]))
        target_path = OUT_DIR / file_name
        target_path.write_bytes(fetch_bytes(source_url))
        manifest["icons"][name] = {"file": file_name, "sourceUrl": source_url}

    (OUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"downloaded": len(ICON_FILES), "outDir": str(OUT_DIR)}, ensure_ascii=False))
    return 0


def fetch_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "RockRosterOverlay/0.1"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8")


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "Referer": SOURCE_URL,
            "User-Agent": "RockRosterOverlay/0.1",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def parse_next_data(html: str) -> dict[str, Any]:
    match = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">([\s\S]*?)</script>',
        html,
    )
    if not match:
        raise RuntimeError("__NEXT_DATA__ not found")
    return json.loads(unescape(match.group(1)))


def find_items(next_data: dict[str, Any]) -> list[dict[str, Any]]:
    info_data = next_data["props"]["pageProps"]["infoData"]
    return next(module for module in info_data if module.get("name") == "items")["options"]["items"]


def normalize_url(url: str) -> str:
    url = url.strip()
    if url.startswith("//"):
        return f"https:{url}"
    return url


if __name__ == "__main__":
    raise SystemExit(main())
