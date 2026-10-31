"""Smoke-test every page and render the README images.

    python tools/serve.py 8090           # in another terminal
    python tools/shots.py [http://127.0.0.1:8090/]

Fails on any console error. Writes docs/readme/*.png, docs/og.png and docs/icon-192.png.
Uses Playwright with the installed Chrome.
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8090/").rstrip("/") + "/"
OUT = ROOT / "docs" / "readme"; OUT.mkdir(parents=True, exist_ok=True)
errors = []

with sync_playwright() as p:
    try: browser = p.chromium.launch(channel="chrome")
    except Exception: browser = p.chromium.launch()

    def page(**kw):
        pg = browser.new_page(**kw)
        pg.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(m.text))
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("response", lambda r: r.status >= 400 and not r.url.endswith("favicon.ico") and errors.append(f"{r.status} {r.url}"))
        return pg

    pg = page(viewport={"width": 1280, "height": 640})
    pg.goto(URL + "readme/banner.html", wait_until="networkidle"); pg.wait_for_timeout(400)
    pg.screenshot(path=str(OUT / "banner.png")); pg.screenshot(path=str(ROOT / "docs" / "og.png"))
    pg.set_viewport_size({"width": 192, "height": 192})
    pg.set_content(f"<body style='margin:0;background:transparent'><img src='{URL}icon.svg' width=192 height=192>"); pg.wait_for_timeout(300)
    pg.screenshot(path=str(ROOT / "docs" / "icon-192.png"), omit_background=True)
    pg.close()

    pg = page(viewport={"width": 1440, "height": 900})
    pg.goto(URL, wait_until="networkidle"); pg.wait_for_selector("#gate")
    pg.screenshot(path=str(OUT / "gate.png"))
    pg.click("#enter"); pg.wait_for_selector(".grid .card"); pg.wait_for_timeout(300)
    pg.screenshot(path=str(OUT / "home.png"))

    pg.goto(URL + "#/watch/blocks"); pg.wait_for_selector(".player"); pg.click(".bigplay")
    for k in ["ArrowLeft", "ArrowUp", "ArrowDown", "ArrowRight", "ArrowRight"] * 6: pg.keyboard.press(k); pg.wait_for_timeout(120)
    pg.wait_for_timeout(1500)
    pg.screenshot(path=str(OUT / "watch.png"))

    pg.goto(URL + "#/watch/ifthen"); pg.wait_for_selector(".plan")
    pg.fill("input[name=cue]", "it is after 23:00 and I am in bed with my phone")
    pg.fill("input[name=act]", "I put it on the charger in the kitchen")
    pg.click(".plan button"); pg.wait_for_selector(".saved:not(:empty)")

    pg.goto(URL + "#/watch/testo"); pg.wait_for_selector(".player")
    pg.evaluate("document.querySelector('.bigplay').click()")
    pg.wait_for_timeout(200)
    pg.goto(URL + "#/search?q=hot+singles+near+me"); pg.wait_for_selector(".noresults")
    pg.screenshot(path=str(OUT / "search.png"))
    pg.goto(URL + "#/research"); pg.wait_for_selector(".research table")
    pg.screenshot(path=str(OUT / "research.png"))
    pg.goto(URL + "#/categories"); pg.wait_for_selector(".cats .cat")
    pg.goto(URL + "#/videos?s=evidence"); pg.wait_for_selector(".grid .card")
    pg.goto(URL + "#/streak"); pg.wait_for_selector(".cal")
    pg.screenshot(path=str(OUT / "streak.png"))
    sw = pg.evaluate("document.documentElement.scrollWidth"); assert sw <= 1440, sw
    pg.close()

    m = page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    m.goto(URL, wait_until="networkidle"); m.click("#enter"); m.wait_for_selector(".grid .card"); m.wait_for_timeout(300)
    m.screenshot(path=str(OUT / "mobile.png"))
    sw = m.evaluate("document.documentElement.scrollWidth"); assert sw <= 390, f"mobile horizontal scroll {sw}"
    m.goto(URL + "#/watch/pushups"); m.wait_for_selector(".player"); m.click(".bigplay"); m.click(".ui .btn"); m.wait_for_timeout(400)
    m.screenshot(path=str(OUT / "mobile-watch.png"))
    sw = m.evaluate("document.documentElement.scrollWidth"); assert sw <= 390, f"mobile watch horizontal scroll {sw}"
    browser.close()

if errors: print("CONSOLE ERRORS:\n" + "\n".join(errors)); sys.exit(1)
print("ok, images in", OUT)
