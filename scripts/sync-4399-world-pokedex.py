import argparse
import json
import re
import shutil
import sys
import time
import urllib.request
from dataclasses import dataclass
from hashlib import sha1
from html import unescape
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image


SOURCE_URL = "https://a.4399.cn/rocom/tools/collection"
DEFAULT_DATA_DIR = Path.home() / "Documents" / "RockRosterOverlay"
SPIRIT_CATEGORY_IDS = {"241", "1230"}
TYPE_LABELS = {
    "241": "精灵图鉴",
    "1229": "S2赛季异色",
    "1230": "异色精灵",
}
MANUAL_ALIASES = {}
MANUAL_ELEMENTS = {
    "霹雳迪迪": "电/光",
    "巨鼓象": "机械",
}


@dataclass
class SyncItem:
    id: str
    name: str
    source_url: str
    categories: list[str]
    element: str


def main() -> int:
    parser = argparse.ArgumentParser(description="同步 4399 洛克王国：世界精灵图鉴素材")
    parser.add_argument("--html", help="使用本地 4399 图鉴 HTML 缓存")
    parser.add_argument("--out", default=str(DEFAULT_DATA_DIR), help="输出数据目录")
    parser.add_argument("--force", action="store_true", help="强制重新下载和转换")
    parser.add_argument("--dry-run", action="store_true", help="只解析，不写入")
    args = parser.parse_args()

    data_dir = Path(args.out).resolve()
    pets_dir = data_dir / "assets" / "pets"
    data_file = data_dir / "data" / "pets.json"
    report_file = data_dir / "data" / "4399-world-pokedex-report.json"
    now = time.strftime("%Y-%m-%dT%H:%M:%S%z")

    html = Path(args.html).read_text("utf-8") if args.html else fetch_text(SOURCE_URL)
    next_data = parse_next_data(html)
    element_map = build_element_map(next_data)
    items = build_items(next_data, element_map)

    report: dict[str, Any] = {
        "sourceUrl": SOURCE_URL,
        "source": "4399 洛克王国：世界-全图鉴查询手册",
        "spiritCategories": sorted(SPIRIT_CATEGORY_IDS),
        "parsedAssets": len(items),
        "downloaded": 0,
        "reused": 0,
        "processedWhiteBackground": [],
        "convertedFormat": [],
        "failed": [],
        "warnings": [],
        "output": {
            "dataDir": str(data_dir),
            "petsDir": str(pets_dir),
            "dataFile": str(data_file),
            "reportFile": str(report_file),
        },
        "generatedAt": now,
    }

    if not args.dry_run:
        pets_dir.mkdir(parents=True, exist_ok=True)
        data_file.parent.mkdir(parents=True, exist_ok=True)

    assets = []
    name_counts = count_normalized_names([item.name for item in items])
    for item in items:
        file_name = build_file_name(item)
        target_path = pets_dir / file_name
        try:
            if args.dry_run:
                pass
            elif target_path.exists() and not args.force:
                report["reused"] += 1
            else:
                raw = fetch_bytes(item.source_url)
                process_image(raw, target_path, item, report)
                report["downloaded"] += 1

            aliases = build_aliases(item.name, name_counts)
            assets.append(
                {
                    "id": f"4399-world-{stable_hash(item.id + item.name)[:16]}",
                    "name": item.name,
                    "aliases": aliases,
                    "element": item.element,
                    "imagePath": file_name,
                    "sourceNote": " | ".join(
                        [
                            "4399 洛克王国：世界全图鉴",
                            f"id:{item.id}",
                            ",".join(TYPE_LABELS.get(category, category) for category in item.categories),
                            item.source_url,
                        ]
                    ),
                    "updatedAt": now,
                }
            )
        except Exception as error:  # noqa: BLE001 - report and continue.
            report["failed"].append(
                {
                    "name": item.name,
                    "url": item.source_url,
                    "reason": str(error),
                }
            )

    duplicates = duplicate_normalized_names([asset["name"] for asset in assets])
    if duplicates:
        report["warnings"].append(f"归一化名称重复：{'、'.join(duplicates)}")

    if not args.dry_run:
        data_file.write_text(json.dumps(assets, ensure_ascii=False, indent=2) + "\n", "utf-8")
        report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf-8")

    print(
        json.dumps(
            {
                "parsedAssets": len(items),
                "downloaded": report["downloaded"],
                "reused": report["reused"],
                "processedWhiteBackground": len(report["processedWhiteBackground"]),
                "convertedFormat": len(report["convertedFormat"]),
                "failed": len(report["failed"]),
                "warnings": len(report["warnings"]),
                "dryRun": args.dry_run,
                "dataFile": str(data_file),
                "reportFile": str(report_file),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if not report["failed"] else 1


def parse_next_data(html: str) -> dict[str, Any]:
    match = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">([\s\S]*?)</script>',
        html,
    )
    if not match:
        raise RuntimeError("__NEXT_DATA__ not found")
    return json.loads(unescape(match.group(1)))


def build_element_map(next_data: dict[str, Any]) -> dict[str, str]:
    info_data = next_data["props"]["pageProps"]["infoData"]
    filters = next(module for module in info_data if module.get("name") == "filter")["options"][
        "filters"
    ]
    element_filter = next(filter_item for filter_item in filters if filter_item["label"] == "精灵属性")
    return {child["id"]: child["label"] for child in element_filter["children"]}


def build_items(next_data: dict[str, Any], element_map: dict[str, str]) -> list[SyncItem]:
    info_data = next_data["props"]["pageProps"]["infoData"]
    raw_items = next(module for module in info_data if module.get("name") == "items")["options"]["items"]
    result: list[SyncItem] = []
    for raw_item in raw_items:
        categories = [str(category) for category in raw_item.get("category", [])]
        if not SPIRIT_CATEGORY_IDS.intersection(categories):
            continue
        source_url = normalize_url(raw_item.get("pic_url", ""))
        if not source_url:
            continue
        filters = [str(filter_id) for filter_id in raw_item.get("filter", [])]
        elements = [element_map[filter_id] for filter_id in filters if filter_id in element_map]
        result.append(
            SyncItem(
                id=str(raw_item.get("id", stable_hash(raw_item.get("name", "") + source_url)[:10])),
                name=str(raw_item["name"]).strip(),
                source_url=source_url,
                categories=categories,
                element="/".join(elements),
            )
        )
    return disambiguate_s2_names(result)


def disambiguate_s2_names(items: list[SyncItem]) -> list[SyncItem]:
    original_counts = count_normalized_names([item.name for item in items])
    normal_elements = {
        normalize_name(item.name): item.element
        for item in items
        if "241" in item.categories and item.element
    }
    for item in items:
        normalized = normalize_name(item.name)
        if "1230" in item.categories and original_counts.get(normalized, 0) > 1:
            item.name = f"{item.name}（S2异色）"
        if "1230" in item.categories and not item.element:
            item.element = normal_elements.get(normalized, "")
        if item.name in MANUAL_ELEMENTS:
            item.element = MANUAL_ELEMENTS[item.name]
    return items


def normalize_url(url: str) -> str:
    url = url.strip()
    if url.startswith("//"):
        return f"https:{url}"
    return url


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


def process_image(raw: bytes, target_path: Path, item: SyncItem, report: dict[str, Any]) -> None:
    image = Image.open(BytesIO(raw)).convert("RGBA")
    source_ext = item.source_url.split("?", 1)[0].rsplit(".", 1)[-1].lower()
    had_alpha = has_transparency(image)
    if source_ext != "png":
        report["convertedFormat"].append({"name": item.name, "from": source_ext, "to": "png"})

    if not had_alpha:
        image, changed_pixels = white_to_alpha(image)
        if changed_pixels:
            report["processedWhiteBackground"].append({"name": item.name, "pixels": changed_pixels})

    image.save(target_path, "PNG")
    if not has_transparency(image):
        report["warnings"].append(f"{item.name}: 转换后仍未检测到透明像素")


def has_transparency(image: Image.Image) -> bool:
    alpha = image.getchannel("A")
    extrema = alpha.getextrema()
    return extrema[0] < 255


def white_to_alpha(image: Image.Image) -> tuple[Image.Image, int]:
    pixels = image.load()
    width, height = image.size
    changed = 0
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            spread = max(r, g, b) - min(r, g, b)
            if r >= 245 and g >= 245 and b >= 245 and spread <= 12:
                pixels[x, y] = (r, g, b, 0)
                changed += 1
            elif r >= 235 and g >= 235 and b >= 235 and spread <= 18:
                alpha = max(0, min(255, int((255 - min(r, g, b)) * 14)))
                if alpha < a:
                    pixels[x, y] = (r, g, b, alpha)
                    changed += 1
    return image, changed


def build_file_name(item: SyncItem) -> str:
    safe_name = re.sub(r'[<>:"/\\|?*\s]+', "_", item.name).strip("_")
    safe_name = safe_name.replace("（", "(").replace("）", ")")
    return f"{int(item.id):04d}-{safe_name}.png" if item.id.isdigit() else f"{item.id}-{safe_name}.png"


def build_aliases(name: str, name_counts: dict[str, int]) -> list[str]:
    aliases: list[str] = []
    bracket = re.match(r"^(.+?)（(.+?)）$", name)
    if bracket:
        base = bracket.group(1)
        if name_counts.get(normalize_name(base), 0) == 0:
            aliases.append(base)
        aliases.append(base + bracket.group(2))
    aliases.extend(MANUAL_ALIASES.get(name, []))
    return unique_strings(aliases)


def count_normalized_names(names: list[str]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for name in names:
        normalized = normalize_name(name)
        counts[normalized] = counts.get(normalized, 0) + 1
    return counts


def duplicate_normalized_names(names: list[str]) -> list[str]:
    counts = count_normalized_names(names)
    return [name for name in names if counts.get(normalize_name(name), 0) > 1]


def normalize_name(value: str) -> str:
    return re.sub(r"[\s\u3000]+", "", value).lower()


def unique_strings(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = normalize_name(value)
        if not value or normalized in seen:
            continue
        seen.add(normalized)
        result.append(value)
    return result


def stable_hash(value: str) -> str:
    return sha1(value.encode("utf-8")).hexdigest()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise
    except Exception as error:  # noqa: BLE001 - CLI output should be direct.
        print(f"sync failed: {error}", file=sys.stderr)
        raise SystemExit(1)
