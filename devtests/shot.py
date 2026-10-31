from playwright.sync_api import sync_playwright
import os
import sys
import time

BASE = os.environ.get("ROUTEY_URL", "http://127.0.0.1:8787")
OUT = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(OUT, exist_ok=True)

logs = []
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page.on("console", lambda msg: logs.append(f"{msg.type}: {msg.text}"))
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
    try:
        page.wait_for_selector(".route-card", timeout=120000)
    except Exception as exc:
        print("WAIT FAILED:", exc)
        page.screenshot(path=os.path.join(OUT, "failed.png"))
        print("BODY:\n", page.locator("body").inner_text()[:3000])
        print("PAGE ERRORS:\n", "\n".join(errors))
        print("CONSOLE:\n", "\n".join(logs[-40:]))
        browser.close()
        sys.exit(1)
    page.wait_for_timeout(5000)
    page.screenshot(path=os.path.join(OUT, "initial.png"))
    print("TITLE:", page.title())
    print("ROUTE CARDS:", page.locator(".route-card").count())
    print("MAP TILES:", page.locator(".leaflet-tile-loaded").count())
    print("BODY TEXT:\n", page.locator("body").inner_text()[:4000])
    print("PAGE ERRORS:\n", "\n".join(errors) if errors else "none")
    print("CONSOLE (last 40):\n", "\n".join(logs[-40:]) if logs else "none")
    browser.close()
