import argparse
import os
import sys
import traceback
from pathlib import Path

from slots import drawings, read_status, write_status


def pending(store, retry):
    for slot, path, digest in drawings():
        directory = store / slot
        status = read_status(directory)
        if status.get("source") == digest:
            if status["state"] == "ready" and (directory / f"{slot}.glb").is_file():
                continue
            if status["state"] == "failed" and not retry:
                continue
        yield slot, path, digest


def prepare_image(path):
    import numpy as np
    from PIL import Image, ImageOps
    from scipy.ndimage import binary_fill_holes
    from tsr.utils import resize_foreground

    with Image.open(path) as source:
        if source.format != "PNG" or source.width * source.height > 20_000_000:
            raise ValueError("PNGを2000万画素以下で用意してください。")
        image = ImageOps.exif_transpose(source).convert("RGBA")
    image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    rgba = np.array(image)
    alpha = rgba[:, :, 3]
    if alpha.min() == 255:
        # Remove a photographed or scanned white background connected to the edges.
        white = np.min(rgba[:, :, :3], axis=2) >= 240
        if white[0].mean() > 0.8 and white[-1].mean() > 0.8:
            alpha[~binary_fill_holes(~white)] = 0
        else:
            import rembg
            image = rembg.remove(image, session=rembg.new_session("u2netp", providers=["CPUExecutionProvider"]))
            rgba = np.array(image)
            alpha = rgba[:, :, 3]
    # Closed outlines drawn on the transparent canvas have a white interior.
    interior = binary_fill_holes(alpha > 20) & (alpha == 0)
    rgba[interior] = 255
    image = Image.fromarray(rgba)
    bounds = image.getchannel("A").getbbox()
    if not bounds or min(bounds[2] - bounds[0], bounds[3] - bounds[1]) < 4:
        raise ValueError("立体にする絵を見つけられませんでした。")
    image = resize_foreground(image, 0.85)
    background = Image.new("RGB", image.size, (128, 128, 128))
    background.paste(image, mask=image.getchannel("A"))
    return background


def convert(items, store):
    import numpy as np
    import torch
    from huggingface_hub import snapshot_download
    from tsr.system import TSR
    from tsr.utils import to_gradio_3d_orientation

    torch.set_num_threads(int(os.environ.get("OMP_NUM_THREADS", "4")))
    weights = snapshot_download("stabilityai/TripoSR", revision=os.environ["WEIGHTS_REF"],
                                allow_patterns=["config.yaml", "model.ckpt"])
    model = TSR.from_pretrained(weights, config_name="config.yaml", weight_name="model.ckpt").eval().to("cpu")
    model.renderer.set_chunk_size(4096)
    failures = 0
    for slot, path, digest in items:
        directory = store / slot
        try:
            print(f"Reconstructing {slot} on CPU", flush=True)
            image = prepare_image(path)
            with torch.inference_mode():
                codes = model(image, device="cpu")
                mesh = model.extract_mesh(codes, has_vertex_color=True, resolution=128)[0]
            if not len(mesh.faces) or not np.isfinite(mesh.vertices).all():
                raise ValueError("有効な立体を生成できませんでした。")
            glb = to_gradio_3d_orientation(mesh).export(file_type="glb")
            if glb[:4] != b"glTF" or len(glb) > 80 * 1024 * 1024:
                raise ValueError("GLBの形式またはサイズが範囲外です。")
            directory.mkdir(parents=True, exist_ok=True)
            (directory / f"{slot}.glb").write_bytes(glb)
            write_status(directory, "ready", digest)
            print(f"{slot}: {len(mesh.faces):,} faces, {len(glb):,} bytes", flush=True)
        except Exception:
            traceback.print_exc()
            write_status(directory, "failed", digest)
            failures += 1
    return bool(failures)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["scan", "generate", "mark-failures"])
    parser.add_argument("store", type=Path)
    parser.add_argument("--retry", action="store_true")
    args = parser.parse_args()
    items = list(pending(args.store, args.retry))
    if args.mode == "scan":
        print(f"{len(items)} drawing(s) to convert")
        if output := os.environ.get("GITHUB_OUTPUT"):
            with open(output, "a", encoding="utf-8") as handle:
                print(f"pending={'true' if items else 'false'}", file=handle)
    elif args.mode == "mark-failures":
        for slot, _, digest in items:
            write_status(args.store / slot, "failed", digest)
    elif items:
        return convert(items, args.store)
    return 0


if __name__ == "__main__":
    sys.exit(main())
