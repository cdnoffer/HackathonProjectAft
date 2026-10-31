from playwright.sync_api import sync_playwright
import os

BASE = os.environ.get("ROUTEY_URL", "http://127.0.0.1:8787")
OUT = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)

    page = browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_selector(".route-card", timeout=120000)
    page.wait_for_timeout(2500)
    page.locator('.map-actions button[aria-label="Open settings"]').click()
    page.wait_for_selector(".modal", timeout=10000)
    page.wait_for_timeout(600)
    page.screenshot(path=os.path.join(OUT, "settings.png"))
    print("SETTINGS:", page.locator(".modal").inner_text()[:1200])
    page.locator(".modal-head .icon-button").click()
    page.wait_for_timeout(300)
    page.get_by_role("button", name="How Routey decides").click()
    page.wait_for_selector(".modal", timeout=10000)
    page.wait_for_timeout(600)
    page.screenshot(path=os.path.join(OUT, "methodology.png"))
    print("METHODOLOGY:", page.locator(".modal").inner_text()[:900])
    page.locator(".modal-head .icon-button").click()
    page.close()

    mobile = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    mobile_errors = []
    mobile.on("pageerror", lambda exc: mobile_errors.append(str(exc)))
    mobile.goto(BASE, wait_until="domcontentloaded", timeout=60000)
    mobile.wait_for_selector(".route-card", timeout=120000)
    mobile.wait_for_timeout(2500)
    mobile.screenshot(path=os.path.join(OUT, "mobile.png"))
    print("MOBILE sidebar visible:", mobile.locator(".sidebar").is_visible())
    print("MOBILE route cards:", mobile.locator(".route-card").count())
    print("MOBILE tiles:", mobile.locator(".leaflet-tile-loaded").count())
    print("MOBILE body excerpt:", mobile.locator(".sidebar").inner_text()[:1000])
    print("MOBILE errors:", mobile_errors or "none")
    print("DESKTOP errors:", errors or "none")
    browser.close()
