# AI Crime Investigator

Explainable AI system for crime investigation support.

## Features
- NLP Entity & Relation Extraction
- Knowledge Graph (NetworkX)
- BFS / DFS / A* Path Search
- Bayesian Confidence Scoring
- CSP Contradiction Detection
- Interactive Cytoscape.js Graph
- PDF Report Generation

## How to Run

```bash
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Open: http://127.0.0.1:8000

## Sample Case
Use the text in `data/sample_cases/case1.txt`
