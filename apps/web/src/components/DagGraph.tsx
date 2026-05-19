import { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Position,
  MarkerType,
  type Node,
  type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { DagStatus, DagNodeStatus } from '../lib/api';

const COL_W = 230;
const ROW_H = 90;

// Four-color status palette (ready folds into the pending bucket — see ADR-008).
const STATUS_STYLE: Record<
  DagNodeStatus,
  { bg: string; border: string; text: string }
> = {
  pending: { bg: '#1e293b', border: '#475569', text: '#cbd5e1' },
  ready: { bg: '#1e293b', border: '#475569', text: '#cbd5e1' },
  active: { bg: '#78350f', border: '#f59e0b', text: '#fde68a' },
  completed: { bg: '#064e3b', border: '#10b981', text: '#a7f3d0' },
  failed: { bg: '#4c0519', border: '#f43f5e', text: '#fecdd3' },
};

/**
 * Layout is derived from the backend topological `layers` (no force-directed
 * simulation): layer index → column, position-in-layer → row, each layer
 * vertically centred. Deterministic, no jitter on re-poll. See ADR-008.
 */
function buildGraph(
  dag: DagStatus,
  selectedId: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const statusOf = new Map(dag.nodes.map((n) => [n.id, n.status]));
  const tallest = Math.max(1, ...dag.layers.map((l) => l.length));

  const nodes: Node[] = [];
  dag.layers.forEach((layer, col) => {
    const offset = ((tallest - layer.length) * ROW_H) / 2;
    layer.forEach((nodeId, row) => {
      const status = statusOf.get(nodeId) ?? 'pending';
      const s = STATUS_STYLE[status];
      const selected = nodeId === selectedId;
      nodes.push({
        id: nodeId,
        position: { x: col * COL_W, y: offset + row * ROW_H },
        data: { label: `${nodeId}\n${status}` },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        className: status === 'active' ? 'animate-pulse' : undefined,
        style: {
          background: s.bg,
          color: s.text,
          border: `2px solid ${selected ? '#818cf8' : s.border}`,
          borderRadius: 8,
          fontSize: 12,
          width: 150,
          whiteSpace: 'pre-line',
          boxShadow: selected ? '0 0 0 3px rgba(129,140,248,0.35)' : undefined,
        },
      });
    });
  });

  const edges: Edge[] = [];
  for (const n of dag.nodes) {
    for (const dep of n.dependsOn) {
      const targetActive = statusOf.get(n.id) === 'active';
      edges.push({
        id: `${dep}->${n.id}`,
        source: dep,
        target: n.id,
        animated: targetActive,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: targetActive ? '#f59e0b' : '#475569' },
      });
    }
  }

  return { nodes, edges };
}

export function DagGraph({
  dag,
  selectedId,
  onSelect,
}: {
  dag: DagStatus;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { nodes, edges } = useMemo(
    () => buildGraph(dag, selectedId),
    [dag, selectedId],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
      minZoom={0.1}
    >
      <Background color="#1e293b" gap={20} />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => (n.style?.background as string) ?? '#1e293b'}
        maskColor="rgba(2,6,23,0.7)"
        style={{ background: '#0f172a' }}
      />
    </ReactFlow>
  );
}
