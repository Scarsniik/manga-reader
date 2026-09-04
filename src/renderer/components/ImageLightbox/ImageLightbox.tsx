import React from "react";
import { createPortal } from "react-dom";
import "@/renderer/components/ImageLightbox/style.scss";

type Point = {
  x: number;
  y: number;
};

export type ImageLightboxProps = {
  children: React.ReactNode;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  initialZoom?: number;
  label?: string;
  maxZoom?: number;
  minZoom?: number;
  onClose: () => void;
  onZoomChange?: (zoom: number) => void;
  open: boolean;
  resetKey?: string | number;
  showZoomControls?: boolean;
  wheelZoom?: boolean;
  zoomStep?: number;
};

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(Math.max(value, minimum), maximum)
);

export default function ImageLightbox({
  children,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  initialZoom = 1,
  label,
  maxZoom = 4,
  minZoom = 0.5,
  onClose,
  onZoomChange,
  open,
  resetKey,
  showZoomControls = true,
  wheelZoom = true,
  zoomStep = 0.25,
}: ImageLightboxProps) {
  const normalizedMinZoom = Math.max(0.1, minZoom);
  const normalizedMaxZoom = Math.max(normalizedMinZoom, maxZoom);
  const normalizedInitialZoom = clamp(initialZoom, normalizedMinZoom, normalizedMaxZoom);
  const [zoom, setZoomState] = React.useState(normalizedInitialZoom);
  const [offset, setOffset] = React.useState<Point>({ x: 0, y: 0 });
  const dragStateRef = React.useRef<{
    pointerId: number;
    start: Point;
    offset: Point;
  } | null>(null);

  const setZoom = React.useCallback((nextZoom: number) => {
    const normalizedZoom = clamp(nextZoom, normalizedMinZoom, normalizedMaxZoom);
    setZoomState(normalizedZoom);
    if (normalizedZoom <= 1) setOffset({ x: 0, y: 0 });
    onZoomChange?.(normalizedZoom);
  }, [normalizedMaxZoom, normalizedMinZoom, onZoomChange]);

  const resetView = React.useCallback(() => {
    setZoom(normalizedInitialZoom);
    setOffset({ x: 0, y: 0 });
  }, [normalizedInitialZoom, setZoom]);

  React.useEffect(() => {
    if (!open) return;
    setZoomState(normalizedInitialZoom);
    setOffset({ x: 0, y: 0 });
  }, [normalizedInitialZoom, open, resetKey]);

  React.useEffect(() => {
    if (!open || !closeOnEscape) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [closeOnEscape, onClose, open]);

  if (!open) return null;

  return createPortal(
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={label || "Aperçu agrandi"}
      onMouseDown={(event) => {
        if (closeOnBackdropClick && event.target === event.currentTarget) onClose();
      }}
      onWheel={wheelZoom ? (event) => {
        event.preventDefault();
        setZoom(zoom + (event.deltaY < 0 ? zoomStep : -zoomStep));
      } : undefined}
    >
      <button
        type="button"
        className="image-lightbox__close"
        onClick={onClose}
        aria-label="Fermer l'aperçu"
        title="Fermer l'aperçu"
      >
        ×
      </button>

      <div
        className={["image-lightbox__content", zoom > 1 ? "is-draggable" : ""].join(" ").trim()}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
        onDoubleClick={resetView}
        onPointerDown={(event) => {
          if (event.button !== 0 || zoom <= 1) return;
          dragStateRef.current = {
            pointerId: event.pointerId,
            start: { x: event.clientX, y: event.clientY },
            offset,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          const dragState = dragStateRef.current;
          if (!dragState || dragState.pointerId !== event.pointerId) return;
          setOffset({
            x: dragState.offset.x + event.clientX - dragState.start.x,
            y: dragState.offset.y + event.clientY - dragState.start.y,
          });
        }}
        onPointerUp={(event) => {
          if (dragStateRef.current?.pointerId !== event.pointerId) return;
          dragStateRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          dragStateRef.current = null;
        }}
      >
        {children}
      </div>

      {showZoomControls ? (
        <div className="image-lightbox__controls" onMouseDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            onClick={() => setZoom(zoom - zoomStep)}
            disabled={zoom <= normalizedMinZoom}
            aria-label="Réduire l'image"
          >
            −
          </button>
          <button type="button" className="image-lightbox__zoom-value" onClick={resetView} title="Réinitialiser">
            {Math.round(zoom * 100)} %
          </button>
          <button
            type="button"
            onClick={() => setZoom(zoom + zoomStep)}
            disabled={zoom >= normalizedMaxZoom}
            aria-label="Agrandir l'image"
          >
            +
          </button>
        </div>
      ) : null}

      {label ? <span className="image-lightbox__label">{label}</span> : null}
    </div>,
    document.body,
  );
}
