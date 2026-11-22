# FastAPI app: file ingestion into yms_records and the dashboard summary endpoint.
# Each upload is its own batch; the dashboard reads only the newest batch.
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import insert

import dashboard
import ingest
from database import Base, SessionLocal, engine
from models import IngestionBatch, User, YmsRecord

MAX_UPLOAD_BYTES = 25 * 1024 * 1024

Base.metadata.create_all(engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/hello")
def hello():
    return {"message": "Hello from FastAPI!"}


@app.get("/api/users")
def list_users():
    with SessionLocal() as db:
        return [{"id": u.id, "username": u.username} for u in db.query(User).all()]


@app.post("/api/ingest")
async def ingest_file(file: UploadFile):
    name = file.filename or "upload"
    if not name.lower().endswith((".xlsx", ".csv")):
        raise HTTPException(400, "Only .xlsx and .csv files are supported.")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File is larger than 25 MB.")
    try:
        sheet, records, unmatched = ingest.parse(name, content)
    except ingest.IngestError as exc:
        raise HTTPException(422, str(exc)) from exc

    with SessionLocal() as db:
        batch = IngestionBatch(file_name=name, sheet_name=sheet, row_count=len(records))
        db.add(batch)
        db.flush()
        if records:
            db.execute(insert(YmsRecord), [{**r, "batch_id": batch.id} for r in records])
        db.commit()
        return {"batch_id": batch.id, "rows": len(records), "sheet": sheet, "unmatched_columns": unmatched}


@app.get("/api/dashboard")
def get_dashboard():
    with SessionLocal() as db:
        return dashboard.build(db)
