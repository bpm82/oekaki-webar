import json
import os
import struct
import subprocess
import tempfile
from pathlib import Path
from check_baked_color import verify_bake


def has_baked_color(path):
    """Check for a self-contained PNG base color and UVs on every primitive."""
    with path.open("rb") as handle:
        header = handle.read(20)
        if len(header) != 20:
            return False
        magic, version, length, chunk_length, kind = struct.unpack("<4sIII4s", header)
        if (magic, version, kind) != (b"glTF", 2, b"JSON") or length != path.stat().st_size:
            return False
        if chunk_length > length - 20:
            return False
        try:
            doc = json.loads(handle.read(chunk_length))
            primitives = [p for mesh in doc["meshes"] for p in mesh["primitives"]]
            for primitive in primitives:
                material = doc["materials"][primitive["material"]]
                base = material["pbrMetallicRoughness"]["baseColorTexture"]
                image = doc["images"][doc["textures"][base["index"]]["source"]]
                view = doc["bufferViews"][image["bufferView"]]
                uv = "TEXCOORD_" + str(base.get("texCoord", 0))
                if (uv not in primitive["attributes"] or image.get("mimeType") != "image/png"
                        or "uri" in image or "uri" in doc["buffers"][view["buffer"]]):
                    return False
            return bool(primitives)
        except (KeyError, IndexError, TypeError, ValueError):
            return False


def bake_color_glb(raw, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent) as temp:
        source = Path(temp) / "vertex.glb"
        output = Path(temp) / "baked.glb"
        source.write_bytes(raw)
        subprocess.run([os.environ.get("BLENDER_BIN", "blender"), "--background", "--factory-startup",
                        "--threads", "4", "--python-exit-code", "1", "--python",
                        str(Path(__file__).with_name("bake_colors.py")), "--", str(source.resolve()),
                        str(output.resolve())], check=True)
        if not has_baked_color(output) or output.stat().st_size > 80 * 1024 * 1024:
            raise ValueError("有効なテクスチャ付きGLBを作成できませんでした。")
        verify_bake(raw, output.read_bytes())
        output.replace(destination)
