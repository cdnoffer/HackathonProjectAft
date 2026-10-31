"""Routey browser end-to-end test.

Run with:
    bun run build
    bun run test:e2e

If ROUTEY_URL is not set, the script starts a temporary Bun server on port
8799 with a throw-away SQLite database, runs the tests, and shuts it down.
Requires Microsoft Edge and `uv` (the Playwright package is supplied by uv).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "devtests" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get("ROUTEY_URL", "").rstrip("/")
PORT = int(os.environ.get("ROUTEY_E2E_PORT", "8799"))
server: subprocess.Popen | None = None
temp_dir: str | None = None


def wait_for_health(base: str, timeout: float = 45.0) -> None:
    deadline = time.time() + timeout
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(base + "/api/health", timeout=3) as response:
                data = json.loads(response.read().decode())
                if data.get("ok"):
                    return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(0.5)
    raise RuntimeError(f"Routey server did not become healthy: {last_error}")


def start_server() -> str:
    global server, temp_dir
    bun = shutil.which("bun")
    if not bun:
        raise RuntimeError("Bun is not on PATH")
    print("Building current frontend…")
    subprocess.run([bun, "run", "build"], cwd=ROOT, check=True)
    temp_dir = tempfile.mkdtemp(prefix="routey-e2e-")
    env = os.environ.copy()
    env["PORT"] = str(PORT)
    env["ROUTEY_DB"] = str(Path(temp_dir) / "routey-e2e.db")
    env["NODE_ENV"] = "production"
    log_path = Path(temp_dir) / "server.log"
    log_file = log_path.open("w", encoding="utf-8")
    server = subprocess.Popen(
        [bun, "server/index.ts"],
        cwd=ROOT,
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
    )
    base = f"http://127.0.0.1:{PORT}"
    try:
        wait_for_health(base)
    except Exception:
        log_file.flush()
        print(log_path.read_text(encoding="utf-8", errors="replace"))
        raise
    print(f"Temporary Routey server ready on {base}")
    return base


def stop_server() -> None:
    global server, temp_dir
    if server is not None:
        server.terminate()
        try:
            server.wait(timeout=8)
        except subprocess.TimeoutExpired:
            server.kill()
        server = None
    if temp_dir:
        for _ in range(6):
            try:
                shutil.rmtree(temp_dir, ignore_errors=False)
                break
            except OSError:
                time.sleep(0.4)
        temp_dir = None


def main() -> int:
    base = BASE or start_server()
    errors: list[str] = []
    console_errors: list[str] = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="msedge", headless=True)
            context = browser.new_context(
                viewport={"width": 1440, "height": 900}, device_scale_factor=1
            )
            page = context.new_page()
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            page.on(
                "console",
                lambda msg: console_errors.append(msg.text)
                if msg.type == "error"
                else None,
            )
            page.goto(base, wait_until="domcontentloaded", timeout=60_000)
            page.wait_for_selector(".route-card", timeout=120_000)
            page.wait_for_timeout(3_000)
            assert page.locator(".route-card").count() >= 1, "no routes rendered"
            assert (
                page.locator(".route-card").first.locator(".recommended-ribbon").count()
                == 1
            ), "recommended route is not sorted first"
            assert page.locator(".leaflet-tile-loaded").count() > 0, "no map tiles"
            assert page.locator(".map-canvas").is_visible(), "map is not visible"
            first_city = page.locator(".scenario-place h2").inner_text()
            page.screenshot(path=str(OUT / "e2e-home.png"))

            # Random scenario must pick a different place.
            page.get_by_role("button", name="New random scenario").click()
            page.wait_for_timeout(500)
            page.wait_for_selector(".loading-overlay", state="detached", timeout=120_000)
            page.wait_for_selector(".route-card", timeout=120_000)
            page.wait_for_timeout(2_000)
            second_city = page.locator(".scenario-place h2").inner_text()
            assert first_city != second_city, (
                f"random scenario reused the same city: {first_city}"
            )

            # Priority must re-rank without breaking the UI.
            page.locator(".priority-presets button", has_text="Time first").click()
            page.wait_for_timeout(3_200)
            assert "Time first" in page.locator(".ranking-pill").inner_text()

            # Search panel exposes both point pickers.
            page.get_by_role("button", name="Edit points").click()
            page.wait_for_timeout(300)
            assert page.locator(".place-search").count() == 2, "search pickers missing"
            page.get_by_role("button", name="Hide").click()

            # Details modal.
            page.locator(".route-card").first.get_by_role("button", name="Details").click()
            page.wait_for_selector(".modal", timeout=10_000)
            modal_text = page.locator(".modal").inner_text()
            assert "Routey AI reasoning" in modal_text
            assert "Risk factors" in modal_text
            page.screenshot(path=str(OUT / "e2e-details.png"))
            page.locator(".modal-head .icon-button").click()
            page.wait_for_timeout(300)

            # Driving simulation and arrival.
            page.locator(".route-card").first.get_by_role("button", name="Start driving").click()
            page.wait_for_selector(".driving-panel", timeout=10_000)
            page.wait_for_timeout(3_000)
            assert page.locator(".car-marker-inner").count() == 1, "car marker missing"
            speed_button = page.get_by_role("button", name="4×")
            if speed_button.count():
                speed_button.click()
            try:
                page.wait_for_selector(".arrival-card", timeout=32_000)
                assert "You arrived" in page.locator(".arrival-card").inner_text()
                page.screenshot(path=str(OUT / "e2e-arrival.png"))
                page.get_by_role("button", name="Back to routes").click()
            except Exception:
                page.get_by_role("button", name="End", exact=True).click()
            page.wait_for_timeout(500)

            # Backend Simulation Lab.
            page.locator('.map-actions button[aria-label="Open Simulation Lab"]').click()
            page.wait_for_selector(".modal", timeout=10_000)
            page.locator(".modal").get_by_role(
                "button", name="Run simulation test"
            ).click()
            page.wait_for_selector(".lab-verdict", timeout=180_000)
            lab_text = page.locator(".modal").inner_text()
            assert "All uniqueness checks passed" in lab_text, lab_text[:1500]
            page.screenshot(path=str(OUT / "e2e-lab.png"))
            page.locator(".modal-head .icon-button").click()
            page.wait_for_timeout(300)

            assert not errors, f"page errors: {errors}"
            if console_errors:
                print("Console errors:", console_errors[-10:])
            context.close()
            browser.close()
        print("Browser E2E passed.")
        print(f"Screenshots: {OUT}")
        return 0
    finally:
        stop_server()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"E2E assertion failed: {exc}")
        raise
