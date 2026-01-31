
from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the options page. We assume it's a local file relative to the repo root.
        # Since I'm in /home/jules/verification usually, or root.
        # The file is options.html in the root.
        url = "file://" + os.path.abspath("options.html")
        page.goto(url)

        # Verify title
        assert page.title() == "Smart Dark Mode Options"

        # Verify background color (should be dark)
        bg_color = page.eval_on_selector("body", "e => getComputedStyle(e).backgroundColor")
        print(f"Body background: {bg_color}")
        # #222 is rgb(34, 34, 34)

        # Check for new shortcuts
        content = page.content()
        assert "Shift + X" in content
        assert "Shift + Y" in content
        assert "Shift + &lt;" in content or "Shift + <" in content

        # Take screenshot
        page.screenshot(path="verification/options_screenshot.png")

        browser.close()

if __name__ == "__main__":
    run()
