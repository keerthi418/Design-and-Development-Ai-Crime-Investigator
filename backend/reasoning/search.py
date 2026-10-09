"""
BFS / DFS / A* Path Search for Investigation
"""

from collections import deque
import networkx as nx


def bfs_path(G, start, goal):
    """Breadth-First Search - shortest path (fewest hops)."""
    if start not in G or goal not in G:
        return None, [f"BFS: Node not found ({start} or {goal})"]

    queue = deque([(start, [start])])
    visited = {start}

    while queue:
        current, path = queue.popleft()
        if current == goal:
            log = [f"BFS Path ({len(path)-1} hops):"] + [f"  {path[i]} → {path[i+1]}" for i in range(len(path)-1)]
            return path, log

        for neighbor in G.neighbors(current):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append((neighbor, path + [neighbor]))

    return None, [f"BFS: No path from {start} to {goal}"]


def dfs_path(G, start, goal):
    """Depth-First Search - deep association chain."""
    if start not in G or goal not in G:
        return None, [f"DFS: Node not found ({start} or {goal})"]

    stack = [(start, [start])]
    visited = set()

    while stack:
        current, path = stack.pop()
        if current in visited:
            continue
        visited.add(current)

        if current == goal:
            log = [f"DFS Path ({len(path)-1} hops):"] + [f"  {path[i]} → {path[i+1]}" for i in range(len(path)-1)]
            return path, log

        for neighbor in reversed(list(G.neighbors(current))):
            if neighbor not in visited:
                stack.append((neighbor, path + [neighbor]))

    return None, [f"DFS: No path from {start} to {goal}"]


def astar_path(G, start, goal):
    """A* Search - prefers higher confidence edges."""
    if start not in G or goal not in G:
        return None, [f"A*: Node not found ({start} or {goal})"]

    def cost(u, v, d):
        # Higher confidence = lower cost
        conf = d.get("confidence", 0.7)
        return 1.0 - float(conf)

    try:
        path = nx.astar_path(G, start, goal, weight=cost)
        log = [f"A* Path ({len(path)-1} hops):"] + [f"  {path[i]} → {path[i+1]}" for i in range(len(path)-1)]
        return path, log
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return None, [f"A*: No path from {start} to {goal}"]


def compare_all(G, start, goal):
    """Run BFS, DFS and A* and return comparison."""
    results = {}
    for name, func in [("BFS", bfs_path), ("DFS", dfs_path), ("A*", astar_path)]:
        path, log = func(G, start, goal)
        results[name] = {
            "path": path,
            "length": len(path) - 1 if path else None,
            "found": path is not None,
            "log": log
        }
    return results
