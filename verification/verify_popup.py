
from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the popup page
        url = "file://" + os.path.abspath("popup.html")
        page.goto(url)

        # Verify content
        content = page.content()
        assert "Shift + X" in content
        assert "Shift + Y" in content
        assert "Shift + &lt;" in content or "Shift + <" in content

        # Verify switch exists
        assert page.locator(".switch").count() > 0

        # Take screenshot
        page.screenshot(path="verification/popup_screenshot.png")

        browser.close()

if __name__ == "__main__":
    run()
