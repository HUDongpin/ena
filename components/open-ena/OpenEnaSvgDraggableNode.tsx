"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { OpenEnaNodeDimensionPosition } from "@/lib/open-ena/node-layout";

export interface OpenEnaSvgDraggableNodeProps {
  code: string;
  position: OpenEnaNodeDimensionPosition;
  offset: { x: number; y: number };
  children: ReactNode;
  disabled?: boolean;
  toDimensions: (
    clientX: number,
    clientY: number,
    target: SVGGElement,
  ) => OpenEnaNodeDimensionPosition | null;
  onNodeMove: (code: string, dimensions: OpenEnaNodeDimensionPosition) => void;
}

export default function OpenEnaSvgDraggableNode({
  code,
  position,
  offset,
  children,
  disabled = false,
  toDimensions,
  onNodeMove,
}: OpenEnaSvgDraggableNodeProps) {
  const [dragging, setDragging] = useState(false);
  const pointerIdRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<OpenEnaNodeDimensionPosition | null>(null);
  const startRef = useRef<{
    pointer: OpenEnaNodeDimensionPosition;
    position: OpenEnaNodeDimensionPosition;
  } | null>(null);

  const flushPendingMove = () => {
    frameRef.current = null;
    const dimensions = pendingMoveRef.current;
    pendingMoveRef.current = null;
    if (dimensions) onNodeMove(code, dimensions);
  };

  const cancelPendingMove = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    pendingMoveRef.current = null;
  };

  useEffect(() => () => {
    cancelPendingMove();
    pointerIdRef.current = null;
  }, []);

  const handlePointerMove = (event: PointerEvent<SVGGElement>) => {
    if (disabled || pointerIdRef.current !== event.pointerId) return;
    const dimensions = toDimensions(event.clientX, event.clientY, event.currentTarget);
    const start = startRef.current;
    if (!dimensions || !start) return;
    pendingMoveRef.current = new Map([...start.position].map(([dimension, value]) => [
      dimension,
      value + (dimensions.get(dimension) ?? 0) - (start.pointer.get(dimension) ?? 0),
    ]));
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(flushPendingMove);
  };

  const cancelPointerDrag = () => {
    cancelPendingMove();
    pointerIdRef.current = null;
    startRef.current = null;
    setDragging(false);
  };

  const finishPointerDrag = (event: PointerEvent<SVGGElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    flushPendingMove();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerIdRef.current = null;
    startRef.current = null;
    setDragging(false);
  };

  return (
    <g
      className="ena-svg-draggable-node"
      data-ena-node-draggable="true"
      data-ena-node-dragging={dragging}
      data-ena-drag-code={code}
      data-ena-label-position={code}
      transform={`translate(${offset.x} ${offset.y})`}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        const pointer = toDimensions(event.clientX, event.clientY, event.currentTarget);
        if (!pointer) return;
        event.preventDefault();
        event.stopPropagation();
        startRef.current = { pointer, position: new Map(position) };
        pointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={cancelPointerDrag}
      onLostPointerCapture={cancelPointerDrag}
    >
      {children}
    </g>
  );
}
