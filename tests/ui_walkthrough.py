"""
Browser walkthrough of MY STORE (Playwright, Chromium).
Exercises the real UI on desktop, tablet and phone sizes and saves screenshots.

Usage: python3 tests/ui_walkthrough.py http://localhost:3000 ./screenshots
The target database must be empty (first-run setup is performed).
"""
import re
import sys
import os
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
OUT = sys.argv[2] if len(sys.argv) > 2 else "screenshots"
os.makedirs(OUT, exist_ok=True)
problems = []


def shot(page, name):
    page.screenshot(path=f"{OUT}/{name}.png", full_page=True)


def no_hscroll(page, label):
    sw, iw = page.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
    if sw > iw + 1:
        problems.append(f"{label}: horizontal scroll ({sw} > {iw})")


def api(page, method, path, data=None):
    r = page.request.fetch(BASE + path, method=method, data=data, headers={"origin": BASE})
    assert r.ok, f"{method} {path} -> {r.status} {r.text()}"
    return r.json()


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(f"{page.url}: {e}"))
    page.on("console", lambda m: errors.append(f"{page.url}: {m.text}") if m.type == "error" else None)

    # ---- First-run setup
    page.goto(BASE + "/")
    expect(page).to_have_url(re.compile(r"/setup"))
    shot(page, "01-setup-desktop")
    page.fill("#name", "Ada Okafor")
    page.fill("#email", "owner@mystore.test")
    page.fill("#pw", "owner-pass-123")
    page.fill("#pw2", "owner-pass-123")
    page.click("text=Create owner account")
    expect(page).to_have_url(re.compile(r"/dashboard"))
    shot(page, "02-dashboard-empty")

    # ---- Add an item through the form (with quick-add category)
    page.goto(BASE + "/items/new")
    page.fill("#name", "Rice (50kg bag)")
    page.click("button[aria-label='New category']")
    page.fill("#qc-name", "Grains")
    page.click("text=Create category")
    expect(page.locator("#category")).to_have_value(re.compile(r"\d+"))
    page.select_option("#unit", label="Bags (bags)")
    page.fill("#min", "3")
    page.fill("#oq", "10")
    page.fill("#oc", "45000")
    expect(page.get_by_text("Starting balance:")).to_be_visible()
    shot(page, "03-add-item")
    page.click("button:has-text('Add item')")
    expect(page).to_have_url(re.compile(r"/items/[0-9a-f-]{36}$"))
    expect(page.get_by_test_id("item-balance")).to_contain_text("10")

    # Duplicate warning
    page.goto(BASE + "/items/new")
    page.fill("#name", "rice 50kg")
    expect(page.get_by_text("Similar items already exist")).to_be_visible(timeout=5000)
    shot(page, "04-duplicate-warning")

    # ---- More items via API (same session)
    units = {u["symbol"]: u["id"] for u in api(page, "GET", "/api/units")["units"]}
    cats = {}
    for name in ["Beverages", "Baking", "Cleaning", "Oils & Spices"]:
        cats[name] = api(page, "POST", "/api/categories", {"name": name})["category"]["id"]
    sup = api(page, "POST", "/api/suppliers", {"name": "Mile 12 Market Traders", "phone": "0803 000 0000"})["supplier"]["id"]
    api(page, "POST", "/api/suppliers", {"name": "NB Distributors Ltd"})
    import uuid
    def item(name, unit, cat, oq, oc, minl, **kw):
        return api(page, "POST", "/api/items", {"name": name, "unit_id": units[unit], "category_id": cats.get(cat), "opening_quantity": oq,
                                               "opening_unit_cost": oc, "min_stock_level": minl, "request_id": str(uuid.uuid4()), **kw})["id"]
    sugar = item("Granulated sugar", "kg", "Baking", "20", "1000", "5", default_supplier_id=sup)
    coke = item("Coca-Cola 50cl", "btl", "Beverages", "48", "250", "24", allow_fraction=False, conversions=[{"unit_id": units["crates"], "factor": "24"}])
    item("Vegetable oil", "L", "Oils & Spices", "12.5", "1800", "5")
    item("Liquid detergent", "L", "Cleaning", "2", "1500", "4")
    item("Baking flour", "kg", "Baking", "0", "0", "10")
    item("Table water 75cl", "btl", "Beverages", "120", "100", "36", allow_fraction=False)

    # ---- Inventory + Stock Out from a row (dialog)
    page.goto(BASE + "/inventory")
    shot(page, "05-inventory-desktop")
    row = page.locator("li", has_text="Rice (50kg bag)").first
    row.get_by_role("button", name="Stock out Rice (50kg bag)").click()
    dialog = page.get_by_role("dialog")
    expect(dialog.get_by_text("Available now")).to_be_visible()
    dialog.locator("#qty").fill("2.5")
    dialog.get_by_role("radio", name="Kitchen usage").click()
    dialog.locator("#recipient").fill("Main kitchen")
    expect(dialog.get_by_text("7.5").first).to_be_visible()
    shot(page, "06-stockout-dialog-preview")
    dialog.get_by_role("button", name="Review stock out").click()
    expect(dialog.get_by_text("Issue 2.5 bags of Rice (50kg bag)")).to_be_visible()
    shot(page, "07-stockout-confirm")
    dialog.get_by_test_id("confirm-stock").click()
    expect(dialog.get_by_text("Stock issued")).to_be_visible()
    expect(dialog.get_by_text("7.5").first).to_be_visible()
    shot(page, "08-stockout-done")
    page.keyboard.press("Escape")
    page.reload()
    expect(page.locator("li", has_text="Rice (50kg bag)").first).to_contain_text("7.5")

    # ---- Over-issue blocked on the Stock Out page (search flow)
    page.goto(BASE + "/stock-out")
    page.get_by_role("combobox").fill("rice")
    page.get_by_role("option", name=re.compile("Rice")).click()
    page.fill("#qty", "100")
    expect(page.get_by_text("Not enough stock. Only 7.5 bags available.")).to_be_visible()
    expect(page.get_by_role("button", name="Review stock out")).to_be_disabled()
    shot(page, "09-stockout-overissue")

    # ---- Stock In via search, in grams-to-kg conversion check on sugar
    page.goto(BASE + "/stock-in")
    page.get_by_role("combobox").fill("sug")
    page.get_by_role("option", name=re.compile("Granulated sugar")).click()
    page.fill("#qty", "5.5")
    page.fill("#cost", "1200")
    page.fill("#ref", "INV-2231")
    shot(page, "10-stockin-form")
    page.get_by_role("button", name="Review stock in").click()
    page.get_by_test_id("confirm-stock").click()
    expect(page.get_by_text("Stock received")).to_be_visible()
    expect(page.get_by_text("25.5").first).to_be_visible()

    # Stock in 2 crates of Coke (unit conversion)
    page.goto(BASE + f"/stock-in?item={coke}")
    page.fill("#qty", "2")
    page.select_option("#unit", label="crates")
    expect(page.get_by_text("2 crates = 48 btl")).to_be_visible()
    page.get_by_role("button", name="Review stock in").click()
    page.get_by_test_id("confirm-stock").click()
    expect(page.get_by_text("96").first).to_be_visible()

    # Issue 3.25 kg sugar -> 22.25 kg
    page.goto(BASE + f"/stock-out?item={sugar}")
    page.fill("#qty", "3.25")
    page.get_by_role("radio", name="Sale").click()
    page.get_by_role("button", name="Review stock out").click()
    page.get_by_test_id("confirm-stock").click()
    expect(page.get_by_text("22.25").first).to_be_visible()

    # ---- Item page, dashboard, low stock, transactions, reports
    page.goto(BASE + f"/items/{sugar}")
    expect(page.get_by_test_id("item-balance")).to_contain_text("22.25")
    shot(page, "11-item-details")
    page.goto(BASE + "/dashboard")
    shot(page, "12-dashboard-desktop")
    page.goto(BASE + "/low-stock")
    shot(page, "13-low-stock")
    page.goto(BASE + "/transactions")
    shot(page, "14-transactions")
    page.goto(BASE + "/reports")
    expect(page.get_by_test_id("report-period")).to_be_visible()
    shot(page, "15-reports")
    with page.expect_download() as d:
        page.click("a:has-text('PDF')")
    d.value.save_as(f"{OUT}/sample-report.pdf")
    with page.expect_download() as d:
        page.click("a:has-text('Excel (.xlsx)')")
    d.value.save_as(f"{OUT}/sample-report.xlsx")
    page.click("text=Save to Report History")
    expect(page.get_by_text("Report saved")).to_be_visible()
    page.goto(BASE + "/reports/history")
    shot(page, "16-report-history")
    page.goto(BASE + "/settings")
    shot(page, "17-settings")
    page.goto(BASE + "/units")
    shot(page, "18-units")
    page.goto(BASE + "/users")
    shot(page, "19-users")

    # Workers + stock out with worker
    api(page, "POST", "/api/workers", {"name": "Chef Bola", "department": "Kitchen"})
    api(page, "POST", "/api/workers", {"name": "Musa Ibrahim", "department": "Bar"})
    page.goto(BASE + "/workers")
    shot(page, "34-workers")
    page.goto(BASE + f"/stock-out?item={coke}")
    page.fill("#qty", "6")
    page.get_by_role("radio", name="Sale").click()
    page.select_option("#worker", label="Musa Ibrahim (Bar)")
    shot(page, "35-stockout-worker")
    page.get_by_role("button", name="Review stock out").click()
    expect(page.get_by_text("taken by Musa Ibrahim")).to_be_visible()
    page.get_by_test_id("confirm-stock").click()
    expect(page.get_by_text("Stock issued")).to_be_visible()
    page.goto(BASE + f"/stock-out?item={sugar}")
    page.fill("#qty", "2")
    page.get_by_role("radio", name="Kitchen usage").click()
    page.select_option("#worker", label="Chef Bola (Kitchen)")
    page.get_by_role("button", name="Review stock out").click()
    page.get_by_test_id("confirm-stock").click()
    expect(page.get_by_text("Stock issued")).to_be_visible()

    # Staff user + permissions modal
    api(page, "POST", "/api/users", {"name": "Sam Staff", "email": "staff@mystore.test", "role": "staff", "password": "staff-pass-123"})
    page.goto(BASE + "/users")
    page.locator("li", has_text="Sam Staff").get_by_role("button", name="Permissions").click()
    expect(page.get_by_role("dialog")).to_be_visible()
    page.get_by_role("dialog").get_by_text("Record Stock In").click()
    shot(page, "36-permissions")
    page.get_by_role("button", name="Save permissions").click()
    expect(page.get_by_text("Permissions saved")).to_be_visible()

    page.goto(BASE + "/dashboard")
    shot(page, "12-dashboard-desktop")
    page.goto(BASE + "/inventory")
    shot(page, "05-inventory-desktop")
    page.goto(BASE + "/audit")
    shot(page, "37-usage")
    page.goto(BASE + "/audit?tab=changes")
    shot(page, "38-changes")
    page.goto(BASE + "/reports")
    shot(page, "15-reports")
    with page.expect_download() as d:
        page.click("a:has-text('PDF')")
    d.value.save_as(f"{OUT}/sample-report.pdf")
    with page.expect_download() as d:
        page.click("a:has-text('Excel (.xlsx)')")
    d.value.save_as(f"{OUT}/sample-report.xlsx")

    for path in ["/dashboard", "/inventory", "/reports", "/transactions", f"/items/{sugar}", "/audit", "/workers", "/users"]:
        page.goto(BASE + path)
        no_hscroll(page, f"desktop {path}")

    # ---- Tablet
    tab = browser.new_context(viewport={"width": 820, "height": 1180}, storage_state=ctx.storage_state())
    tp = tab.new_page()
    for path, name in [("/dashboard", "20-dashboard-tablet"), ("/inventory", "21-inventory-tablet")]:
        tp.goto(BASE + path)
        no_hscroll(tp, f"tablet {path}")
        shot(tp, name)

    # ---- Small laptop (sidebar visible, narrow content)
    lap = browser.new_context(viewport={"width": 1024, "height": 768}, storage_state=ctx.storage_state())
    lpg = lap.new_page()
    for path in ["/dashboard", "/inventory", "/transactions", "/reports", f"/items/{sugar}", "/low-stock", "/audit"]:
        lpg.goto(BASE + path)
        no_hscroll(lpg, f"1024 {path}")
    lpg.goto(BASE + "/inventory")
    shot(lpg, "21b-inventory-1024")

    # ---- Phone
    phone = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, storage_state=ctx.storage_state())
    pp = phone.new_page()
    for path, name in [("/dashboard", "22-dashboard-phone"), ("/inventory", "23-inventory-phone"), ("/reports", "24-reports-phone"),
                       (f"/items/{sugar}", "25-item-phone"), ("/transactions", "26-transactions-phone"), ("/low-stock", "27-lowstock-phone"),
                       ("/audit", "39-usage-phone"), ("/workers", "40-workers-phone")]:
        pp.goto(BASE + path)
        no_hscroll(pp, f"phone {path}")
        shot(pp, name)
    # Phone stock-out via bottom nav
    pp.goto(BASE + "/dashboard")
    pp.get_by_role("navigation", name="Quick navigation").get_by_role("link", name="Stock Out").click()
    expect(pp).to_have_url(re.compile("/stock-out"))
    pp.get_by_role("combobox").fill("water")
    pp.get_by_role("option", name=re.compile("Table water")).click()
    pp.fill("#qty", "12")
    pp.get_by_role("radio", name="Sale").click()
    no_hscroll(pp, "phone /stock-out form")
    shot(pp, "28-stockout-phone")
    pp.get_by_role("button", name="Review stock out").click()
    pp.get_by_test_id("confirm-stock").click()
    expect(pp.get_by_text("108").first).to_be_visible()
    shot(pp, "29-stockout-done-phone")
    # Phone dialog from inventory card
    pp.goto(BASE + "/inventory")
    pp.get_by_role("button", name="Stock in Vegetable oil").click()
    expect(pp.get_by_role("dialog")).to_be_visible()
    shot(pp, "30-stockin-sheet-phone")
    # Phone menu drawer
    pp.keyboard.press("Escape")
    pp.click("button[aria-label='Open menu']")
    shot(pp, "31-menu-phone")

    # Sign out / login page
    page.goto(BASE + "/dashboard")
    page.get_by_role("button", name="Sign out").click()
    expect(page).to_have_url(re.compile("/login"))
    shot(page, "32-login")
    login_phone = browser.new_context(viewport={"width": 390, "height": 844})
    lp = login_phone.new_page()
    lp.goto(BASE + "/login")
    shot(lp, "33-login-phone")

    browser.close()

real_errors = [e for e in errors if "favicon" not in e]
print("console/page errors:", real_errors or "none")
print("layout problems:", problems or "none")
print("WALKTHROUGH OK" if not problems and not real_errors else "WALKTHROUGH HAS ISSUES")
