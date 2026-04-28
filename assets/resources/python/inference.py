#!/usr/bin/env python3
"""SDXL icon generation backend.

Reads newline-delimited JSON from stdin, writes newline-delimited JSON to stdout.

Input:
  { "id": str, "prompt": str, "negative_prompt"?: str,
    "reference_image"?: str (base64 PNG, no prefix), "seed"?: int }

Output (one line per request):
  { "id": str, "images": [base64, ...] }
  { "id": str, "error": str }
"""

from __future__ import annotations

import base64
import io
import json
import math
import sys
from typing import Optional


PROMPT_PREFIX = (
    "premium macOS app icon, abstract layered sheets, subtle depth, clean lighting, modern UI style, centered composition, rounded square icon, highly polished, App Store quality"
)
DEFAULT_NEGATIVE_PROMPT = (
    "messy, cluttered, low quality, text, watermark, distorted, noisy, flat lighting"
)

NUM_VARIANTS = 3
IMAGE_SIZE = 512
INFERENCE_STEPS = 28
GUIDANCE_SCALE = 9.0
# Seed offset between variants so each one is visually distinct.
SEED_STRIDE = 1000


# ---------------------------------------------------------------------------
# Squircle mask (Lamé curve, n=3.2, same formula as the UI)
# ---------------------------------------------------------------------------

def _make_squircle_mask(size: int, n: float = 3.2) -> "Image":  # type: ignore[name-defined]
    """Return a greyscale PIL image with an anti-aliased squircle mask."""
    from PIL import Image, ImageDraw, ImageFilter  # type: ignore

    # Render at 4× and downsample for smooth anti-aliased edges.
    scale = 4
    big = size * scale
    cx = cy = big / 2.0
    r = big / 2.0
    p = 2.0 / n
    steps = 512

    pts: list[tuple[float, float]] = []
    for i in range(steps):
        t = (i / steps) * 2.0 * math.pi
        c = math.cos(t)
        s = math.sin(t)
        x = cx + r * math.copysign(abs(c) ** p, c)
        y = cy + r * math.copysign(abs(s) ** p, s)
        pts.append((x, y))

    hi_res = Image.new("L", (big, big), 0)
    ImageDraw.Draw(hi_res).polygon(pts, fill=255)
    # Slight blur before downsampling reduces staircase artefacts.
    hi_res = hi_res.filter(ImageFilter.GaussianBlur(scale * 0.6))
    return hi_res.resize((size, size), Image.LANCZOS)


_SQUIRCLE_MASK: Optional[object] = None


def _squircle_mask() -> object:
    global _SQUIRCLE_MASK
    if _SQUIRCLE_MASK is None:
        _SQUIRCLE_MASK = _make_squircle_mask(IMAGE_SIZE)
    return _SQUIRCLE_MASK


# ---------------------------------------------------------------------------
# Inference pipeline (lazy init)
# ---------------------------------------------------------------------------

class _Pipeline:
    """Lazily loaded SDXL pipeline kept alive between requests."""

    def __init__(self) -> None:
        self._pipe = None
        self._device: Optional[str] = None

    def _load(self) -> None:
        if self._pipe is not None:
            return

        import torch  # type: ignore
        from diffusers import StableDiffusionXLPipeline  # type: ignore

        if torch.backends.mps.is_available():
            device = "mps"
            dtype = torch.float16
        elif torch.cuda.is_available():
            device = "cuda"
            dtype = torch.float16
        else:
            device = "cpu"
            dtype = torch.float32

        _log(f"Loading SDXL on {device} …")
        pipe = StableDiffusionXLPipeline.from_pretrained(
            "stabilityai/stable-diffusion-xl-base-1.0",
            torch_dtype=dtype,
            use_safetensors=True,
            variant="fp16" if dtype == torch.float16 else None,
        )
        pipe = pipe.to(device)
        pipe.set_progress_bar_config(disable=True)

        self._pipe = pipe
        self._device = device
        _log("SDXL loaded.")

    def generate(
        self,
        prompt: str,
        negative_prompt: str,
        reference_image_b64: Optional[str],
        seed: int,
    ) -> list[str]:
        self._load()

        import torch  # type: ignore

        full_prompt = f"{PROMPT_PREFIX}, {prompt}"
        results: list[str] = []

        for i in range(NUM_VARIANTS):
            variant_seed = seed + i * SEED_STRIDE
            gen = torch.Generator(device=self._device).manual_seed(variant_seed)

            output = self._pipe(  # type: ignore[misc]
                prompt=full_prompt,
                negative_prompt=negative_prompt,
                num_inference_steps=INFERENCE_STEPS,
                guidance_scale=GUIDANCE_SCALE,
                width=IMAGE_SIZE,
                height=IMAGE_SIZE,
                generator=gen,
            )
            img = output.images[0]

            # Apply squircle mask as the alpha channel.
            img = img.convert("RGBA")
            img.putalpha(_squircle_mask())  # type: ignore[arg-type]

            buf = io.BytesIO()
            img.save(buf, format="PNG")
            results.append(base64.b64encode(buf.getvalue()).decode("ascii"))

        return results


_pipeline = _Pipeline()


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def _log(msg: str) -> None:
    print(f"[inference] {msg}", file=sys.stderr, flush=True)


def _handle(msg: dict) -> dict:  # type: ignore[type-arg]
    msg_id = msg.get("id", "")
    try:
        prompt = (msg.get("prompt") or "").strip()
        if not prompt:
            return {"id": msg_id, "error": "prompt is required"}

        negative_prompt = msg.get("negative_prompt") or DEFAULT_NEGATIVE_PROMPT
        reference_image_b64: Optional[str] = msg.get("reference_image") or None
        seed_raw = msg.get("seed")
        seed = int(seed_raw) if seed_raw else 42

        images = _pipeline.generate(
            prompt=prompt,
            negative_prompt=negative_prompt,
            reference_image_b64=reference_image_b64,
            seed=seed,
        )
        return {"id": msg_id, "images": images}
    except Exception as exc:  # noqa: BLE001
        _log(f"Error handling request {msg_id}: {exc}")
        return {"id": msg_id, "error": str(exc)}


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main() -> None:
    _log("Backend ready, waiting for requests.")
    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError as exc:
            _log(f"JSON parse error: {exc}")
            continue
        response = _handle(msg)
        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
