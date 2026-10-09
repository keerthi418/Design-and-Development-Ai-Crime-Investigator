"""
AI Crime Investigator - FastAPI Backend
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import os
import uuid

from backend.nlp.extractor import extract_entities, extract_relations
from backend.graph.case_graph import build_graph, graph_to_cytoscape, get_graph_stats
from backend.reasoning.search import compare_all
from backend.reasoning.scoring import calculate_confidence, detect_contradictions
from backend.report.pdf_generator import generate_pdf

app = FastAPI(
    title="AI Crime Investigator",
    description="Explainable AI for crime investigation support",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(frontend_path):
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")

# Serve generated PDF reports so the UI can open/download them.
# This only exposes files the PDF generator already writes; no PDF logic lives here.
reports_path = os.path.join(os.path.dirname(__file__), "..", "reports")
if os.path.isdir(reports_path):
    app.mount("/reports", StaticFiles(directory=reports_path), name="reports")


class CaseRequest(BaseModel):
    text: str
    case_id: Optional[str] = None
    start_node: Optional[str] = ""
    target_node: Optional[str] = ""


@app.get("/")
def home():
    index_file = os.path.join(frontend_path, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "AI Crime Investigator API is running", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze")
def analyze_case(req: CaseRequest):
    """
    Full investigation pipeline:
    Text → NLP → Graph → Search → Scoring → Contradictions → PDF
    """
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Case text is required")

    case_id = req.case_id or str(uuid.uuid4())[:8]

    # 1. NLP
    entities = extract_entities(text)
    relations = extract_relations(text, entities)

    # 2. Knowledge Graph
    G = build_graph(entities, relations)
    graph_json = graph_to_cytoscape(G)
    stats = get_graph_stats(G)

    # 3. Contradictions (CSP)
    contradictions = detect_contradictions(text, entities, relations)

    # 4. Confidence Score
    confidence = calculate_confidence(entities, relations, contradictions)

    # 5. Path Search (if start & target given)
    search_results = None
    if req.start_node and req.target_node:
        search_results = compare_all(G, req.start_node, req.target_node)

    # 6. PDF Report
    pdf_path = None
    try:
        pdf_path = generate_pdf(
            case_id=case_id,
            entities=entities,
            relations=relations,
            contradictions=contradictions,
            confidence=confidence,
            search_results=search_results
        )
    except Exception as e:
        pdf_path = f"PDF generation failed: {str(e)}"

    return {
        "case_id": case_id,
        "entities": entities,
        "relations": relations,
        "graph": graph_json,
        "stats": stats,
        "contradictions": contradictions,
        "confidence": confidence,
        "search": search_results,
        "pdf_path": pdf_path,
        "status": "success"
    }


@app.get("/sample")
def get_sample_case():
    """Return a sample case text for demo."""
    sample_path = os.path.join(os.path.dirname(__file__), "..", "data", "sample_cases", "case1.txt")
    if os.path.exists(sample_path):
        with open(sample_path, "r", encoding="utf-8") as f:
            return {"text": f.read()}
    return {
        "text": (
            "Ravi was seen near the warehouse at 10 PM. "
            "A fingerprint was discovered at the warehouse. "
            "Witness B claims Ravi was downtown at 10 PM. "
            "CCTV footage shows a person matching Ravi's description near the warehouse."
        )
    }
