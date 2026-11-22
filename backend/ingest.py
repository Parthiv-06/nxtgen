# Parses an uploaded NxGen YMS export (.xlsx or .csv) into yms_records rows.
# Headers are matched to table columns through each column's `comment`.
import csv
import io
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

import openpyxl
from sqlalchemy import Date, DateTime, Integer, Numeric

from models import YmsRecord

COLUMNS = {c.comment: c for c in YmsRecord.__table__.columns if c.comment}
DATE_FORMATS = ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d")


class IngestError(ValueError):
    pass


def _blank(v):
    return v is None or (isinstance(v, str) and v.strip() in ("", "::", "-", "NA", "N/A"))


def _to_datetime(v):
    if isinstance(v, datetime):
        dt = v
    elif isinstance(v, date):
        dt = datetime(v.year, v.month, v.day)
    else:
        s = str(v).strip()
        for fmt in DATE_FORMATS:
            try:
                dt = datetime.strptime(s, fmt)
                break
            except ValueError:
                continue
        else:
            return None
    return None if dt.year <= 1900 else dt  # 01/01/1900 is the export's "no date"


def _to_decimal(v):
    if isinstance(v, (int, float)):
        return Decimal(str(v))
    try:
        return Decimal(str(v).replace("%", "").replace(",", "").strip())
    except InvalidOperation:
        return None


def _to_text(v):
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    if isinstance(v, datetime):
        return v.isoformat(sep=" ")
    return str(v).strip()


def convert(column, v):
    if _blank(v):
        return None
    t = column.type
    if isinstance(t, DateTime):
        return _to_datetime(v)
    if isinstance(t, Date):
        dt = _to_datetime(v)
        return dt.date() if dt else None
    if isinstance(t, Integer):
        d = _to_decimal(v)
        return int(d) if d is not None else None
    if isinstance(t, Numeric):
        return _to_decimal(v)
    return _to_text(v)


def _find_header(rows):
    """Index of the row that names the most known columns (the export has a title row first)."""
    best, best_hits = None, 2
    for i, row in enumerate(rows[:15]):
        hits = sum(1 for cell in row if cell is not None and str(cell).strip() in COLUMNS)
        if hits > best_hits:
            best, best_hits = i, hits
    return best


def _read_sheets(file_name, content):
    if file_name.lower().endswith(".csv"):
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = content.decode("latin-1")
        return [("CSV", list(csv.reader(io.StringIO(text))))]
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:
        raise IngestError(f"Could not open the Excel file: {exc}") from exc
    return [(ws.title, [list(r) for r in ws.iter_rows(values_only=True)]) for ws in wb.worksheets]


def parse(file_name, content):
    """Returns (sheet_name, records as dicts, headers that matched no column)."""
    for sheet_name, rows in _read_sheets(file_name, content):
        h = _find_header(rows)
        if h is None:
            continue
        headers = [str(c).strip() if c is not None else "" for c in rows[h]]
        mapping = {i: COLUMNS[name] for i, name in enumerate(headers) if name in COLUMNS}
        unmatched = [name for name in headers if name and name not in COLUMNS]
        records = []
        for row in rows[h + 1 :]:
            if all(_blank(v) for v in row):
                continue
            records.append(
                {col.name: convert(col, row[i]) for i, col in mapping.items() if i < len(row)}
            )
        return sheet_name, records, unmatched
    raise IngestError("No sheet has the NxGen YMS column headers (e.g. 'S No.', 'Barcode', 'PlateID').")
