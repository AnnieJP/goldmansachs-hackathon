"""
Generate a synthetic brokerage statement PDF that exercises every
edge case in the import parser at backend/server.py::_parse_holdings_text.

Run:
    pip install reportlab
    python3 backend/data/input/generate_test_statement.py

Output: backend/data/input/test_statement.pdf
"""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle


OUT = Path(__file__).resolve().parent / "test_statement.pdf"


# ── Sections (header text drives the parser's `current_type`) ──────────────
#
# DESIGN INTENT
# ─────────────
# AAPL (stock)  ~ $11,000 cost
# VTI  (etf)    ~ $11,000 cost
# VFIAX (fund)  ~ $11,000 cost
# BND  (bond)   ~ $11,000 cost
#
# These four sit at the top of "Top Holdings" so the user sees one of
# every asset type with the correct type colour (blue / green / orange / purple)
# and equal dollar weight. Smaller satellite positions exercise edge cases
# (high-beta growth, defensive, false-positive ticker filtering, etc.).
#
SECTIONS = [
    {
        "header": "INDIVIDUAL EQUITIES",
        "rows": [
            # name, ticker, shares, avg_cost
            ("Apple Inc.",                 "AAPL",   75,  150.00),   # ~$11,250 cost — flagship stock
            ("NVIDIA Corp.",               "NVDA",   12,  420.10),   # high-beta growth (~$5k)
            ("Tesla Inc.",                 "TSLA",   15,  210.00),   # high-beta growth (~$3.2k)
            ("Microsoft Corp.",            "MSFT",   10,  280.50),   # quality growth   (~$2.8k)
            ("JPMorgan Chase & Co.",       "JPM",    20,  140.25),   # value            (~$2.8k)
            ("Johnson & Johnson",          "JNJ",    18,  158.40),   # defensive        (~$2.9k)
        ],
    },
    {
        "header": "ETFs",
        "rows": [
            ("Vanguard Total Stock Market", "VTI",   50,  220.00),   # ~$11,000 cost — flagship ETF
            ("Invesco QQQ Trust",           "QQQ",    8,  370.00),   # tech-heavy        (~$3k)
            ("iShares 20+ Year Treasury",   "TLT",   15,   95.50),   # long-duration     (~$1.4k)
        ],
    },
    {
        "header": "MUTUAL FUNDS",
        "rows": [
            ("Vanguard 500 Admiral",         "VFIAX", 30,  380.00),  # ~$11,400 cost — flagship fund
            ("Fidelity 500",                 "FXAIX", 25,  165.00),  # core S&P 500      (~$4.1k)
            ("Schwab S&P 500",               "SWPPX", 35,   72.50),  # core S&P 500      (~$2.5k)
            ("Vanguard Total International", "VTIAX", 50,   30.20),  # international     (~$1.5k)
        ],
    },
    {
        "header": "BONDS / FIXED INCOME",
        "rows": [
            ("Vanguard Total Bond Market",   "BND",  140,   78.90),  # ~$11,000 cost — flagship bond
            ("iShares Core US Aggregate",    "AGG",   25,  100.10),  # core bond         (~$2.5k)
        ],
    },
]


# ── Build the PDF ──────────────────────────────────────────────────────────
def build():
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=16, spaceAfter=4)
    sub = ParagraphStyle("Sub", parent=styles["Normal"], fontSize=9, textColor=colors.grey)
    section_h = ParagraphStyle("Section", parent=styles["Heading2"],
                               fontSize=12, spaceBefore=18, spaceAfter=6,
                               textColor=colors.HexColor("#0A1628"))

    doc = SimpleDocTemplate(str(OUT), pagesize=LETTER,
                            leftMargin=0.6*inch, rightMargin=0.6*inch,
                            topMargin=0.6*inch, bottomMargin=0.6*inch)

    story = []
    story.append(Paragraph("Acme Brokerage — Account Statement", h1))
    story.append(Paragraph("Statement Period: 01-Apr-2026 to 30-Apr-2026", sub))
    story.append(Paragraph("Account #: ****1234   |   USD   |   FINRA / SIPC member", sub))
    story.append(Spacer(1, 14))

    table_style = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EDE8E1")),
        ("FONT",       (0, 0), (-1, 0), "Helvetica-Bold", 9),
        ("FONT",       (0, 1), (-1, -1), "Helvetica", 9),
        ("ALIGN",      (2, 0), (-1, -1), "RIGHT"),
        ("LINEBELOW",  (0, 0), (-1, 0), 0.5, colors.HexColor("#0A1628")),
        ("LINEBELOW",  (0, -1), (-1, -1), 0.25, colors.lightgrey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAF8F5")]),
        ("LEFTPADDING",  (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
    ])

    for sec in SECTIONS:
        story.append(Paragraph(sec["header"], section_h))
        data = [["Security", "Ticker", "Shares", "Avg Cost"]]
        for name, ticker, shares, avg in sec["rows"]:
            shares_s = f"{shares:g}"
            avg_s    = f"${avg:,.2f}"
            data.append([name, ticker, shares_s, avg_s])
        tbl = Table(data, colWidths=[3.2*inch, 0.9*inch, 0.9*inch, 1.1*inch])
        tbl.setStyle(table_style)
        story.append(tbl)

    story.append(Spacer(1, 18))
    story.append(Paragraph(
        "Past performance is not indicative of future results. "
        "This document is for testing the import parser only.",
        sub,
    ))

    doc.build(story)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    build()
