from playwright.sync_api import sync_playwright
import json
import os
import urllib.request

BASE = os.environ.get("ROUTEY_URL", "http://127.0.0.1:8787")
OUT = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(OUT, exist_ok=True)


def post_json(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        BASE + path,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode())


def get_json(path):
    with urllib.request.urlopen(BASE + path, timeout=60) as response:
        return json.loads(response.read().decode())


with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    page = context.new_page()
    errors = []
    console = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.on(
        "console",
        lambda msg: console.append(f"{msg.type}: {msg.text}")
        if msg.type == "error"
        else None,
    )
    page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_selector(".route-card", timeout=120000)
    page.wait_for_timeout(2500)

    # Priority reranking
    print("Initial recommended:", page.locator(".route-card.recommended h3").inner_text())
    page.locator(".priority-presets button", has_text="Time first").click()
    page.wait_for_timeout(3200)
    print("Time-first pill:", page.locator(".ranking-pill").inner_text())
    print("Time-first recommended:", page.locator(".route-card.recommended h3").inner_text())
    print(
        "Time-first recommendation text:",
        page.locator(".route-card.recommended .route-ai-note").inner_text(),
    )
    page.locator(".priority-presets button", has_text="Safety first").click()
    page.wait_for_timeout(3200)
    print("Safety-first recommended:", page.locator(".route-card.recommended h3").inner_text())
    page.screenshot(path=os.path.join(OUT, "priority-changed.png"))

    # Search flow
    page.get_by_role("button", name="Edit points").click()
    page.wait_for_timeout(400)
    searches = page.locator(".place-search")
    origin_input = searches.nth(0).locator("input")
    origin_input.fill("Tokyo Station")
    searches.nth(0).locator(".search-result").first.wait_for(timeout=30000)
    searches.nth(0).locator(".search-result").first.click()
    page.wait_for_timeout(500)
    dest_input = searches.nth(1).locator("input")
    dest_input.fill("Tokyo Skytree")
    searches.nth(1).locator(".search-result").first.wait_for(timeout=30000)
    searches.nth(1).locator(".search-result").first.click()
    page.wait_for_timeout(400)
    page.get_by_role("button", name="Compare routes for these points").click()
    page.wait_for_timeout(500)
    page.wait_for_selector(".loading-overlay", state="detached", timeout=120000)
    page.wait_for_selector(".route-card", timeout=120000)
    page.wait_for_timeout(2500)
    print("Search scenario city:", page.locator(".scenario-place h2").inner_text())
    page.screenshot(path=os.path.join(OUT, "search-tokyo.png"))

    # Map click flow
    page.get_by_role("button", name="Edit points").click()
    page.wait_for_timeout(400)
    print("Search scenario start:", page.locator(".place-search").nth(0).locator("input").input_value())
    print("Search scenario end:", page.locator(".place-search").nth(1).locator("input").input_value())
    page.locator(".pick-button").first.click()
    page.wait_for_selector(".map-pick-banner", timeout=5000)
    page.mouse.click(1000, 500)
    page.wait_for_timeout(2600)
    picked = page.locator(".place-search").nth(0).locator("input").input_value()
    print("Picked start label:", picked)
    page.screenshot(path=os.path.join(OUT, "map-picked.png"))
    page.get_by_role("button", name="Compare routes for these points").click()
    page.wait_for_timeout(500)
    page.wait_for_selector(".loading-overlay", state="detached", timeout=120000)
    page.wait_for_selector(".route-card", timeout=120000)
    page.wait_for_timeout(2000)
    print("Map-pick scenario city:", page.locator(".scenario-place h2").inner_text())

    # Driving + car marker
    page.locator(".route-card").first.get_by_role("button", name="Start driving").click()
    page.wait_for_selector(".driving-panel", timeout=10000)
    page.wait_for_timeout(6000)
    car_count = page.locator(".car-marker-inner").count()
    car_color = (
        page.locator(".car-marker-inner").evaluate(
            "el => getComputedStyle(el).color"
        )
        if car_count
        else None
    )
    car_box = (
        page.locator(".car-marker-inner").first.bounding_box()
        if car_count
        else None
    )
    print("Car marker count:", car_count, "color:", car_color, "box:", car_box)
    print("Drive progress:", page.locator(".drive-progress-labels").first.inner_text())
    print("Drive speed:", page.locator(".speed-dial strong").inner_text())
    page.screenshot(path=os.path.join(OUT, "driving-mid.png"))
    page.get_by_role("button", name="End", exact=True).click()
    page.wait_for_timeout(600)

    # Local AI fallback endpoint
    latest = get_json("/api/scenarios/latest")
    route_id = latest["recommendedRouteId"]
    ai = post_json(
        "/api/ai/explain",
        {
            "scenarioId": latest["scenario"]["id"],
            "routeId": route_id,
            "priority": latest["priority"],
        },
    )
    print("AI fallback enhanced:", ai["explanation"]["enhanced"], "model:", ai["explanation"]["model"])
    print("AI fallback text:", ai["explanation"]["text"][:300])

    print("PAGE ERRORS:", errors if errors else "none")
    print("CONSOLE ERRORS:", console if console else "none")
    context.close()
    browser.close()
