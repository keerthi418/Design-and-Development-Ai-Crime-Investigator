"""
Knowledge Graph Builder using NetworkX
"""

import networkx as nx


def build_graph(entities, relations):
    """Build an undirected NetworkX graph from entities and relations."""
    G = nx.Graph()

    for ent in entities:
        node_id = ent["text"]
        G.add_node(
            node_id,
            label=ent["text"],
            type=ent["type"],
            id=ent.get("id", "")
        )

    for rel in relations:
        source = rel["source"]
        target = rel["target"]
        if source not in G:
            G.add_node(source, label=source, type="ENTITY")
        if target not in G:
            G.add_node(target, label=target, type="ENTITY")

        G.add_edge(
            source,
            target,
            relation=rel.get("relation", "related_to"),
            reason=rel.get("reason", ""),
            confidence=rel.get("confidence", 0.7)
        )

    return G


def graph_to_cytoscape(G):
    """Convert NetworkX graph to Cytoscape.js JSON format."""
    nodes = []
    edges = []

    color_map = {
        "PERSON": "#e74c3c",      # Red
        "LOCATION": "#3498db",    # Blue
        "EVIDENCE": "#95a5a6",    # Grey
        "TIME": "#f39c12",        # Orange
        "ENTITY": "#9b59b6"
    }

    for node, data in G.nodes(data=True):
        ntype = data.get("type", "ENTITY")
        nodes.append({
            "data": {
                "id": node,
                "label": data.get("label", node),
                "type": ntype,
                "color": color_map.get(ntype, "#9b59b6")
            }
        })

    for i, (u, v, data) in enumerate(G.edges(data=True)):
        edges.append({
            "data": {
                "id": f"e{i}",
                "source": u,
                "target": v,
                "label": data.get("relation", "related_to"),
                "reason": data.get("reason", ""),
                "confidence": data.get("confidence", 0.7)
            }
        })

    return {"nodes": nodes, "edges": edges}


def get_graph_stats(G):
    """Return basic graph statistics."""
    return {
        "nodes": G.number_of_nodes(),
        "edges": G.number_of_edges(),
        "connected": nx.is_connected(G) if G.number_of_nodes() > 0 else False,
        "components": nx.number_connected_components(G) if G.number_of_nodes() > 0 else 0
    }
