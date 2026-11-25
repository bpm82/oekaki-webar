import hashlib
import json
from pathlib import Path


SLOTS = tuple(f"{number:02}" for number in range(1, 101))


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
        path = Path("drawings") / f"{slot}.png"
        if path.is_file() and not path.is_symlink():
            yield slot, path, source_digest(path)
