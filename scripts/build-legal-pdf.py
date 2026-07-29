#!/usr/bin/env python3
"""Build the binding Polish Regulamin PDF from the website's legal source."""

from __future__ import annotations

import html
import re
import shutil
from pathlib import Path

from lxml import html as lxml_html
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageTemplate,
    Paragraph,
    Spacer,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src" / "views" / "legal" / "foundation-legal-content.js"
OUTPUT = ROOT / "output" / "pdf" / "regulamin-englishmetro.pdf"
PUBLIC_OUTPUT = ROOT / "public" / "legal" / "regulamin-englishmetro.pdf"

INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#596579")
ACCENT = colors.HexColor("#6D28D9")
LINE = colors.HexColor("#DCE2EA")


def register_fonts() -> tuple[str, str, str]:
    candidates = [
        (
            Path("C:/Windows/Fonts/arial.ttf"),
            Path("C:/Windows/Fonts/arialbd.ttf"),
            Path("C:/Windows/Fonts/ariali.ttf"),
        ),
        (
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf"),
        ),
    ]
    for regular, bold, italic in candidates:
        if regular.exists() and bold.exists() and italic.exists():
            pdfmetrics.registerFont(TTFont("EMSans", str(regular)))
            pdfmetrics.registerFont(TTFont("EMSans-Bold", str(bold)))
            pdfmetrics.registerFont(TTFont("EMSans-Italic", str(italic)))
            pdfmetrics.registerFontFamily(
                "EMSans",
                normal="EMSans",
                bold="EMSans-Bold",
                italic="EMSans-Italic",
                boldItalic="EMSans-Bold",
            )
            return "EMSans", "EMSans-Bold", "EMSans-Italic"
    return "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"


REGULAR, BOLD, ITALIC = register_fonts()


def extract_terms_html() -> str:
    source = SOURCE.read_text(encoding="utf-8")
    match = re.search(
        r"export const TERMS_HTML_PL = `(?P<body>.*?)`\s*\n\s*"
        r"export const PRIVACY_TITLE_PL",
        source,
        re.DOTALL,
    )
    if not match:
        raise RuntimeError(f"Could not locate TERMS_HTML_PL in {SOURCE}")
    return match.group("body")


def inline_markup(element, exclude_lists: bool = False) -> str:
    parts: list[str] = []

    def walk(node) -> None:
        if node.text:
            parts.append(html.escape(node.text))
        for child in node:
            tag = child.tag.lower() if isinstance(child.tag, str) else ""
            if exclude_lists and tag in {"ol", "ul"}:
                if child.tail:
                    parts.append(html.escape(child.tail))
                continue
            if tag == "br":
                parts.append("<br/>")
            elif tag in {"strong", "b"}:
                parts.append("<b>")
                walk(child)
                parts.append("</b>")
            elif tag in {"em", "i"}:
                parts.append("<i>")
                walk(child)
                parts.append("</i>")
            elif tag == "a":
                href = html.escape(child.get("href", ""), quote=True)
                parts.append(f'<a href="{href}" color="#6D28D9">')
                walk(child)
                parts.append("</a>")
            else:
                walk(child)
            if child.tail:
                parts.append(html.escape(child.tail))

    walk(element)
    return "".join(parts).strip()


styles = getSampleStyleSheet()
BODY = ParagraphStyle(
    "Body",
    parent=styles["BodyText"],
    fontName=REGULAR,
    fontSize=9.15,
    leading=13.2,
    textColor=INK,
    spaceAfter=3.5 * mm,
    allowWidows=0,
    allowOrphans=0,
)
BODY_COMPACT = ParagraphStyle(
    "BodyCompact",
    parent=BODY,
    fontSize=8.85,
    leading=12.4,
    spaceAfter=1.2 * mm,
)
H1 = ParagraphStyle(
    "Title",
    parent=styles["Title"],
    fontName=BOLD,
    fontSize=24,
    leading=29,
    textColor=INK,
    alignment=TA_LEFT,
    spaceAfter=5 * mm,
)
H2 = ParagraphStyle(
    "Section",
    parent=styles["Heading2"],
    fontName=BOLD,
    fontSize=13,
    leading=17,
    textColor=INK,
    spaceBefore=4 * mm,
    spaceAfter=2.5 * mm,
    keepWithNext=True,
)
META = ParagraphStyle(
    "Meta",
    parent=BODY,
    fontName=REGULAR,
    fontSize=8.2,
    leading=11,
    textColor=MUTED,
)
NOTE = ParagraphStyle(
    "Note",
    parent=BODY,
    fontName=REGULAR,
    fontSize=8.7,
    leading=12.5,
    textColor=MUTED,
    borderColor=LINE,
    borderWidth=0.7,
    borderPadding=8,
    backColor=colors.HexColor("#F7F5FF"),
)
FORM = ParagraphStyle(
    "Form",
    parent=BODY,
    fontName=REGULAR,
    fontSize=8.7,
    leading=13,
    leftIndent=5 * mm,
    rightIndent=5 * mm,
    borderColor=LINE,
    borderWidth=0.7,
    borderPadding=8,
    backColor=colors.HexColor("#FBFCFE"),
)


def list_flowable(element, level: int = 0):
    cls = element.get("class", "")
    ordered = element.tag.lower() == "ol"
    start = "1"
    if "alpha" in cls:
        start = "a"
    elif "roman" in cls:
        start = "i"
    items = []
    for li in element.xpath("./li"):
        flows = []
        text = inline_markup(li, exclude_lists=True)
        if text:
            flows.append(Paragraph(text, BODY_COMPACT))
        for child_list in li.xpath("./ol|./ul"):
            flows.append(list_flowable(child_list, level + 1))
        items.append(
            ListItem(
                flows,
                leftIndent=(5 + min(level, 3) * 2.5) * mm,
                bulletColor=ACCENT if level == 0 else MUTED,
            )
        )
    return ListFlowable(
        items,
        bulletType="1" if ordered else "bullet",
        start=start if ordered else None,
        leftIndent=(6 + min(level, 3) * 2.5) * mm,
        bulletFontName=BOLD,
        bulletFontSize=8.5,
        bulletColor=ACCENT if level == 0 else MUTED,
        spaceAfter=2.4 * mm,
    )


def body_story() -> list:
    root = lxml_html.fragment_fromstring(extract_terms_html(), create_parent="div")
    story: list = [
        Spacer(1, 8 * mm),
        Paragraph("REGULAMIN SERWISU ENGLISHMETRO.COM", H1),
        Paragraph(
            "DOC <b>EM-LEGAL-03</b> &nbsp;&nbsp; | &nbsp;&nbsp; "
            "Obowiązuje od <b>29 lipca 2026 r.</b> &nbsp;&nbsp; | &nbsp;&nbsp; "
            "Dotyczy <b>englishmetro.com</b>",
            META,
        ),
        Spacer(1, 4 * mm),
        Paragraph(
            "Wersja wiążąca w języku polskim. Dokument obejmuje warunki "
            "zamówień, płatności, odstąpienia od umowy i reklamacji.",
            NOTE,
        ),
        Spacer(1, 5 * mm),
    ]

    for section in root.xpath("./section"):
        heading = section.find("h2")
        if heading is not None:
            story.append(Paragraph(inline_markup(heading), H2))
        for child in section:
            if child is heading:
                continue
            tag = child.tag.lower() if isinstance(child.tag, str) else ""
            if tag == "p":
                story.append(Paragraph(inline_markup(child), BODY))
            elif tag in {"ol", "ul"}:
                story.append(list_flowable(child))
            elif tag == "div":
                block = inline_markup(child)
                if block:
                    story.append(KeepTogether([Paragraph(block, FORM), Spacer(1, 3 * mm)]))
    return story


class LegalDocTemplate(BaseDocTemplate):
    pass


def page_chrome(canvas, doc) -> None:
    width, height = A4
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(20 * mm, height - 15 * mm, width - 20 * mm, height - 15 * mm)
    canvas.setFont(BOLD, 8.2)
    canvas.setFillColor(INK)
    canvas.drawString(20 * mm, height - 11.5 * mm, "EnglishMetro.")
    canvas.setFont(REGULAR, 7.6)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(width - 20 * mm, height - 11.5 * mm, "Regulamin | EM-LEGAL-03")
    canvas.line(20 * mm, 15 * mm, width - 20 * mm, 15 * mm)
    canvas.drawString(20 * mm, 10.5 * mm, "Obowiązuje od 29 lipca 2026 r.")
    canvas.drawRightString(width - 20 * mm, 10.5 * mm, f"Strona {doc.page}")
    canvas.restoreState()


def build() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = LegalDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title="Regulamin serwisu englishmetro.com",
        author='Fundacja Rozwoju Przedsiębiorczości "Twój StartUp"',
        subject="EM-LEGAL-03",
    )
    frame = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        doc.width,
        doc.height,
        id="body",
    )
    doc.addPageTemplates(PageTemplate(id="legal", frames=[frame], onPage=page_chrome))
    doc.build(body_story())
    shutil.copyfile(OUTPUT, PUBLIC_OUTPUT)
    print(f"wrote {OUTPUT.relative_to(ROOT)}")
    print(f"copied {PUBLIC_OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
