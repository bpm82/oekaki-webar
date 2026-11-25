import argparse
import json
import shutil
from pathlib import Path

from slots import drawings, read_status


def build(store, output):
    shutil.copytree("site", output, dirs_exist_ok=True)
    catalog = {}
    for slot, image, digest in drawings():
        source = store / slot
        recorded = read_status(source)
        state = recorded.get("state") if recorded.get("source") == digest else "pending"
        target = output / "assets" / slot
        target.mkdir(parents=True, exist_ok=True)
        with image.open("rb") as stream:
            is_png = stream.read(8) == b"\x89PNG\r\n\x1a\n"
        if is_png:
            shutil.copyfile(image, target / "drawing.png")
        if state == "ready":
            shutil.copyfile(source / f"{slot}.glb", target / f"{slot}.glb")
        catalog[slot] = {"state": state, "source": digest, "preview": is_png}
    (output / "catalog.json").write_text(json.dumps(catalog) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("store", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.store, args.output)
