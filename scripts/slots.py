import hashlib
import json
from pathlib import Path


SLOTS = tuple(f"{number:02}" for number in range(1, 101))
ASSETS = Path("assets")


def source_digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read_status(directory):
    path = directory / "status.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}


def write_status(directory, state, digest):
    directory.mkdir(parents=True, exist_ok=True)
    data = {"state": state, "source": digest}
    (directory / "status.json").write_text(json.dumps(data) + "\n", encoding="utf-8")


def drawings():
    for slot in SLOTS:
        path = ASSETS / slot / "drawing.png"
        if path.parent.is_symlink():
            continue
        if not path.exists():
            path = Path("drawings") / f"{slot}.png"
        if path.is_file() and not path.is_symlink():
            yield slot, path, source_digest(path)


def organize_incoming():
    for slot in SLOTS:
        path = Path("drawings") / f"{slot}.png"
        if not path.is_file() or path.is_symlink():
            continue
        destination = ASSETS / slot / "drawing.png"
        if destination.exists() or destination.is_symlink() or destination.parent.is_symlink():
            print(f"::warning::{path} was kept in the inbox because {destination} is in use.")
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        path.rename(destination)
        print(f"Moved {path} to {destination}")


if __name__ == "__main__":
    organize_incoming()
