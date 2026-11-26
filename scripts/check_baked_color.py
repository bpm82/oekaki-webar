"""Compare TripoSR's linear vertex colors to the PNG actually embedded in its baked GLB."""
import io
import json
import struct


class MeshGLB:
    def __init__(self, data):
        json_length = struct.unpack_from("<I", data, 12)[0]
        self.doc = json.loads(data[20:20 + json_length])
        self.binary = memoryview(data)[28 + json_length:]
        self.primitive = self.doc["meshes"][0]["primitives"][0]

    def accessor(self, index):
        import numpy as np

        accessor = self.doc["accessors"][index]
        view = self.doc["bufferViews"][accessor["bufferView"]]
        width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[accessor["type"]]
        dtype = np.dtype({5121: "u1", 5123: "<u2", 5125: "<u4", 5126: "<f4"}[accessor["componentType"]])
        stride = view.get("byteStride", width * dtype.itemsize)
        values = np.ndarray((accessor["count"], width), dtype=dtype, buffer=self.binary,
                            offset=view.get("byteOffset", 0) + accessor.get("byteOffset", 0),
                            strides=(stride, dtype.itemsize))
        if accessor.get("normalized"):
            return values.astype(np.float32) / np.iinfo(dtype).max
        return values

    def attribute(self, name):
        return self.accessor(self.primitive["attributes"][name])

    def base_color(self):
        import numpy as np
        from PIL import Image

        material = self.doc["materials"][self.primitive["material"]]
        base = material["pbrMetallicRoughness"]["baseColorTexture"]
        image = self.doc["images"][self.doc["textures"][base["index"]]["source"]]
        view = self.doc["bufferViews"][image["bufferView"]]
        offset = view.get("byteOffset", 0)
        with Image.open(io.BytesIO(self.binary[offset:offset + view["byteLength"]])) as texture:
            srgb = np.asarray(texture.convert("RGB"), dtype=np.float32) / 255
        return np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)


def verify_bake(vertex_glb, texture_glb):
    import numpy as np

    source, result = MeshGLB(vertex_glb), MeshGLB(texture_glb)
    # The unwrap splits UV seams and reindexes triangles; positions still identify
    # the source colors, which TripoSR predicts as a function of position.
    source_index = {tuple(p): i for i, p in enumerate(source.attribute("POSITION"))}
    positions = result.attribute("POSITION")
    original_vertices = np.array([source_index[tuple(p)] for p in positions])
    faces = result.accessor(result.primitive["indices"]).reshape(-1, 3)
    expected = source.attribute("COLOR_0")[original_vertices[faces], :3].mean(axis=1)
    uv = result.attribute("TEXCOORD_0")[faces].mean(axis=1)
    image = result.base_color()
    height, width = image.shape[:2]
    x, y = np.clip(uv * [width, height], 0, [width - 1, height - 1]).astype(int).T
    error = np.abs(image[y, x] - expected).mean(axis=1)
    triangles = positions[faces]
    areas = np.linalg.norm(np.cross(triangles[:, 1] - triangles[:, 0],
                                    triangles[:, 2] - triangles[:, 0]), axis=1)
    mean_error = np.average(error, weights=areas)
    if not np.isfinite(mean_error) or mean_error > 0.035 or np.average(error > 0.17, weights=areas) > 0.05:
        raise ValueError(f"焼き込み後のテクスチャが元の色と一致しません (mean error {mean_error:.4f})")
    print(f"Verified embedded {width}x{height} base color against the source (mean error {mean_error:.4f})",
          flush=True)
