"""Local SenOCR-Vi recognition benchmark; never uploads input images.

Use --prepare to download public model files. Inference loads local files only.
This benchmarks direct OCR recognition, not a layout pipeline or the data pool.
"""
from __future__ import annotations

import argparse
import csv
import gc
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import statistics
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
MODEL_ID = "VietAlphaLabs/SenOCR-Vi"
IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inventory(input_dir):
    paths = sorted(p for p in input_dir.iterdir() if p.suffix.lower() in IMAGE_TYPES and p.is_file())
    if not paths:
        raise ValueError("No supported input images")
    return [{"input_id": f"IN{i:02d}", "filename": p.name,
             "sha256": sha256(p), "bytes": p.stat().st_size}
            for i, p in enumerate(paths, 1)]


def gpu_inventory():
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=index,name,uuid,driver_version,memory.total,memory.used",
             "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=15)
        return {"returncode": result.returncode, "csv": result.stdout.strip()}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"error_type": type(error).__name__}


def prepare(args):
    # No input is read or transmitted during model download.
    from huggingface_hub import HfApi, snapshot_download
    args.model_dir.mkdir(parents=True, exist_ok=True)
    commit = HfApi().model_info(MODEL_ID, revision=args.revision).sha
    snapshot_download(
        repo_id=MODEL_ID, revision=commit, local_dir=str(args.model_dir),
        allow_patterns=["*.json", "*.safetensors", "*.model", "*.txt",
                        "*.jinja", "LICENSE*", "README.md"],
    )
    files = [{"path": str(p.relative_to(args.model_dir)), "bytes": p.stat().st_size,
              "sha256": sha256(p)}
             for p in sorted(args.model_dir.rglob("*"))
             if p.is_file() and ".cache" not in p.relative_to(args.model_dir).parts
             and p.name != "download-manifest.json"]
    write_json(args.model_dir / "download-manifest.json",
               {"repo_id": MODEL_ID, "revision": commit, "files": files})
    print(f"Prepared local model at revision {commit}", flush=True)


class DeviceSampler:
    """Sample whole-device memory; distinct from PyTorch allocator peaks."""
    def __init__(self, interval=0.05):
        self.interval = interval
        self.samples = []
        self.reason = None
        self.nvml = None
        self.stop_event = threading.Event()

    def __enter__(self):
        try:
            # The runner uses cuda:0. Avoid incorrect physical-device accounting.
            if os.environ.get("CUDA_VISIBLE_DEVICES", "0") not in ("", "0"):
                raise RuntimeError("Nondefault CUDA_VISIBLE_DEVICES: NVML sampler disabled")
            import pynvml
            self.nvml = pynvml
            pynvml.nvmlInit()
            self.handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            self.thread = threading.Thread(target=self._sample, daemon=True)
            self.thread.start()
        except Exception as error:
            self.reason = type(error).__name__
            if self.nvml is not None:
                try:
                    self.nvml.nvmlShutdown()
                except Exception:
                    pass
            self.nvml = None
        return self

    def _sample(self):
        while True:
            try:
                self.samples.append(self.nvml.nvmlDeviceGetMemoryInfo(self.handle).used)
            except Exception as error:
                self.reason = type(error).__name__
                break
            if self.stop_event.wait(self.interval):
                break

    def __exit__(self, *unused):
        self.stop_event.set()
        if self.nvml is not None:
            self.thread.join(timeout=5)
            self.nvml.nvmlShutdown()

    def metrics(self):
        return {"device_used_sampled_peak_mib": max(self.samples) / 2**20 if self.samples else None,
                "device_sample_count": len(self.samples),
                "device_sample_interval_s": self.interval,
                "device_sampler_error": self.reason}


def percentile(values, fraction):
    values = sorted(values)
    if not values:
        return None
    position = (len(values) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(values) - 1)
    return values[lower] + (values[upper] - values[lower]) * (position - lower)


def summary_rows(rows):
    good = [r for r in rows if r["status"] == "ok"]
    complete = [r for r in good if not r["token_limit_reached"]]
    def stats(items):
        values = [r["latency_total_s"] for r in items]
        return {"n": len(values), "mean_s": statistics.mean(values) if values else None,
                "median_s": statistics.median(values) if values else None,
                "p95_s": percentile(values, 0.95)}
    return {"attempts": len(rows), "successful_attempts": len(good),
            "oom_attempts": sum(r["status"] == "oom" for r in rows),
            "truncated_attempts": sum(r.get("token_limit_reached", False) for r in good),
            "latency_all_successful": stats(good),
            "latency_without_token_cap": stats(complete),
            "peak_allocated_mib": max((r["peak_allocated_mib"] for r in rows), default=None),
            "peak_reserved_mib": max((r["peak_reserved_mib"] for r in rows), default=None),
            "peak_sampled_device_mib": max(
                (r["device_used_sampled_peak_mib"] for r in rows
                 if r.get("device_used_sampled_peak_mib") is not None), default=None)}


def run_benchmark(args, out, manifest):
    # Set before importing Hugging Face. Model/processor are strictly local.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    import torch
    import transformers
    from PIL import Image, ImageOps
    from transformers import AutoModelForImageTextToText, AutoProcessor

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA unavailable; no silent CPU fallback for a GPU benchmark")
    torch.cuda.set_device(0)
    precision = args.precision
    if precision == "auto":
        precision = "bfloat16" if torch.cuda.is_bf16_supported() else "float16"
    if precision == "bfloat16" and not torch.cuda.is_bf16_supported():
        raise RuntimeError("Selected GPU does not support BF16")
    dtype = getattr(torch, precision)
    torch.manual_seed(0)
    torch.cuda.init()
    torch.cuda.synchronize()
    props = torch.cuda.get_device_properties(0)
    metadata = {"model_id": MODEL_ID, "precision": precision, "batch_size": 1,
                "torch": torch.__version__, "transformers": transformers.__version__,
                "cuda_runtime": torch.version.cuda, "gpu": props.name,
                "gpu_total_mib": props.total_memory / 2**20,
                "compute_capability": list(torch.cuda.get_device_capability(0)),
                "model_dir": str(args.model_dir), "max_pixels": args.max_pixels,
                "min_pixels": args.min_pixels, "max_new_tokens": args.max_new_tokens,
                "prompt": args.prompt, "repeats": args.repeats,
                "mode": "direct_recognition_not_layout_or_pool",
                "precision_accuracy_validated": False,
                "latency_includes": "image open, EXIF transpose, processor, host-to-device, generation, decode",
                "latency_excludes": "model load, warmup, output disk write, inter-image cleanup",
                "nvml_note": "Whole GPU incl. other processes, sampled, not exact process peak; WDDM may limit counters"}
    model_manifest = args.model_dir / "download-manifest.json"
    metadata["model_manifest"] = json.loads(model_manifest.read_text(encoding="utf-8")) if model_manifest.exists() else None
    write_json(out / "environment.json", metadata)
    with (out / "packages.txt").open("w", encoding="utf-8") as stream:
        subprocess.run([sys.executable, "-m", "pip", "freeze"], stdout=stream, check=True)

    started = time.perf_counter()
    torch.cuda.reset_peak_memory_stats()
    try:
        with DeviceSampler() as load_sampler:
            model = AutoModelForImageTextToText.from_pretrained(
                str(args.model_dir), dtype=dtype, local_files_only=True,
                trust_remote_code=False, attn_implementation="sdpa",
            ).to("cuda:0").eval()
            processor = AutoProcessor.from_pretrained(
                str(args.model_dir), local_files_only=True, trust_remote_code=False)
            torch.cuda.synchronize()
    except Exception as error:
        write_json(out / "load_failure.json", {"error_type": type(error).__name__,
                   "elapsed_s": time.perf_counter() - started,
                   "peak_allocated_mib": torch.cuda.max_memory_allocated() / 2**20,
                   "peak_reserved_mib": torch.cuda.max_memory_reserved() / 2**20})
        raise
    metadata.update({"load_s": time.perf_counter() - started,
                     "load_peak_allocated_mib": torch.cuda.max_memory_allocated() / 2**20,
                     "load_peak_reserved_mib": torch.cuda.max_memory_reserved() / 2**20,
                     "loaded_allocated_mib": torch.cuda.memory_allocated() / 2**20,
                     "parameters": sum(p.numel() for p in model.parameters()),
                     "load_device_sampling": load_sampler.metrics(),
                     "image_processor_class": type(processor.image_processor).__name__})
    write_json(out / "environment.json", metadata)

    def infer(item, token_cap):
        torch.cuda.synchronize()
        torch.cuda.reset_peak_memory_stats()
        with DeviceSampler() as sampler:
            t0 = time.perf_counter()
            with Image.open(args.input_dir / item["filename"]) as source:
                original_size = source.size
                image = ImageOps.exif_transpose(source).convert("RGB")
            messages = [{"role": "user", "content": [
                {"type": "image", "image": image}, {"type": "text", "text": args.prompt}]}]
            inputs = processor.apply_chat_template(
                messages, add_generation_prompt=True, tokenize=True,
                return_dict=True, return_tensors="pt",
                min_pixels=args.min_pixels, max_pixels=args.max_pixels,
            )
            t1 = time.perf_counter()
            inputs = {key: (value.to(device="cuda:0", dtype=dtype) if value.is_floating_point()
                            else value.to("cuda:0")) for key, value in inputs.items()}
            torch.cuda.synchronize()
            t2 = time.perf_counter()
            with torch.inference_mode():
                output = model.generate(**inputs, do_sample=False, max_new_tokens=token_cap)
            torch.cuda.synchronize()
            t3 = time.perf_counter()
            generated = output[0, inputs["input_ids"].shape[-1]:].tolist()
            text = processor.decode(generated, skip_special_tokens=True)
            t4 = time.perf_counter()
            eos = model.generation_config.eos_token_id
            eos_ids = eos if isinstance(eos, list) else [eos]
            limited = len(generated) >= token_cap and (not generated or generated[-1] not in eos_ids)
            row = {"status": "ok", "original_width": original_size[0],
                   "original_height": original_size[1], "exif_width": image.width,
                   "exif_height": image.height,
                   "image_grid_thw": inputs["image_grid_thw"].tolist() if "image_grid_thw" in inputs else None,
                   "input_tokens": inputs["input_ids"].shape[-1],
                   "generated_tokens_including_eos": len(generated),
                   "output_characters": len(text), "token_limit_reached": limited,
                   "latency_preprocess_s": t1 - t0, "latency_transfer_s": t2 - t1,
                   "latency_generate_s": t3 - t2, "latency_decode_s": t4 - t3,
                   "latency_total_s": t4 - t0,
                   "generation_tokens_per_s": len(generated) / (t3 - t2),
                   "peak_allocated_mib": torch.cuda.max_memory_allocated() / 2**20,
                   "peak_reserved_mib": torch.cuda.max_memory_reserved() / 2**20}
            del inputs, output
        row.update(sampler.metrics())
        return row, text

    # Short warmup is excluded from per-image latency; it is not a full-page pass.
    print(f"Loaded model; GPU={props.name}; precision={precision}; warmup=32 tokens", flush=True)
    try:
        warmup, unused_text = infer(manifest[0], min(32, args.max_new_tokens))
        write_json(out / "warmup.json", warmup)
        del unused_text
    except Exception as error:
        write_json(out / "warmup.json", {"status": "failed", "error_type": type(error).__name__})
    gc.collect()
    torch.cuda.empty_cache()
    rows = []
    for repeat in range(1, args.repeats + 1):
        for item in manifest:
            base = {"input_id": item["input_id"], "repeat": repeat, "sha256": item["sha256"]}
            started = time.perf_counter()
            try:
                row, text = infer(item, args.max_new_tokens)
                row.update(base)
                (out / "ocr" / f"{item['input_id']}.r{repeat}.txt").write_text(text, encoding="utf-8")
                del text
            except Exception as error:
                row = dict(base, status="oom" if isinstance(error, torch.OutOfMemoryError) else "error",
                           error_type=type(error).__name__, elapsed_until_error_s=time.perf_counter() - started,
                           peak_allocated_mib=torch.cuda.max_memory_allocated() / 2**20,
                           peak_reserved_mib=torch.cuda.max_memory_reserved() / 2**20)
                # Detailed errors remain local and never print recognized medical content.
                (out / "errors" / f"{item['input_id']}.r{repeat}.txt").write_text(str(error), encoding="utf-8")
            rows.append(row)
            with (out / "metrics.jsonl").open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(row, ensure_ascii=False) + "\n")
            print(f"{item['input_id']} repeat={repeat}: {row['status']} "
                  f"seconds={row.get('latency_total_s', row.get('elapsed_until_error_s')):.3f}", flush=True)
            gc.collect()
            torch.cuda.empty_cache()
            write_json(out / "summary.json", summary_rows(rows))

    columns = sorted({key for row in rows for key in row})
    with (out / "metrics.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    summary = summary_rows(rows)
    write_json(out / "summary.json", summary)
    print(json.dumps(summary, indent=2), flush=True)
    return 0 if summary["successful_attempts"] == len(rows) else 2


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare", action="store_true", help="Download public model files only")
    parser.add_argument("--preflight", action="store_true", help="Inventory only; no third-party dependencies needed")
    parser.add_argument("--revision", default="main", help="Resolved to a commit SHA at download time")
    parser.add_argument("--model-dir", type=Path, default=ROOT / "models" / "SenOCR-Vi")
    parser.add_argument("--input-dir", type=Path, default=ROOT / "examples" / "inputs")
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--precision", choices=["auto", "bfloat16", "float16", "float32"], default="auto")
    parser.add_argument("--max-pixels", type=int, default=1024 * 1024)
    parser.add_argument("--min-pixels", type=int, default=384 * 384)
    parser.add_argument("--max-new-tokens", type=int, default=2048)
    parser.add_argument("--repeats", type=int, default=1)
    parser.add_argument("--prompt", choices=["OCR:", "Table Recognition:"], default="OCR:")
    args = parser.parse_args()
    if args.repeats < 1 or args.max_new_tokens < 1 or not 0 < args.min_pixels <= args.max_pixels:
        parser.error("Invalid repeats, token cap, or pixel limits")
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ.setdefault("HF_HOME", str(ROOT / ".cache" / "huggingface"))
    if args.prepare:
        prepare(args)
        return 0
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    out = args.output_dir or ROOT / "research" / "senocr-vi" / ("preflight-" + stamp if args.preflight else "run-" + stamp)
    out.mkdir(parents=True, exist_ok=False)
    manifest = inventory(args.input_dir)
    write_json(out / "inputs.json", manifest)
    report = {"created_utc": stamp, "python": sys.version, "platform": platform.platform(),
              "gpu": gpu_inventory(), "input_count": len(manifest),
              "dependencies": {m: importlib.util.find_spec(m) is not None
                               for m in ["torch", "transformers", "PIL", "huggingface_hub", "pynvml"]},
              "model_present": any(args.model_dir.glob("*.safetensors")),
              "inference_executed": False}
    write_json(out / "preflight.json", report)
    if args.preflight:
        print(json.dumps(report, indent=2))
        print(f"Saved preflight: {out}")
        return 0
    (out / "ocr").mkdir()
    (out / "errors").mkdir()
    try:
        result = run_benchmark(args, out, manifest)
        write_json(out / "run-status.json", {"status": "completed" if result == 0 else "completed_with_errors",
                                            "exit_code": result})
        return result
    except Exception as error:
        write_json(out / "run-status.json", {"status": "failed_before_completion",
                   "error_type": type(error).__name__, "message": str(error)})
        print(f"Benchmark could not complete: {type(error).__name__}. Details saved locally at {out}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
