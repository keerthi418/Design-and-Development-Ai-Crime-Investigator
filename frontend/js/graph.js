/**
 * Cytoscape.js knowledge-graph renderer.
 * Consumes the `graph` payload returned by POST /analyze unchanged.
 */

import { escapeHtml, escapeSelector, clampPercent, toast } from "./ui.js";

const TYPE_COLORS = {
  PERSON: "#dc4b4b",
  LOCATION: "#4aa3c9",
  EVIDENCE: "#8b9bb5",
  TIME: "#d99a26",
  ENTITY: "#9b59d6",
};

const PATH_COLOR = "#4dc79a";

export class KnowledgeGraph {
  constructor(container, { onSelect } = {}) {
    this.container = container;
    this.onSelect = onSelect || (() => {});
    this.cy = null;
    this.selectedPath = null;
    this.options = {
      layout: "cose",
      showLabels: true,
      physics: true,
    };
  }

  /** Render (or re-render) the graph. */
  render(graphData, stats) {
    this.destroy();

    const nodes = (graphData?.nodes || []).map((n) => ({
      ...n,
      data: {
        ...n.data,
        color: n.data.color || TYPE_COLORS[n.data.type] || TYPE_COLORS.ENTITY,
      },
    }));
    const edges = graphData?.edges || [];

    if (!nodes.length) {
      this.container.innerHTML = `
        <div class="graph-stage__overlay">
          <div class="empty">
            ${iconEmpty()}
            <strong>No graph to display</strong>
            <p>The narrative produced no extractable entities or relationships.</p>
          </div>
        </div>`;
      return;
    }

    this.container.innerHTML = `
      <div class="graph-canvas"></div>
      <div class="graph-legend">
        <b>Entity types</b>
        ${legendRow("PERSON", "Person")}
        ${legendRow("LOCATION", "Location")}
        ${legendRow("EVIDENCE", "Evidence")}
        ${legendRow("TIME", "Time")}
      </div>
      ${
        stats
          ? `<div class="graph-stats">
               <div><span>Nodes</span><b>${stats.nodes}</b></div>
               <div><span>Edges</span><b>${stats.edges}</b></div>
               <div><span>Components</span><b>${stats.components}</b></div>
               <div><span>Linked</span><b>${stats.connected ? "yes" : "no"}</b></div>
             </div>`
          : ""
      }
      <div class="node-inspector" id="node-inspector" hidden></div>`;

    const canvas = this.container.querySelector(".graph-canvas");

    this.cy = cytoscape({
      container: canvas,
      elements: { nodes, edges },
      minZoom: 0.25,
      maxZoom: 3,
      wheelSensitivity: 0.22,
      style: this.buildStyle(),
      layout: { name: "preset" },
    });

    this.applyLayout(this.options.layout, false);
    this.wireEvents(canvas);
  }

  buildStyle() {
    const showLabels = this.options.showLabels;
    return [
      {
        selector: "node",
        style: {
          "background-color": "data(color)",
          "border-color": "#0a0f1c",
          "border-width": 2,
          "label": showLabels ? "data(label)" : "",
          "color": "#e4eaf4",
          "font-family": "IBM Plex Sans, sans-serif",
          "font-size": 10,
          "font-weight": 600,
          "text-valign": "bottom",
          "text-halign": "center",
          "text-margin-y": 6,
          "text-background-color": "#070b14",
          "text-background-opacity": 0.85,
          "text-background-padding": 3,
          "text-background-shape": "roundrectangle",
          "width": 34,
          "height": 34,
          "overlay-opacity": 0,
        },
      },
      {
        selector: "node[type = 'PERSON']",
        style: { "shape": "roundrectangle", "width": 42, "height": 42 },
      },
      {
        selector: "node[type = 'LOCATION']",
        style: { "shape": "diamond", "width": 46, "height": 46 },
      },
      {
        selector: "node[type = 'EVIDENCE']",
        style: { "shape": "hexagon", "width": 40, "height": 40 },
      },
      {
        selector: "node[type = 'TIME']",
        style: { "shape": "round-diamond", "width": 36, "height": 36 },
      },
      {
        selector: "node:selected",
        style: {
          "border-color": "#ffffff",
          "border-width": 3,
          "overlay-color": "#2f6feb",
          "overlay-opacity": 0.16,
          "overlay-padding": 8,
        },
      },
      {
        selector: "node.dimmed",
        style: { "opacity": 0.22, "text-opacity": 0.15 },
      },
      {
        selector: "edge",
        style: {
          "width": 1.6,
          "line-color": "#3d4d6b",
          "target-arrow-color": "#3d4d6b",
          "target-arrow-shape": "triangle",
          "arrow-scale": 0.85,
          "curve-style": "bezier",
          "label": showLabels ? "data(label)" : "",
          "font-family": "IBM Plex Mono, monospace",
          "font-size": 8,
          "color": "#7b89a3",
          "text-rotation": "autorotate",
          "text-background-color": "#070b14",
          "text-background-opacity": 0.8,
          "text-background-padding": 2,
          "overlay-opacity": 0,
        },
      },
      {
        selector: "edge.dimmed",
        style: { "opacity": 0.12 },
      },
      {
        selector: "edge:selected",
        style: {
          "line-color": "#8fb4ff",
          "target-arrow-color": "#8fb4ff",
          "width": 2.4,
        },
      },
      {
        selector: ".path-edge",
        style: {
          "line-color": PATH_COLOR,
          "target-arrow-color": PATH_COLOR,
          "width": 3.4,
          "z-index": 10,
          "opacity": 1,
        },
      },
      {
        selector: ".path-node",
        style: {
          "border-color": PATH_COLOR,
          "border-width": 3.5,
          "z-index": 11,
        },
      },
    ];
  }

  wireEvents(canvas) {
    if (!this.cy) return;

    this.cy.on("tap", "node", (evt) => {
      const node = evt.target;
      this.cy.elements().removeClass("dimmed");
      const neighborhood = node.neighborhood().union(node);
      this.cy.elements().difference(neighborhood).addClass("dimmed");
      this.renderInspector(node);
      this.onSelect(node.data());
    });

    this.cy.on("tap", (evt) => {
      if (evt.target === this.cy) {
        this.cy.elements().removeClass("dimmed");
        this.hideInspector();
        this.onSelect(null);
      }
    });

    this.cy.on("mouseover", "node", (evt) => {
      canvas.style.cursor = "pointer";
      evt.target.style("border-color", "#8fb4ff");
    });
    this.cy.on("mouseout", "node", (evt) => {
      canvas.style.cursor = "default";
      if (!evt.target.selected()) evt.target.style("border-color", "#0a0f1c");
    });

    this.cy.on("mouseover", "edge", () => {
      canvas.style.cursor = "pointer";
    });
    this.cy.on("mouseout", "edge", () => {
      canvas.style.cursor = "default";
    });
  }

  renderInspector(node) {
    const box = this.container.querySelector("#node-inspector");
    if (!box) return;

    const type = node.data("type") || "ENTITY";
    const color = node.data("color") || TYPE_COLORS[type];
    const connections = node.neighborhood("node");
    const outgoing = node.connectedEdges();

    box.hidden = false;
    box.innerHTML = `
      <div class="node-inspector__head">
        <div class="grow">
          <div class="node-inspector__label">${escapeHtml(node.data("label") || node.id())}</div>
          <div class="node-inspector__sub">${escapeHtml(node.data("id") || node.id())}</div>
        </div>
        <button class="icon-btn" id="inspector-close" aria-label="Close inspector">
          <svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>
        </button>
      </div>

      <div class="node-inspector__section">Classification</div>
      <div class="row" style="gap:7px">
        <i style="width:9px;height:9px;border-radius:50%;background:${color};display:block"></i>
        <span class="badge badge--${escapeHtml(String(type).toLowerCase())} badge--plain">${escapeHtml(type)}</span>
      </div>

      <div class="node-inspector__section">Correlations (${connections.length})</div>
      <div class="node-inspector__list">
        ${
          outgoing.length
            ? outgoing
                .slice(0, 6)
                .map((edge) => {
                  const other = edge.source().id() === node.id() ? edge.target() : edge.source();
                  const verb = escapeHtml(edge.data("label") || "related_to");
                  const conf = clampPercent(Number(edge.data("confidence") || 0) * 100);
                  return `<div><span class="faint">${verb}</span><b>${escapeHtml(
                    other.data("label") || other.id()
                  )} · ${conf}%</b></div>`;
                })
                .join("")
            : `<div><span class="faint">No direct links recorded.</span></div>`
        }
      </div>`;

    const close = box.querySelector("#inspector-close");
    if (close) {
      close.addEventListener("click", () => {
        this.cy.elements().removeClass("dimmed").unselect();
        this.hideInspector();
      });
    }
  }

  hideInspector() {
    const box = this.container.querySelector("#node-inspector");
    if (box) box.hidden = true;
  }

  /* ---------------- layout + controls ---------------- */

  setLayout(name, animate = true) {
    this.options.layout = name;
    this.applyLayout(name, animate);
  }

  applyLayout(name, animate) {
    if (!this.cy) return;
    const common = { animate, animationDuration: 520, padding: 44, fit: true };

    const layouts = {
      cose: { name: "cose", ...common, nodeRepulsion: 9000, idealEdgeLength: 130, gravity: 0.35, numIter: 900 },
      circle: { name: "circle", ...common, radius: Math.max(160, this.cy.nodes().length * 34) },
      concentric: {
        name: "concentric",
        ...common,
        concentric: (n) => n.data("type") === "PERSON" ? 2 : n.data("type") === "EVIDENCE" ? 1 : 0,
        levelWidth: () => 2,
        minNodeSpacing: 110,
      },
      breadthfirst: { name: "breadthfirst", ...common, directed: false, spacingFactor: 1.1 },
      grid: { name: "grid", ...common, avoidOverlap: true },
    };

    const layout = layouts[name] || layouts.cose;
    this.cy.layout(layout).run();
  }

  toggleLabels() {
    this.options.showLabels = !this.options.showLabels;
    if (!this.cy) return this.options.showLabels;
    this.cy.style(this.buildStyle());
    return this.options.showLabels;
  }

  fit() {
    if (this.cy) this.cy.fit(undefined, 44);
  }

  reset() {
    if (!this.cy) return;
    this.cy.elements().removeClass("dimmed path-edge path-node").unselect();
    this.hideInspector();
    this.selectedPath = null;
    this.fit();
    this.applyLayout(this.options.layout, true);
  }

  /**
   * Highlight an algorithmic path on the graph.
   * `path` is the array of node ids returned by /analyze.
   */
  highlightPath(path) {
    if (!this.cy || !Array.isArray(path) || path.length < 2) {
      this.clearPath();
      return false;
    }

    this.clearPath();
    this.selectedPath = path.slice();

    const selector = path.map((id) => `[id = "${escapeSelector(id)}"]`).join(", ");
    const nodes = this.cy.nodes(selector);
    if (!nodes.length) {
      toast("None of the path nodes exist in the current graph.", { type: "warn" });
      return false;
    }

    nodes.addClass("path-node");
    const edges = nodes.connectedEdges();
    edges.addClass("path-edge");

    this.cy.elements().difference(nodes.union(edges)).addClass("dimmed");
    this.cy.animate({ center: { eles: nodes }, zoom: 1.15 }, { duration: 480 });

    return true;
  }

  clearPath() {
    if (!this.cy) return;
    this.selectedPath = null;
    this.cy.elements().removeClass("path-edge path-node");
    this.cy.elements().removeClass("dimmed");
  }

  focusNode(id) {
    if (!this.cy) return false;
    const node = this.cy.getElementById(id);
    if (!node || node.empty()) return false;
    this.cy.elements().removeClass("dimmed");
    this.cy.elements().difference(node.neighborhood().union(node)).addClass("dimmed");
    node.select();
    this.renderInspector(node);
    this.cy.animate({ center: { eles: node }, zoom: 1.3 }, { duration: 420 });
    return true;
  }

  destroy() {
    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }
    this.selectedPath = null;
  }
}

function legendRow(type, label) {
  return `<span><i style="background:${TYPE_COLORS[type]}"></i>${label}</span>`;
}

function iconEmpty() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="7" r="2.4"/><circle cx="18" cy="18" r="2.4"/>
    <path d="m8.2 16.7 7.6-8.4M8.6 18h6.8"/>
  </svg>`;
}