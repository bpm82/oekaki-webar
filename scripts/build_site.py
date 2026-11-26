import argparse
import json
import shutil
from pathlib import Path

from slots import ASSETS, SLOTS, drawings, read_status


def skip_managed_files(directory, names):
    path = Path(directory)
    skipped = {name for name in names if (path / name).is_symlink()}
    if path.parent == ASSETS and path.name in SLOTS:
        skipped.update({"drawing.png", f"{path.name}.glb", "status.json"})
    return skipped


def build(output):
    shutil.copytree("site", output, dirs_exist_ok=True)
    shutil.copytree(ASSETS, output / "assets", dirs_exist_ok=True, ignore=skip_managed_files)
    catalog = {}
    for slot, image, digest in drawings():
        source = ASSETS / slot
        recorded = read_status(source)
        state = recorded.get("state") if recorded.get("source") == digest else "pending"
        target = output / "assets" / slot
        target.mkdir(parents=True, exist_ok=True)
        with image.open("rb") as stream:
            is_png = stream.read(8) == b"\x89PNG\r\n\x1a\n"
        if is_png:
            shutil.copyfile(image, target / "drawing.png")
        if state == "ready":
            model = source / f"{slot}.glb"
            if model.is_file() and not model.is_symlink():
                shutil.copyfile(model, target / model.name)
            else:
                state = "pending"
        catalog[slot] = {"state": state, "source": digest, "preview": is_png}
    (output / "catalog.json").write_text(json.dumps(catalog) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.output)
