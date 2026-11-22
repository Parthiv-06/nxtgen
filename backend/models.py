# SQLAlchemy tables: users, plus the NxGen YMS export (yms_records) and its uploads.
# main.py runs create_all, which creates new tables but never alters existing ones.
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)


class IngestionBatch(Base):
    """One uploaded file; every row loaded from it points back here."""

    __tablename__ = "ingestion_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    file_name: Mapped[str] = mapped_column(Text, nullable=False)
    sheet_name: Mapped[str | None] = mapped_column(Text)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    records: Mapped[list["YmsRecord"]] = relationship(
        back_populates="batch", cascade="all, delete-orphan", passive_deletes=True
    )


# Shorthands for the YMS columns below. `comment` holds the exact Excel header,
# so the upload code can map spreadsheet columns to table columns.
def text(header, **kw):
    return mapped_column(Text, comment=header, **kw)


def integer(header):
    return mapped_column(Integer, comment=header)


def qty(header):
    return mapped_column(Numeric(14, 3), comment=header)


def measure(header):
    return mapped_column(Numeric(10, 2), comment=header)


def percent(header):
    return mapped_column(Numeric(6, 2), comment=header)


def day(header):
    return mapped_column(Date, comment=header)


def stamp(header):
    return mapped_column(DateTime, comment=header)


class YmsRecord(Base):
    """One row of the NxGen YMS export: a truck visit from appointment to gate out.
    IDs are text (mixed codes, leading zeros); barcode is not unique, rows repeat."""

    __tablename__ = "yms_records"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    batch_id: Mapped[int] = mapped_column(
        ForeignKey("ingestion_batches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Order and material
    s_no: Mapped[int | None] = integer("S No.")
    barcode: Mapped[str | None] = text("Barcode", index=True)
    plate_id: Mapped[str | None] = text("PlateID")
    batch_number: Mapped[str | None] = text("Batch Number")
    material_id: Mapped[str | None] = text("Material ID")
    material_desc: Mapped[str | None] = text("Material Desc")
    movement_type: Mapped[str | None] = text("Movement Type")
    purchasing_document: Mapped[str | None] = text("Purchasing Document")
    order_no: Mapped[str | None] = text("Order No", index=True)
    order_line_no: Mapped[str | None] = text("OrderLineNo")
    order_qty: Mapped[Decimal | None] = qty("Order Qty")
    scheduled_qty: Mapped[Decimal | None] = qty("ScheduledQty")
    pending_qty: Mapped[Decimal | None] = qty("PendingQty")
    uom: Mapped[str | None] = text("UOM")
    order_date: Mapped[date | None] = day("Order Date")

    # Partner / supplier
    partner_code: Mapped[str | None] = text("Partner Code")
    partner: Mapped[str | None] = text("Partner")
    supplier_type: Mapped[str | None] = text("SupplierType")
    supplier_remarks: Mapped[str | None] = text("SupplierRemarks")
    supplier_art: Mapped[Decimal | None] = measure("SupplierART")
    plant_name: Mapped[str | None] = text("Plant Name")
    storage_location: Mapped[str | None] = text("StorageLocation")
    dispatch_date: Mapped[date | None] = day("Dispatch Date")
    evidences: Mapped[str | None] = text("Evidences")
    ontime_status: Mapped[str | None] = text("Ontime Status")
    tat: Mapped[str | None] = text("TAT")
    in_full: Mapped[str | None] = text("In Full")
    no_exception: Mapped[str | None] = text("No Exception")
    supplied_qty: Mapped[Decimal | None] = qty("Supplied Qty")
    time_slot: Mapped[str | None] = text("TimeSlot")
    appointment_status: Mapped[str | None] = text("Appointment Status")

    # Parking and gate in
    parking_in_status: Mapped[str | None] = text("Parking IN Status")
    parking_in_user: Mapped[str | None] = text("Parking IN User")
    parking_in_timestamp: Mapped[datetime | None] = stamp("Parking In TimeStamp")
    parking_out_status: Mapped[str | None] = text("Parking OUT Status")
    parking_out_user: Mapped[str | None] = text("Parking OUT User")
    parking_out_timestamp: Mapped[datetime | None] = stamp("Parking OUT TimeStamp")
    checklist_status: Mapped[str | None] = text("Checklist Status")
    gate_in_status: Mapped[str | None] = text("Gate IN Status")
    gate_in_user: Mapped[str | None] = text("Gate In User")
    gate_in_timestamp: Mapped[datetime | None] = stamp("Gate In Timestamp")

    # First weighing
    first_weight_status: Mapped[str | None] = text("First Weight Status")
    first_weight_mt: Mapped[Decimal | None] = qty("First Weight MT")
    first_weight_timestamp: Mapped[datetime | None] = stamp("First Weight Timestamp")
    first_weight_user: Mapped[str | None] = text("First Weight User")
    first_weight_scale_id: Mapped[str | None] = text("1st Wt Weigh Scale ID")

    # Sampling (agave piña quality counts and percentages)
    sampling_status: Mapped[str | None] = text("Sampling")
    sampling_user: Mapped[str | None] = text("Sampling User")
    sampling_timestamp: Mapped[datetime | None] = stamp("Sampling Time Stamp")
    sampling_id: Mapped[str | None] = text("Sampling ID")
    low_weight: Mapped[Decimal | None] = measure("Low Weight")
    pine_size: Mapped[str | None] = text("PineSize")
    no_of_pines: Mapped[int | None] = integer("No of Pines")
    pinas_con_jima_alta: Mapped[int | None] = integer("Piñas_con_jima_Alta")
    pinas_con_jima_alta_pct: Mapped[Decimal | None] = percent("Piñas_con_jima_Alta_percentage")
    pinas_deshidratadas: Mapped[int | None] = integer("Piñas_deshidratadas")
    pinas_deshidratadas_pct: Mapped[Decimal | None] = percent("Piñas_deshidratadas_percentage")
    pinas_con_enfermedad: Mapped[int | None] = integer("Piñas_con_enfermedad")
    pinas_con_enfermedad_pct: Mapped[Decimal | None] = percent("Piñas_con_enfermedad_percentage")
    pinas_con_hongo: Mapped[int | None] = integer("Piñas_con_hongo")
    pinas_con_hongo_pct: Mapped[Decimal | None] = percent("Piñas_con_hongo_percentage")
    pinas_con_insectos: Mapped[int | None] = integer("Piñas_con_Insectos")
    pinas_con_insectos_pct: Mapped[Decimal | None] = percent("Piñas_con_Insectos_percentage")

    # Quality
    qa_status: Mapped[str | None] = text("QA Status")
    qa_timestamp: Mapped[datetime | None] = stamp("QA Timestamp")
    qa_remarks: Mapped[str | None] = text("QA Remarks")
    quality_user: Mapped[str | None] = text("Quality User")
    art: Mapped[Decimal | None] = measure("ART")

    # CRT (text: the export has values like "TEST" in CRTART)
    crt_status: Mapped[str | None] = text("CRT Status")
    crt_user: Mapped[str | None] = text("CRT User")
    crt_timestamp: Mapped[datetime | None] = stamp("CRT Timestamp")
    crt_no: Mapped[str | None] = text("CRT No")
    crt_art: Mapped[str | None] = text("CRTART")
    crt_folio: Mapped[str | None] = text("CRTFolio")

    # Second weighing
    second_weight_status: Mapped[str | None] = text("Second Weight Status")
    second_weight_mt: Mapped[Decimal | None] = qty("Second Weight MT")
    second_weight_timestamp: Mapped[datetime | None] = stamp("Second Weight Timestamp")
    second_weight_user: Mapped[str | None] = text("Second Weight User")
    second_weight_scale_id: Mapped[str | None] = text("2nd Wt Weigh Scale ID")
    net_weight_mt: Mapped[Decimal | None] = qty("Net Weight MT")

    # Unloading
    unloading_status: Mapped[str | None] = text("Unloading Status")
    unloading_timestamp: Mapped[datetime | None] = stamp("Unloading Timestamp")
    unloading_remarks: Mapped[str | None] = text("Unloading Remarks")
    unload_user: Mapped[str | None] = text("Unload User")
    dock: Mapped[str | None] = text("Dock")
    unloading_time: Mapped[str | None] = text("UnloadingTime")
    no_of_pallets: Mapped[int | None] = integer("No Of Pallets")
    rejected_pallets: Mapped[int | None] = integer("Rejected Pallets")
    liquid_volume: Mapped[Decimal | None] = qty("Liquid Volume")

    # Gate out and current state
    gate_out_status: Mapped[str | None] = text("Gate OUT Status")
    gate_out_timestamp: Mapped[datetime | None] = stamp("Gate OUT Timestamp")
    gate_out_user: Mapped[str | None] = text("Gate OUT User")
    driver_name: Mapped[str | None] = text("Driver Name")
    current_status: Mapped[str | None] = text("Current Status", index=True)
    current_status_timestamp: Mapped[datetime | None] = stamp("Current Timestamp")

    # Delivery document and grower details
    supply_delivery_doc_no: Mapped[str | None] = text("SupplyDeliveryDocNo")
    delivery_doc_date: Mapped[datetime | None] = stamp("DeliveryDocDate")
    grados_brix: Mapped[Decimal | None] = measure("GradosBrix")
    no_of_pcs: Mapped[int | None] = integer("NoofPCs")
    estimated_weight: Mapped[Decimal | None] = qty("EstimatedWeight")
    property_id: Mapped[str | None] = text("PropertyID")
    partner_address: Mapped[str | None] = text("PartnerAddress")
    municipality: Mapped[str | None] = text("Municipality")
    partner_contact_no: Mapped[str | None] = text("PartnerContactNo")
    partner_email_id: Mapped[str | None] = text("PartnerEmailID")
    no_of_trees: Mapped[int | None] = integer("NoOfTrees")
    year_of_plantation: Mapped[int | None] = integer("YearofPlantation")

    batch: Mapped[IngestionBatch] = relationship(back_populates="records")
