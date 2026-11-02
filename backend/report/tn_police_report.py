"""
Tamil Nadu Police style investigation report (PDF layer only).

This module ONLY formats data that the existing pipeline already produces
(entities, relations, contradictions, confidence, search_results).
It does not touch NLP, graph, scoring or search code.

Logo: place the official logo at   backend/report/assets/tn_police_logo.png
(or  assets/tn_police_logo.png  in the project root). If it is missing, a
neutral placeholder badge is drawn so the report still generates.
"""

import os
import re
from datetime import datetime
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.graphics.shapes import Drawing, Line, Polygon, Rect, String
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (
    BaseDocTemplate, Frame, KeepTogether, PageBreak, PageTemplate, Paragraph,
    Spacer, Table, TableStyle,
)

# ----------------------------------------------------------------------------
# Look & feel
# ----------------------------------------------------------------------------
NAVY = colors.HexColor("#1F3864")
GOLD = colors.HexColor("#B8860B")
LIGHT = colors.HexColor("#E8EDF6")
ZEBRA = colors.HexColor("#F6F8FC")
GRID = colors.HexColor("#9AA5B8")
RED = colors.HexColor("#B00020")
GREEN = colors.HexColor("#1B7F3B")

PAGE_W, PAGE_H = A4
MARGIN_X = 18 * mm
TOP_MARGIN = 40 * mm
BOTTOM_MARGIN = 20 * mm
CONTENT_W = PAGE_W - 2 * MARGIN_X

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO_CANDIDATES = [
    os.path.join(HERE, "assets", "tn_police_logo.png"),
    os.path.join(HERE, "assets", "tn_police_logo.jpg"),
    os.path.join(HERE, "..", "..", "assets", "tn_police_logo.png"),
    os.path.join(HERE, "..", "..", "assets", "tn_police_logo.jpg"),
]

TYPE_LABEL = {
    "PERSON": "Person",
    "LOCATION": "Location",
    "EVIDENCE": "Evidence / Exhibit",
    "TIME": "Time reference",
}
TYPE_COLOR = {
    "PERSON": colors.HexColor("#2F5597"),
    "LOCATION": colors.HexColor("#7F6000"),
    "EVIDENCE": colors.HexColor("#1B7F3B"),
}
NA = "Not available"


# ----------------------------------------------------------------------------
# Small helpers
# ----------------------------------------------------------------------------
def _safe(value):
    """Escape for Paragraph markup and strip characters Helvetica cannot draw."""
    if value is None or value == "":
        return NA
    text = str(value)
    text = (text.replace("\u2192", ">").replace("\u2014", "-")
                .replace("\u2013", "-").replace("\u26a0", "!"))
    text = text.encode("cp1252", "replace").decode("cp1252")
    return escape(text)


def _styles():
    base = getSampleStyleSheet()
    return {
        "body": ParagraphStyle("body", parent=base["Normal"], fontName="Helvetica",
                               fontSize=9.5, leading=13.5, alignment=TA_JUSTIFY),
        "cell": ParagraphStyle("cell", parent=base["Normal"], fontName="Helvetica",
                               fontSize=8.6, leading=11, alignment=TA_LEFT),
        "cellb": ParagraphStyle("cellb", parent=base["Normal"], fontName="Helvetica-Bold",
                                fontSize=8.6, leading=11, textColor=NAVY),
        "head": ParagraphStyle("head", parent=base["Normal"], fontName="Helvetica-Bold",
                               fontSize=8.6, leading=11, textColor=NAVY),
        "section": ParagraphStyle("section", parent=base["Normal"], fontName="Helvetica-Bold",
                                  fontSize=10.5, leading=13, textColor=colors.white),
        "sub": ParagraphStyle("sub", parent=base["Normal"], fontName="Helvetica-Bold",
                              fontSize=9.5, leading=12, textColor=NAVY, spaceBefore=6, spaceAfter=3),
        "bullet": ParagraphStyle("bullet", parent=base["Normal"], fontName="Helvetica",
                                 fontSize=9.5, leading=13.5, leftIndent=12, bulletIndent=2),
        "small": ParagraphStyle("small", parent=base["Normal"], fontName="Helvetica-Oblique",
                                fontSize=8, leading=10.5, textColor=colors.HexColor("#444444")),
        "disc": ParagraphStyle("disc", parent=base["Normal"], fontName="Helvetica",
                               fontSize=8.8, leading=12, alignment=TA_JUSTIFY),
        "center": ParagraphStyle("center", parent=base["Normal"], fontName="Helvetica",
                                 fontSize=9, alignment=TA_CENTER),
    }


def _section(title, st):
    t = Table([[Paragraph(_safe(title).upper(), st["section"])]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("LINEBELOW", (0, 0), (-1, -1), 1.5, GOLD),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def _table(rows, col_widths, st, header=True, zebra=True):
    """rows: list of lists of plain strings (or Paragraphs)."""
    data = []
    for r_i, row in enumerate(rows):
        out = []
        for cell in row:
            if hasattr(cell, "wrap"):
                out.append(cell)
            else:
                style = st["head"] if (header and r_i == 0) else st["cell"]
                out.append(Paragraph(_safe(cell), style))
        data.append(out)
    t = Table(data, colWidths=col_widths, repeatRows=1 if header else 0)
    style = [
        ("GRID", (0, 0), (-1, -1), 0.5, GRID),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if header:
        style.append(("BACKGROUND", (0, 0), (-1, 0), LIGHT))
    if zebra:
        start = 1 if header else 0
        for i in range(start, len(data)):
            if (i - start) % 2 == 1:
                style.append(("BACKGROUND", (0, i), (-1, i), ZEBRA))
    t.setStyle(TableStyle(style))
    return t


def _kv_table(pairs, st):
    """Two-column key/value particulars table (labels shaded)."""
    data = [[Paragraph(_safe(k), st["cellb"]), Paragraph(_safe(v), st["cell"])] for k, v in pairs]
    t = Table(data, colWidths=[52 * mm, CONTENT_W - 52 * mm])
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, GRID),
        ("BACKGROUND", (0, 0), (0, -1), LIGHT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def _bullets(items, st):
    return [Paragraph(_safe(i), st["bullet"], bulletText="\u2022") for i in items]


def _join(names, limit=8):
    names = [n for n in names if n]
    if not names:
        return NA
    if len(names) > limit:
        return ", ".join(names[:limit]) + f" and {len(names) - limit} more"
    return ", ".join(names)


# ----------------------------------------------------------------------------
# Header / footer (drawn on every page)
# ----------------------------------------------------------------------------
def _find_logo():
    for p in LOGO_CANDIDATES:
        if os.path.isfile(p):
            return p
    return None


def _draw_logo(c, x, y, size):
    """x, y = bottom-left of a size x size box."""
    logo = _find_logo()
    if logo:
        try:
            c.drawImage(logo, x, y, width=size, height=size,
                        preserveAspectRatio=True, mask="auto", anchor="c")
            return
        except Exception:
            pass  # fall through to placeholder
    # Neutral placeholder badge (NOT the official emblem)
    cx, cy, r = x + size / 2, y + size / 2, size / 2
    c.saveState()
    c.setFillColor(NAVY)
    c.circle(cx, cy, r, stroke=0, fill=1)
    c.setStrokeColor(GOLD)
    c.setLineWidth(1.6)
    c.circle(cx, cy, r - 3, stroke=1, fill=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(cx, cy + 1, "TN")
    c.setFont("Helvetica-Bold", 6.5)
    c.drawCentredString(cx, cy - 8, "POLICE")
    c.restoreState()


def _make_page_decorator(case_id, report_no, stamp):
    def decorate(c, doc):
        c.saveState()
        top = PAGE_H - 10 * mm
        logo_size = 22 * mm
        _draw_logo(c, MARGIN_X, top - logo_size, logo_size)

        # centre title block
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 16)
        c.drawCentredString(PAGE_W / 2, top - 8 * mm, "TAMIL NADU POLICE")
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(PAGE_W / 2, top - 14 * mm, "AI-ASSISTED CRIME INVESTIGATION REPORT")
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.HexColor("#444444"))
        c.drawCentredString(PAGE_W / 2, top - 19 * mm, "Decision-support report - to be verified by the Investigating Officer")

        # right meta block
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(NAVY)
        rx = PAGE_W - MARGIN_X
        c.drawRightString(rx, top - 6 * mm, f"Report No: {report_no}")
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.black)
        c.drawRightString(rx, top - 11 * mm, f"Case ID: {case_id}")
        c.drawRightString(rx, top - 16 * mm, f"Date: {stamp.strftime('%d-%m-%Y')}")
        c.drawRightString(rx, top - 21 * mm, f"Time: {stamp.strftime('%H:%M')} hrs")

        # double rule
        y = top - logo_size - 3 * mm
        c.setStrokeColor(NAVY)
        c.setLineWidth(1.6)
        c.line(MARGIN_X, y, PAGE_W - MARGIN_X, y)
        c.setStrokeColor(GOLD)
        c.setLineWidth(0.6)
        c.line(MARGIN_X, y - 1.6 * mm, PAGE_W - MARGIN_X, y - 1.6 * mm)

        # footer rule + text (page number added by NumberedCanvas)
        c.setStrokeColor(NAVY)
        c.setLineWidth(0.8)
        c.line(MARGIN_X, 15 * mm, PAGE_W - MARGIN_X, 15 * mm)
        c.setFont("Helvetica-Bold", 7.5)
        c.setFillColor(RED)
        c.drawString(MARGIN_X, 10.5 * mm, "CONFIDENTIAL - FOR OFFICIAL USE ONLY")
        c.setFont("Helvetica", 7.5)
        c.setFillColor(colors.HexColor("#444444"))
        c.drawRightString(PAGE_W - MARGIN_X, 10.5 * mm, "Generated by AI Crime Investigator (prototype)")
        c.restoreState()
    return decorate


class _NumberedCanvas(rl_canvas.Canvas):
    """Adds 'Page X of Y' once the total page count is known."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_pages = []

    def showPage(self):
        self._saved_pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved_pages)
        for state in self._saved_pages:
            self.__dict__.update(state)
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(NAVY)
            self.drawCentredString(PAGE_W / 2, 10.5 * mm, f"Page {self._pageNumber} of {total}")
            super().showPage()
        super().save()


# ----------------------------------------------------------------------------
# Data shaping (presentation only - nothing here changes the analysis)
# ----------------------------------------------------------------------------
def _clean_times(entities):
    """Drop time fragments such as '45 PM' that are only part of '9:45 PM'."""
    times = [e.get("text", "") for e in entities if e.get("type") == "TIME"]
    keep = []
    for t in times:
        frag = any(o != t and o.lower().endswith(t.lower()) and ":" in o and ":" not in t
                   for o in times)
        if not frag:
            keep.append(t)
    return keep


def _time_key(text):
    m = re.match(r"\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", text, re.I)
    if not m:
        return 9999
    h, mnt, ap = int(m.group(1)), int(m.group(2) or 0), (m.group(3) or "").lower()
    if ap == "pm" and h < 12:
        h += 12
    if ap == "am" and h == 12:
        h = 0
    return h * 60 + mnt


def _by_type(entities):
    out = {"PERSON": [], "LOCATION": [], "EVIDENCE": [], "TIME": []}
    for e in entities or []:
        out.setdefault(e.get("type", "OTHER"), []).append(e.get("text", ""))
    return out


# ----------------------------------------------------------------------------
# Case graph (drawn natively with reportlab - no extra dependencies)
# ----------------------------------------------------------------------------
def _case_graph_drawing(entities, relations, width, height=300):
    groups = _by_type(entities)
    cols = [("PERSON", "PERSONS", 0.14), ("LOCATION", "LOCATIONS", 0.50), ("EVIDENCE", "EVIDENCE", 0.86)]
    d = Drawing(width, height)
    node_w, node_h = 92, 22
    top_pad, bot_pad = 38, 34

    pos = {}
    for key, label, frac in cols:
        names = groups.get(key, [])
        cx = width * frac
        d.add(String(cx, height - 16, label, textAnchor="middle", fontName="Helvetica-Bold",
                     fontSize=8, fillColor=NAVY))
        n = len(names)
        usable = height - top_pad - bot_pad
        for i, name in enumerate(names):
            cy = (height - top_pad - usable * (i + 0.5) / max(n, 1)) if n else 0
            pos[name] = (cx, cy, key)

    rel_color = {"seen_near": colors.HexColor("#2F5597"), "found_at": GREEN,
                 "linked_to": colors.HexColor("#7F6000")}

    # edges first (nodes are drawn on top)
    drawn = 0
    for r in relations or []:
        a, b = pos.get(r.get("source")), pos.get(r.get("target"))
        if not a or not b:
            continue
        x1, y1, x2, y2 = a[0], a[1], b[0], b[1]
        # shorten to node borders
        dx = node_w / 2 if x2 > x1 else -node_w / 2
        sx, ex = x1 + dx, x2 - dx
        col = rel_color.get(r.get("relation"), colors.grey)
        d.add(Line(sx, y1, ex, y2, strokeColor=col, strokeWidth=0.9))
        # arrow head
        import math
        ang = math.atan2(y2 - y1, ex - sx)
        L, W = 6, 2.6
        px, py = ex - L * math.cos(ang), y2 - L * math.sin(ang)
        d.add(Polygon([ex, y2,
                       px + W * math.sin(ang), py - W * math.cos(ang),
                       px - W * math.sin(ang), py + W * math.cos(ang)],
                      fillColor=col, strokeColor=col, strokeWidth=0.3))
        drawn += 1

    for name, (cx, cy, key) in pos.items():
        col = TYPE_COLOR.get(key, colors.grey)
        d.add(Rect(cx - node_w / 2, cy - node_h / 2, node_w, node_h, rx=5, ry=5,
                   fillColor=colors.white, strokeColor=col, strokeWidth=1.6))
        d.add(String(cx, cy - 3, _clip(name, 18), textAnchor="middle", fontName="Helvetica-Bold",
                     fontSize=8, fillColor=colors.black))

    # legend
    lx, ly = 10, 10
    for label, col in [("seen near", rel_color["seen_near"]), ("found at", rel_color["found_at"]),
                       ("linked to", rel_color["linked_to"])]:
        d.add(Line(lx, ly + 3, lx + 18, ly + 3, strokeColor=col, strokeWidth=1.6))
        d.add(String(lx + 23, ly, label, fontName="Helvetica", fontSize=7.5, fillColor=colors.black))
        lx += 80
    return d, drawn


def _clip(text, n):
    text = _safe(text)
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    return text if len(text) <= n else text[: n - 1] + "."


# ----------------------------------------------------------------------------
# Main builder
# ----------------------------------------------------------------------------
def build_tn_police_report(case_id, entities, relations, contradictions, confidence,
                           search_results, output_dir="reports", case_text=None, meta=None):
    entities = entities or []
    relations = relations or []
    contradictions = contradictions or []
    confidence = confidence or {}
    meta = meta or {}

    os.makedirs(output_dir, exist_ok=True)
    stamp = datetime.now()
    filename = os.path.join(output_dir, f"case_{case_id}_{stamp.strftime('%Y%m%d_%H%M%S')}.pdf")
    report_no = f"TNP/AICI/{stamp.year}/{case_id}"

    st = _styles()
    groups = _by_type(entities)
    persons, locations, evidence = groups["PERSON"], groups["LOCATION"], groups["EVIDENCE"]
    times = sorted(_clean_times(entities), key=_time_key)
    pct = confidence.get("percentage", 0)
    bd = confidence.get("breakdown", {}) or {}

    doc = BaseDocTemplate(
        filename, pagesize=A4,
        leftMargin=MARGIN_X, rightMargin=MARGIN_X, topMargin=TOP_MARGIN, bottomMargin=BOTTOM_MARGIN,
        title=f"Investigation Report - {case_id}", author="AI Crime Investigator",
        subject="AI-assisted crime investigation report",
    )
    frame = Frame(MARGIN_X, BOTTOM_MARGIN, CONTENT_W, PAGE_H - TOP_MARGIN - BOTTOM_MARGIN,
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="tn", frames=[frame],
                                       onPage=_make_page_decorator(case_id, report_no, stamp))])

    story = []

    # ------------------------------------------------------------ PAGE 1
    story += [_section("1. Case particulars", st), Spacer(1, 4)]
    story.append(_kv_table([
        ("Case ID", case_id),
        ("Report No.", report_no),
        ("Date and time of report", stamp.strftime("%d-%m-%Y, %H:%M hrs")),
        ("Police Station / District", meta.get("station", "To be filled by Investigating Officer")),
        ("Section(s) of law", meta.get("sections", "To be filled by Investigating Officer")),
        ("Investigating Officer", meta.get("officer", "To be filled by Investigating Officer")),
        ("Report status", "DRAFT - AI generated, pending officer verification"),
    ], st))
    story.append(Spacer(1, 10))

    story += [_section("2. Case summary", st), Spacer(1, 4)]
    summary = (
        f"The case statement was analysed by the AI Crime Investigator. The system identified "
        f"<b>{len(persons)}</b> person(s), <b>{len(locations)}</b> location(s), "
        f"<b>{len(evidence)}</b> item(s) of evidence and <b>{len(times)}</b> time reference(s), "
        f"and established <b>{len([r for r in relations if r.get('relation') != 'at_time'])}</b> "
        f"relationship(s) between them. "
        f"Persons mentioned: {_safe(_join(persons))}. Locations: {_safe(_join(locations))}. "
        f"Evidence referred to: {_safe(_join(evidence))}."
    )
    story.append(Paragraph(summary, st["body"]))
    if contradictions:
        story.append(Spacer(1, 4))
        story.append(Paragraph(
            f"<font color='#B00020'><b>{len(contradictions)} contradiction(s) flagged</b></font> "
            f"in the statements - see Section 6.", st["body"]))
    story.append(Spacer(1, 10))

    if case_text:
        story += [_section("Statement on record (excerpt)", st), Spacer(1, 4)]
        excerpt = case_text.strip()
        if len(excerpt) > 1400:
            excerpt = excerpt[:1400].rsplit(" ", 1)[0] + " ..."
        story.append(Paragraph(_safe(excerpt).replace("\n", "<br/>"), st["body"]))
        story.append(Spacer(1, 10))

    story += [_section("3. Overall evidence confidence", st), Spacer(1, 4)]
    conf_rows = [
        ["Component", "Value"],
        ["Prior (baseline)", f"{bd.get('prior', 0)}"],
        ["Entities identified", f"+{bd.get('entities', 0)}"],
        ["Relationships established", f"+{bd.get('relations', 0)}"],
        ["Contradiction penalty", f"-{bd.get('contradiction_penalty', 0)}"],
        [Paragraph("<b>Evidence confidence score</b>", st["cell"]),
         Paragraph(f"<b>{pct}%</b>", st["cell"])],
    ]
    story.append(_table(conf_rows, [CONTENT_W * 0.65, CONTENT_W * 0.35], st))
    story.append(Spacer(1, 3))
    story.append(Paragraph("Score = prior + entities + relationships - contradiction penalty "
                           "(explainable formula). It indicates strength of the recorded material, "
                           "not guilt.", st["small"]))
    story.append(PageBreak())

    # ------------------------------------------------------------ PAGE 2
    story += [_section("4. Extracted information", st), Spacer(1, 4)]
    ent_rows = [["Category", "Name / Description", "Linked items"]]
    for key in ("PERSON", "LOCATION", "EVIDENCE"):
        for name in groups[key]:
            linked = sorted({(r["target"] if r.get("source") == name else r["source"])
                             for r in relations
                             if name in (r.get("source"), r.get("target"))
                             and r.get("relation") != "at_time"})
            ent_rows.append([TYPE_LABEL[key], name, _join(linked, 5) if linked else "-"])
    if len(ent_rows) == 1:
        ent_rows.append(["-", "No entities extracted", "-"])
    story.append(_table(ent_rows, [CONTENT_W * 0.22, CONTENT_W * 0.30, CONTENT_W * 0.48], st))
    story.append(Spacer(1, 10))

    story += [_section("Timeline of time references", st), Spacer(1, 4)]
    tl_rows = [["Time", "Person(s) associated", "Remark"]]
    flagged_time = {str(c.get("time", "")).lower() for c in contradictions}
    for t in times:
        who = sorted({r["source"] for r in relations
                      if r.get("relation") == "at_time" and r.get("target", "").lower() == t.lower()})
        remark = "Flagged in contradiction" if t.lower() in flagged_time else "-"
        tl_rows.append([t, _join(who) if who else "-", remark])
    if len(tl_rows) == 1:
        tl_rows.append(["-", "No time references found", "-"])
    story.append(_table(tl_rows, [CONTENT_W * 0.20, CONTENT_W * 0.50, CONTENT_W * 0.30], st))
    story.append(Spacer(1, 3))
    story.append(Paragraph("Times are shown as extracted from the statements, in chronological order.",
                           st["small"]))
    story.append(PageBreak())

    # ------------------------------------------------------------ PAGE 3
    story += [_section("5. Case graph and relationships", st), Spacer(1, 4)]
    graph_rel = [r for r in relations if r.get("relation") != "at_time"]
    drawing, n_edges = _case_graph_drawing(entities, graph_rel, CONTENT_W, height=290)
    gbox = Table([[drawing]], colWidths=[CONTENT_W])
    gbox.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.7, GRID),
                              ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                              ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                              ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    story.append(gbox)
    story.append(Paragraph("Figure 1: Case graph - persons, locations and evidence with their "
                           "relationships.", st["small"]))
    story.append(Spacer(1, 8))

    rel_rows = [["Entity A", "Relation", "Entity B", "Conf.", "Basis"]]
    for r in graph_rel:
        rel_rows.append([r.get("source"), str(r.get("relation", "")).replace("_", " "), r.get("target"),
                         f"{int(round(float(r.get('confidence', 0)) * 100))}%" if r.get("confidence") is not None else NA,
                         r.get("reason")])
    if len(rel_rows) == 1:
        rel_rows.append(["-", "No relationships found", "-", "-", "-"])
    w = CONTENT_W
    story.append(_table(rel_rows, [w * .16, w * .13, w * .16, w * .08, w * .47], st))
    story.append(PageBreak())

    # ------------------------------------------------------------ PAGE 4
    story += [_section("6. Investigation analysis", st), Spacer(1, 4)]

    story.append(Paragraph("6.1 Contradictions / flags (constraint check)", st["sub"]))
    if contradictions:
        c_rows = [["#", "Severity", "Subject", "Observation", "Time"]]
        for i, c in enumerate(contradictions, 1):
            msg = c.get("message", str(c))
            locs = c.get("locations")
            if locs:
                msg += f" (Locations: {', '.join(locs)})"
            c_rows.append([str(i), c.get("severity", NA), c.get("subject", NA), msg, c.get("time", NA)])
        story.append(_table(c_rows, [w * .05, w * .11, w * .13, w * .55, w * .16], st))
        story.append(Paragraph("Result: INCONSISTENT - the recorded statements conflict and need "
                               "verification.", ParagraphStyle("r1", parent=st["small"], textColor=RED)))
    else:
        story.append(Paragraph("No contradictions detected.", st["body"]))
        story.append(Paragraph("Result: CONSISTENT", ParagraphStyle("r2", parent=st["small"], textColor=GREEN)))
    story.append(Spacer(1, 6))

    story.append(Paragraph("6.2 Persons of interest - link summary", st["sub"]))
    poi_rows = [["Person", "Linked locations", "Linked evidence", "Time refs.", "Flags"]]
    for p in persons:
        locs = sorted({r["target"] for r in relations if r.get("source") == p and r.get("target") in locations})
        evs = sorted({r["target"] for r in relations if r.get("source") == p and r.get("target") in evidence})
        tms = sorted({r["target"] for r in relations if r.get("source") == p and r.get("relation") == "at_time"})
        tms = [t for t in tms if t in times]
        flags = sum(1 for c in contradictions if c.get("subject") == p)
        poi_rows.append([p, _join(locs, 4) if locs else "-", _join(evs, 4) if evs else "-", str(len(tms)), str(flags)])
    if len(poi_rows) == 1:
        poi_rows.append(["-", "-", "-", "-", "-"])
    story.append(_table(poi_rows, [w * .16, w * .29, w * .29, w * .12, w * .14], st))
    story.append(Paragraph("Counts show how many recorded links exist for each person. They are "
                           "indicative only and are not a finding of guilt.", st["small"]))
    story.append(Spacer(1, 6))

    story.append(Paragraph("6.3 Investigation path search", st["sub"]))
    if search_results:
        s_rows = [["Algorithm", "Path found", "Hops", "Path"]]
        for algo, res in search_results.items():
            path = res.get("path")
            s_rows.append([algo, "Yes" if res.get("found") else "No", str(res.get("length", "-")),
                           " > ".join(path) if path else "No path"])
        story.append(_table(s_rows, [w * .16, w * .14, w * .10, w * .60], st))
        found = [a for a, r in search_results.items() if r.get("found")]
        paths = {tuple(r.get("path") or ()) for r in search_results.values() if r.get("found")}
        if found:
            note = ("All search algorithms returned the same connection path."
                    if len(paths) == 1 and len(found) == len(search_results)
                    else "Algorithms returned different paths; compare the entries above.")
            story.append(Paragraph(note, st["small"]))
    else:
        story.append(Paragraph("Path search was not requested for this case (no start / target "
                               "node given).", st["body"]))
    story.append(PageBreak())

    # ------------------------------------------------------------ PAGE 5
    story += [_section("7. Key findings", st), Spacer(1, 4)]
    findings = []
    if persons:
        findings.append(f"Person(s) mentioned in the statements: {_join(persons)}.")
    ev_loc = {}
    for r in graph_rel:
        if r.get("relation") == "found_at":
            ev_loc.setdefault(r["target"], []).append(r["source"])
    for loc, evs in ev_loc.items():
        findings.append(f"Evidence linked to {loc}: {_join(sorted(set(evs)))}.")
    for c in contradictions:
        findings.append(c.get("message", str(c)))
    findings.append(f"Overall evidence confidence is {pct}% after a penalty of "
                    f"{bd.get('contradiction_penalty', 0)} for contradictions.")
    story += _bullets(findings, st)
    story.append(Spacer(1, 8))

    story += [_section("8. Recommended next steps for the Investigating Officer", st), Spacer(1, 4)]
    steps = []
    for c in contradictions:
        subj, when = c.get("subject", "the person concerned"), c.get("time", "the stated time")
        steps.append(f"Re-examine the statements about {subj}'s whereabouts around {when}; cross-check "
                     f"with CCTV time stamps, call records and independent witnesses.")
    if evidence:
        steps.append(f"Verify the collection and chain of custody of the recorded evidence: {_join(evidence)}.")
    if persons:
        steps.append(f"Record or re-confirm formal statements of: {_join(persons)}.")
    steps.append("Review this report with the Investigating Officer before relying on it in the case diary.")
    story += _bullets(steps, st)
    story.append(Spacer(1, 10))

    disclaimer = Table([[Paragraph(
        "<b>Disclaimer:</b> This report is AI-generated decision support produced from the text "
        "supplied to the system. It is not evidence, does not establish guilt, and must be verified "
        "by the Investigating Officer before any official use.", st["disc"])]], colWidths=[CONTENT_W])
    disclaimer.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.8, RED),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFF5F5")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(disclaimer)
    story.append(Spacer(1, 14))

    def sig(title, lines):
        rows = [[Paragraph(f"<b>{_safe(title)}</b>", st["cell"])]]
        for ln in lines:
            rows.append([Paragraph(_safe(ln), st["cell"])])
        t = Table(rows, colWidths=[CONTENT_W / 3 - 4])
        t.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.6, GRID),
            ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        return t

    sig_row = Table([[
        sig("Prepared by", ["AI Crime Investigator (system)", f"Date: {stamp.strftime('%d-%m-%Y')}",
                            f"Time: {stamp.strftime('%H:%M')} hrs", "Status: Draft"]),
        sig("Investigating Officer", ["Name:", "Rank / No.:", "Signature:", "Date:"]),
        sig("Reviewing Officer", ["Name:", "Rank / No.:", "Signature:", "Date:"]),
    ]], colWidths=[CONTENT_W / 3] * 3)
    sig_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                 ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                 ("RIGHTPADDING", (0, 0), (-1, -1), 4)]))
    story.append(KeepTogether([_section("9. Authentication", st), Spacer(1, 6), sig_row]))
    story.append(Spacer(1, 10))
    story.append(Paragraph("- End of Report -", st["center"]))

    doc.build(story, canvasmaker=_NumberedCanvas)
    return filename
