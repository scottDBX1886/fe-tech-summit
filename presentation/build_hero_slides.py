#!/usr/bin/env python3
"""Rebuild the Sentinel deck's hero slides as polished card layouts.

Imports the google-slides builder primitives and lays out BLANK slides with
custom rounded-rectangle cards, accent bars, and brand-colored typography —
the pattern the skill recommends over placeholder layouts for KPI/icon cards.
"""
import sys
sys.path.insert(0, "/Users/scott.johnson/.vibe/marketplace/plugins/fe-google-tools/skills/google-slides/resources")

import gslides_builder as gb

PRES_ID = "1yj4iIxbMHGiesYhFJN32tXJ5OO0cXa1X5m3OuAPEMJc"
C = gb.DATABRICKS_COLORS
SLIDE_W = 13.333


def hex_rgb(key):
    return C[key]


def batch(reqs):
    r = gb.batch_update(PRES_ID, reqs)
    if "error" in r:
        print("ERROR:", r["error"])
        sys.exit(1)
    return r


def new_blank(index):
    # Use the template's branded blank layout (p82) so the Databricks footer/logo carry over.
    res = gb.add_slide(PRES_ID, layout_id="p82", insertion_index=index)
    return res["pageId"]


def title_block(page, title, kicker=None):
    """Kicker (small teal caps) + big dark-teal title + red accent bar."""
    if kicker:
        gb.create_text_box(PRES_ID, page, kicker.upper(), 0.7, 0.55, 11.9, 0.4,
                           font_size=13, bold=True, font_color=hex_rgb("teal"))
    gb.create_text_box(PRES_ID, page, title, 0.7, 0.95, 11.9, 0.9,
                       font_size=32, bold=True, font_color=hex_rgb("dark_teal"))
    bar = gb.create_shape(PRES_ID, page, "RECTANGLE", 0.72, 1.85, 1.1, 0.09)["shapeId"]
    gb.update_shape_properties(PRES_ID, bar, fill_color=hex_rgb("red"))
    batch([{"updateShapeProperties": {"objectId": bar, "shapeProperties": {"outline": {"propertyState": "NOT_RENDERED"}}, "fields": "outline"}}])


def align_center(shape_id):
    return {"updateParagraphStyle": {"objectId": shape_id, "textRange": {"type": "ALL"},
                                     "style": {"alignment": "CENTER"}, "fields": "alignment"}}


def card(page, x, y, w, h, fill="light_gray", outline=None):
    sid = gb.create_shape(PRES_ID, page, "ROUND_RECTANGLE", x, y, w, h)["shapeId"]
    gb.update_shape_properties(PRES_ID, sid, fill_color=hex_rgb(fill))
    props = {"outline": {"propertyState": "NOT_RENDERED"}}
    if outline:
        props = {"outline": {"outlineFill": {"solidFill": {"color": {"rgbColor": hex_rgb(outline)}}}, "weight": {"magnitude": 1.5, "unit": "PT"}}}
    batch([{"updateShapeProperties": {"objectId": sid, "shapeProperties": props, "fields": "outline"}}])
    return sid


def styled_text(page, segments, x, y, w, h, align=True):
    """segments: list of (text, font_size, bold, color_key). Rendered as stacked lines."""
    full = "".join(s[0] for s in segments)
    tid = gb.create_text_box(PRES_ID, page, full, x, y, w, h, font_size=segments[0][1])["textBoxId"]
    reqs = []
    idx = 0
    for text, fs, bold, color in segments:
        end = idx + len(text)
        reqs.append({"updateTextStyle": {"objectId": tid, "textRange": {"type": "FIXED_RANGE", "startIndex": idx, "endIndex": end},
                                          "style": {"fontSize": {"magnitude": fs, "unit": "PT"}, "bold": bold,
                                                    "foregroundColor": {"opaqueColor": {"rgbColor": hex_rgb(color)}}},
                                          "fields": "fontSize,bold,foregroundColor"}})
        idx = end
    if align:
        reqs.append(align_center(tid))
    batch(reqs)
    return tid


# ============================================================================
# SLIDE 4 — THE PROBLEM (KPI cards)
# ============================================================================
def build_problem():
    old = "obj_5540d826c615"
    idx = gb.get_slide_ids(PRES_ID).index(old)
    gb.delete_slide(PRES_ID, old)
    page = new_blank(idx)

    title_block(page, "Priya's Problem, In Her Words", kicker="The Problem")
    gb.create_text_box(PRES_ID, page,
                       "A cross-agency fraud-match feed + an eligibility refresh landed ~3 weeks ago — surfacing a spike of high-risk pre-disbursement payments.",
                       0.7, 2.05, 11.9, 0.6, font_size=15, font_color=hex_rgb("muted_teal"))

    # Four KPI cards
    kpis = [
        ("397", "payments flagged", "TANF · SNAP · Child Care\nDisability · Veteran's"),
        ("$361K", "exposure at risk", "if released without review\n~$12M+ at production scale"),
        ("~5% → 30%", "flagged-rate spike", "in the last three weeks"),
        ("50/day", "examiner capacity", "the queue wins without\nprioritization"),
    ]
    cw, gap, y, ch = 2.78, 0.24, 2.75, 2.55
    x0 = (SLIDE_W - (4 * cw + 3 * gap)) / 2
    for i, (big, label, sub) in enumerate(kpis):
        x = x0 + i * (cw + gap)
        card(page, x, y, cw, ch, fill="light_gray")
        styled_text(page, [(big, 30, True, "red")], x, y + 0.32, cw, 0.7)
        styled_text(page, [(label, 14, True, "dark_teal")], x, y + 1.05, cw, 0.4)
        styled_text(page, [(sub, 11.5, False, "muted_teal")], x, y + 1.5, cw, 0.9)

    # Punchline strip
    strip = card(page, x0, y + ch + 0.35, 4 * cw + 3 * gap, 0.85, fill="dark_teal")
    styled_text(page, [("The model can't rank PAY-0000214 without governed context — ", 16, False, "white"),
                       ("intelligence isn't the limit, context is.", 16, True, "white")],
                x0, y + ch + 0.58, 4 * cw + 3 * gap, 0.5)
    print("problem slide rebuilt:", page)


# ============================================================================
# SLIDE 8 — BUSINESS VALUE (pure $ impact, per feedback)
# ============================================================================
def build_business_value():
    old = "obj_42bdb83a4b5c"
    idx = gb.get_slide_ids(PRES_ID).index(old)
    gb.delete_slide(PRES_ID, old)
    page = new_blank(idx)

    title_block(page, "Business Value", kicker="Outcomes, in dollars")

    # Three outcome cards — every line a $/throughput impact, no feature-speak
    cards = [
        ("Dollars recovered", "$92.6K", "projected recovery across the\ncurrent flagged queue, ranked\nhighest-value-first"),
        ("Exposure avoided", "$361K", "improper-payment exposure\nsurfaced before funds disburse\n(~$12M+ at production scale)"),
        ("Throughput gained", "397 / day", "flagged payments triaged vs. a\n50/day manual ceiling — an\n~8x lift in review capacity"),
    ]
    cw, gap, y, ch = 3.75, 0.35, 2.6, 3.3
    x0 = (SLIDE_W - (3 * cw + 2 * gap)) / 2
    for i, (head, big, sub) in enumerate(cards):
        x = x0 + i * (cw + gap)
        card(page, x, y, cw, ch, fill="light_gray")
        top = gb.create_shape(PRES_ID, page, "RECTANGLE", x, y, cw, 0.12)["shapeId"]
        gb.update_shape_properties(PRES_ID, top, fill_color=hex_rgb("red"))
        batch([{"updateShapeProperties": {"objectId": top, "shapeProperties": {"outline": {"propertyState": "NOT_RENDERED"}}, "fields": "outline"}}])
        styled_text(page, [(head, 15, True, "teal")], x, y + 0.42, cw, 0.4)
        styled_text(page, [(big, 34, True, "dark_teal")], x, y + 1.0, cw, 0.8)
        styled_text(page, [(sub, 13, False, "muted_teal")], x, y + 1.95, cw, 1.1)
    print("business value slide rebuilt:", page)


# ============================================================================
# NEW SLIDE — WHY LAKEBASE + A SYNC (resolves the anticipated question)
# ============================================================================
def build_lakebase():
    # Insert right after "Why Databricks" (4Cs). Find current 4Cs index.
    fourcs = "obj_b6b329f44979"
    idx = gb.get_slide_ids(PRES_ID).index(fourcs) + 1
    page = new_blank(idx)

    title_block(page, "One Lakehouse, Served Two Ways", kicker="Why Lakebase + a sync — not reverse-ETL")

    gb.create_text_box(PRES_ID, page,
                       "The gold tables aren't a second source of truth. Lakebase serves the same governed data at app latency — and adds one small writable table for decisions.",
                       0.7, 2.05, 11.9, 0.7, font_size=15, font_color=hex_rgb("muted_teal"))

    cols = [
        ("Read path — synced, read-only", "teal",
         "Gold tables sync into Lakebase as low-latency, read-only copies.\n\nManaged by Databricks — not a hand-built reverse-ETL pipeline you own and monitor.\n\nUnity Catalog stays the single source of truth; the sync is a serving cache, not a fork."),
        ("Write path — one governed table", "dark_red",
         "case_actions is the only writable table — approved dispositions, written by the app.\n\nYou can't write to a synced table, so this is the operational store for decisions.\n\nIt flows back to the lakehouse, so the queue and analytics stay consistent."),
    ]
    cw, gap, y, ch = 5.85, 0.5, 2.9, 3.4
    x0 = (SLIDE_W - (2 * cw + gap)) / 2
    for i, (head, accent, body) in enumerate(cols):
        x = x0 + i * (cw + gap)
        card(page, x, y, cw, ch, fill="light_gray")
        bar = gb.create_shape(PRES_ID, page, "RECTANGLE", x, y, 0.12, ch)["shapeId"]
        gb.update_shape_properties(PRES_ID, bar, fill_color=hex_rgb(accent))
        batch([{"updateShapeProperties": {"objectId": bar, "shapeProperties": {"outline": {"propertyState": "NOT_RENDERED"}}, "fields": "outline"}}])
        gb.create_text_box(PRES_ID, page, head, x + 0.4, y + 0.35, cw - 0.7, 0.5, font_size=17, bold=True, font_color=hex_rgb(accent))
        gb.create_text_box(PRES_ID, page, body, x + 0.4, y + 1.05, cw - 0.7, ch - 1.3, font_size=13, font_color=hex_rgb("dark_teal"))
    print("lakebase slide built:", page)


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("target", choices=["problem", "value", "lakebase", "all"])
    args = p.parse_args()
    if args.target in ("problem", "all"):
        build_problem()
    if args.target in ("value", "all"):
        build_business_value()
    if args.target in ("lakebase", "all"):
        build_lakebase()
