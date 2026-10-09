# 🕵️ Design and Development of AI Crime Investigator

### *Every clue, connected — pinned, threaded, and explained.*

> An explainable AI system that transforms unstructured crime narratives into a connected investigation graph, traces evidentiary paths, flags contradictions, and scores hypothesis strength — built for real investigative support.

---

## 🎯 The Problem

Traditional investigation review depends on **manual reading**.  
As case files grow, critical relationships stay buried, conflicting alibis slip through, and officers lack a structured way to weigh uncertain leads.

| Challenge                        | Impact                                      |
|----------------------------------|---------------------------------------------|
| Implicit evidence relationships  | Hidden links between suspects & evidence    |
| Unweighted uncertain leads       | No mathematical framework to score strength |
| Overlooked contradictions        | Timeline conflicts go unflagged             |
| Lack of reasoning support        | Systems predict, but rarely explain         |

---

## 💡 The Solution

**AI Crime Investigator** converts raw case text into:

```
Raw Statements
      ↓
NLP Extraction (Entities + Relations)
      ↓
Knowledge Graph (NetworkX)
      ↓
Multi-Strategy Search (BFS · DFS · A*)
      ↓
CSP Contradiction Detection
      ↓
Bayesian Confidence Scoring
      ↓
Explainable Dashboard + PDF Report
```

---

## 🧠 Core Capabilities

| Capability                    | Technique                          |
|-------------------------------|------------------------------------|
| Entity & Relation Extraction  | Rule-based NLP                     |
| Case Knowledge Graph          | NetworkX + Cytoscape.js            |
| Investigation Path Search     | BFS, DFS, A*                       |
| Contradiction Detection       | Constraint Satisfaction (CSP)      |
| Evidence Confidence Score     | Bayesian-inspired scoring          |
| Explainable Output            | Path logs + score breakdown + PDF  |

---

## 🖥️ System Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Frontend (Police UI)                │
│  Login · Dashboard · Cases · Investigation · Settings│
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              FastAPI Backend                         │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌───────┐ │
│  │   NLP   │→ │  Graph   │→ │  Search  │→ │ Score │ │
│  └─────────┘  └──────────┘  └──────────┘  └───────┘ │
│       ↓             ↓             ↓            ↓     │
│  Entities     Knowledge     BFS/DFS/A*     Bayesian  │
│  Relations      Graph         Paths          + CSP   │
└─────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer          | Technology                          |
|----------------|-------------------------------------|
| Backend        | Python · FastAPI                    |
| NLP            | Rule-based Entity & Relation Extraction |
| Graph          | NetworkX                            |
| Search         | BFS · DFS · A*                      |
| Reasoning      | Bayesian Scoring · CSP              |
| Frontend       | HTML5 · CSS3 · JavaScript · Cytoscape.js |
| Reporting      | ReportLab (PDF)                     |
| Auth           | Session + TOTP 2FA (planned)        |

---

## 🚀 How to Run

```bash
# Clone
git clone https://github.com/keerthi418/Design-and-Development-Ai-Crime-Investigator.git
cd Design-and-Development-Ai-Crime-Investigator

# Setup
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt

# Run
uvicorn backend.main:app --reload --port 8080
```

Open → [http://127.0.0.1:8080](http://127.0.0.1:8080)

---

## 📂 Project Structure

```
AI_Crime_Investigator/
├── backend/
│   ├── nlp/           → Entity & Relation Extraction
│   ├── graph/         → Knowledge Graph Builder
│   ├── reasoning/     → BFS/DFS/A* + Bayesian + CSP
│   ├── report/        → PDF Generator
│   └── main.py        → FastAPI App
├── frontend/          → Dashboard + Cytoscape UI
├── data/sample_cases/ → Demo case files
└── reports/           → Generated PDF reports
```

---

## 👥 Team

| Name                  | Register No. |
|-----------------------|--------------|
| D. Keerthi Sri        | 241901047    |
| R. Subathra Devi      | 241901113    |

**Degree:** B.E. CSE (Cyber Security)  
**Faculty Guide:** Mrs. R. Divya, Assistant Professor  
**Institution:** Rajalakshmi Engineering College

---

## ⚠️ Disclaimer

This is an **academic investigation-support project**.  
It assists human investigators by organizing and explaining connections — final decisions always remain with the investigating officer.

---

<p align="center">
  <b>From scattered statements → to a connected, explainable case board.</b>
</p>
```
