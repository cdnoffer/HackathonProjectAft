from playwright.sync_api import sync_playwright
import os
import sys

BASE = os.environ.get("ROUTEY_URL", "http://127.0.0.1:8787")
OUT = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(OUT, exist_ok=True)


def attach(page, errors, logs):
    page.on("console", lambda msg: logs.append(f"{msg.type}: {msg.text}") if msg.type in ("error", "warning") else None)
    page.on("pageerror", lambda exc: errors.append(str(exc)))


def wait_for_app(page):
    page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_selector(".route-card", timeout=120000)
    page.wait_for_timeout(4500)


with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)

    # Light theme home
    context = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page = context.new_page()
    errors, logs = [], []
    attach(page, errors, logs)
    wait_for_app(page)
    page.screenshot(path=os.path.join(OUT, "home-light.png"))
    print("LIGHT route cards:", page.locator(".route-card").count())
    print("LIGHT tiles:", page.locator(".leaflet-tile-loaded").count())
    print("LIGHT theme:", page.evaluate("document.documentElement.dataset.theme"))
    print("LIGHT body excerpt:\n", page.locator(".sidebar").inner_text()[:2500])

    # Search panel
    page.get_by_role("button", name="Edit points").click()
    page.wait_for_timeout(500)
    page.screenshot(path=os.path.join(OUT, "search-expanded.png"))
    page.get_by_role("button", name="Hide").click()

    # Route details
    page.locator(".route-card").first.get_by_role("button", name="Details").click()
    page.wait_for_selector(".modal")
    page.wait_for_timeout(700)
    page.screenshot(path=os.path.join(OUT, "details.png"))
    print("DETAILS modal text excerpt:\n", page.locator(".modal").inner_text()[:1800])
    page.locator(".modal-head .icon-button").click()
    page.wait_for_timeout(400)

    # Driving
    page.locator(".route-card").first.get_by_role("button", name="Start driving").click()
    page.wait_for_selector(".driving-panel", timeout=10000)
    page.wait_for_timeout(4500)
    page.screenshot(path=os.path.join(OUT, "driving.png"))
    print("DRIVING text excerpt:\n", page.locator(".driving-panel").inner_text()[:1600])
    page.locator(".driving-head .icon-button").click()
    page.wait_for_timeout(500)

    # Simulation lab
    page.locator('.map-actions button[aria-label="Open Simulation Lab"]').click()
    page.wait_for_selector(".modal")
    page.wait_for_timeout(500)
    page.screenshot(path=os.path.join(OUT, "lab-idle.png"))
    lab = page.locator(".modal")
    lab.get_by_role("button", name="Run simulation test").click()
    page.wait_for_timeout(1500)
    page.screenshot(path=os.path.join(OUT, "lab-running.png"))
    try:
        page.wait_for_selector(".lab-verdict", timeout=180000)
    except Exception as exc:
        print("LAB WAIT FAILED:", exc)
    page.wait_for_timeout(800)
    page.screenshot(path=os.path.join(OUT, "lab-complete.png"))
    print("LAB text excerpt:\n", page.locator(".modal").inner_text()[:2600])
    page.locator(".modal-head .icon-button").click()
    page.wait_for_timeout(500)

    print("LIGHT page errors:", errors if errors else "none")
    print("LIGHT console:", logs[-30:] if logs else "none")
    context.close()

    # Dark theme home
    dark_context = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    dark_context.add_init_script("localStorage.setItem('routey.theme','dark')")
    dark_page = dark_context.new_page()
    dark_errors, dark_logs = [], []
    attach(dark_page, dark_errors, dark_logs)
    wait_for_app(dark_page)
    dark_page.screenshot(path=os.path.join(OUT, "home-dark.png"))
    print("DARK route cards:", dark_page.locator(".route-card").count())
    print("DARK tiles:", dark_page.locator(".leaflet-tile-loaded").count())
    print("DARK theme:", dark_page.evaluate("document.documentElement.dataset.theme"))
    dark_page.locator(".route-card").first.get_by_role("button", name="Details").click()
    dark_page.wait_for_selector(".modal")
    dark_page.wait_for_timeout(700)
    dark_page.screenshot(path=os.path.join(OUT, "details-dark.png"))
    print("DARK page errors:", dark_errors if dark_errors else "none")
    print("DARK console:", dark_logs[-20:] if dark_logs else "none")
    dark_context.close()

    browser.close()

if errors:
    sys.exit(1)
