# Aggregates the latest ingested YMS batch into the numbers the dashboard widgets show.
# Weights in the export are kilograms despite the "MT" headers, so tonnes = kg / 1000.
from collections import Counter, defaultdict
from datetime import timedelta
from statistics import median

from sqlalchemy import select

from models import IngestionBatch, YmsRecord

DEFECTS = [
    ("High jima", "pinas_con_jima_alta_pct"),
    ("Diseased", "pinas_con_enfermedad_pct"),
    ("Insects", "pinas_con_insectos_pct"),
    ("Fungus", "pinas_con_hongo_pct"),
    ("Dehydrated", "pinas_deshidratadas_pct"),
]


def _f(v):
    return float(v) if v is not None else None


def _avg(values):
    values = [v for v in values if v is not None]
    return round(sum(values) / len(values), 2) if values else None


def _top(counter, n):
    return [{"name": k, "count": v} for k, v in counter.most_common(n)]


def build(db):
    batch = db.scalars(select(IngestionBatch).order_by(IngestionBatch.id.desc()).limit(1)).first()
    if batch is None:
        return {"batch": None}
    rows = db.scalars(select(YmsRecord).where(YmsRecord.batch_id == batch.id)).all()

    gate_ins = [r.gate_in_timestamp for r in rows if r.gate_in_timestamp]

    # Arrivals: weekday (Mon=0) x hour of gate-in.
    grid = [[0] * 24 for _ in range(7)]
    for ts in gate_ins:
        grid[ts.weekday()][ts.hour] += 1

    # Yard: everything that has not gated out yet.
    in_yard = Counter(r.current_status for r in rows if r.current_status and r.current_status != "Gate-Out")

    # Net weight per week, for the 12 weeks ending at the newest weighing.
    weighed = [(r.second_weight_timestamp or r.gate_in_timestamp, _f(r.net_weight_mt)) for r in rows]
    weighed = [(ts, kg) for ts, kg in weighed if ts and kg and kg > 0]
    weeks = []
    if weighed:
        last = max(ts for ts, _ in weighed).date()
        last_monday = last - timedelta(days=last.weekday())
        starts = [last_monday - timedelta(weeks=i) for i in range(11, -1, -1)]
        per_week = defaultdict(float)
        for ts, kg in weighed:
            d = ts.date()
            per_week[d - timedelta(days=d.weekday())] += kg
        weeks = [{"week": s.isoformat(), "t": round(per_week[s] / 1000, 1)} for s in starts]

    # Turnaround: gate in to gate out, ignoring impossible spans.
    def minutes(r):
        if r.gate_in_timestamp and r.gate_out_timestamp:
            m = (r.gate_out_timestamp - r.gate_in_timestamp).total_seconds() / 60
            if 0 < m < 7 * 24 * 60:
                return m
        return None

    spans = [m for m in map(minutes, rows) if m is not None]
    typical = median(spans) if spans else None
    done = sorted((r for r in rows if r.gate_out_timestamp), key=lambda r: r.gate_out_timestamp, reverse=True)
    recent = []
    for r in done[:5]:
        m = minutes(r)
        tone = "err" if r.qa_status == "Quality-Reject" else "warn" if m and typical and m > 2 * typical else "ok"
        recent.append(
            {
                "plate": r.plate_id,
                "partner": r.partner,
                "gate_out": r.gate_out_timestamp.isoformat(),
                "minutes": round(m) if m else None,
                "tone": tone,
            }
        )

    # Partners by tonnage received.
    partners = defaultdict(lambda: {"visits": 0, "kg": 0.0})
    for r in rows:
        p = partners[r.partner or "Unknown"]
        p["visits"] += 1
        p["kg"] += _f(r.net_weight_mt) or 0
    top_partners = sorted(partners.items(), key=lambda kv: kv[1]["kg"], reverse=True)[:5]

    materials = Counter(r.material_desc or "Unknown" for r in rows)
    top_materials = materials.most_common(3)
    other = len(rows) - sum(n for _, n in top_materials)

    sampled = [r for r in rows if r.sampling_status]
    ontime = Counter(r.ontime_status for r in rows if r.ontime_status)
    in_full = Counter(r.in_full for r in rows if r.in_full)
    qa = Counter(r.qa_status for r in rows if r.qa_status)

    return {
        "batch": {
            "id": batch.id,
            "file_name": batch.file_name,
            "row_count": batch.row_count,
            "uploaded_at": batch.uploaded_at.isoformat(),
        },
        "range": {
            "from": min(gate_ins).date().isoformat() if gate_ins else None,
            "to": max(gate_ins).date().isoformat() if gate_ins else None,
        },
        "arrivals": {"total": len(gate_ins), "grid": grid},
        "yard": {
            "in_yard": sum(in_yard.values()),
            "gated_out": sum(1 for r in rows if r.current_status == "Gate-Out"),
            "stages": _top(in_yard, 3),
        },
        "weight": {"total_t": round(sum(kg for _, kg in weighed) / 1000, 1), "weeks": weeks},
        "delivery": {
            "on_time": ontime["On-Time"],
            "delayed": ontime["Delayed"],
            "full": in_full["Full"],
            "not_full": in_full["NotFull"],
        },
        "trucks": {"median_minutes": round(typical) if typical else None, "recent": recent},
        "quality": {
            "approved": qa["Quality-Approved"],
            "rejected": qa["Quality-Reject"],
            "avg_art": _avg([_f(r.art) for r in rows if r.art and r.art > 0]),
        },
        "partners": [
            {"name": name, "visits": p["visits"], "t": round(p["kg"] / 1000, 1)} for name, p in top_partners
        ],
        "materials": {
            "total": len(rows),
            "items": [{"name": n, "count": c} for n, c in top_materials]
            + ([{"name": "Other", "count": other}] if other else []),
        },
        "defects": {
            "samples": len(sampled),
            "items": sorted(
                (
                    {"name": label, "pct": _avg([_f(getattr(r, attr)) for r in sampled]) or 0}
                    for label, attr in DEFECTS
                ),
                key=lambda d: d["pct"],
                reverse=True,
            ),
        },
        "pines": {
            "sizes": _top(Counter(r.pine_size for r in sampled if r.pine_size), 3),
            # Median, not mean: a few samples report thousands of piñas.
            "median_per_sample": median(counts) if (counts := [r.no_of_pines for r in sampled if r.no_of_pines]) else None,
        },
    }
