"""
Bayesian-inspired Confidence Scoring + CSP Contradiction Detection
"""

import re


def calculate_confidence(entities, relations, contradictions=None):
    """
    Simple explainable confidence score.
    Formula matches the project PPT:
        prior + entities + relations - contradictions
    """
    prior = 0.40
    entity_score = min(len(entities) * 0.04, 0.20)
    relation_score = min(len(relations) * 0.06, 0.25)
    contradiction_penalty = min(len(contradictions or []) * 0.10, 0.30)

    score = prior + entity_score + relation_score - contradiction_penalty
    score = max(0.0, min(score, 1.0))

    return {
        "score": round(score, 2),
        "percentage": round(score * 100),
        "breakdown": {
            "prior": 0.40,
            "entities": round(entity_score, 2),
            "relations": round(relation_score, 2),
            "contradiction_penalty": round(contradiction_penalty, 2)
        }
    }


def detect_contradictions(text, entities, relations):
    """
    Simple CSP-style contradiction detection.
    Looks for same person mentioned at two different places at same time.
    """
    contradictions = []
    if not text:
        return contradictions

    text_lower = text.lower()
    persons = [e["text"] for e in entities if e["type"] == "PERSON"]
    locations = [e["text"] for e in entities if e["type"] == "LOCATION"]
    times = [e["text"] for e in entities if e["type"] == "TIME"]

    # Pattern: person at location A and also at location B around same time
    for person in persons:
        found_locs = []
        for loc in locations:
            # Check if person + location appear close in text
            pat = rf"{re.escape(person.lower())}.{{0,40}}{re.escape(loc.lower())}|{re.escape(loc.lower())}.{{0,40}}{re.escape(person.lower())}"
            if re.search(pat, text_lower):
                found_locs.append(loc)

        if len(found_locs) >= 2:
            # Check if same time is mentioned
            for t in times:
                if t.lower() in text_lower:
                    contradictions.append({
                        "type": "timeline_conflict",
                        "subject": person,
                        "message": f"CONTRADICTION FLAGGED: {person} appears linked to both {found_locs[0]} and {found_locs[1]} around {t}.",
                        "severity": "HIGH",
                        "locations": found_locs,
                        "time": t
                    })
                    break
            else:
                contradictions.append({
                    "type": "location_conflict",
                    "subject": person,
                    "message": f"Possible conflict: {person} is associated with multiple locations: {', '.join(found_locs)}.",
                    "severity": "MEDIUM",
                    "locations": found_locs
                })

    # Explicit denial patterns
    denial_patterns = [
        r"was not (?:at|present|near)",
        r"denied being",
        r"claimed (?:he|she) was (?:elsewhere|not there)",
    ]
    for pat in denial_patterns:
        if re.search(pat, text_lower):
            contradictions.append({
                "type": "denial_vs_evidence",
                "subject": "Unknown",
                "message": "A denial statement was found that may conflict with other evidence.",
                "severity": "MEDIUM"
            })
            break

    return contradictions
