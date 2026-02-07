import type { BoardCell as BoardCellType, BonusType, PlacedTile } from '@blitztiles/shared';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import './BoardCell.css';

interface EdgeFlags {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

interface BoardCellProps {
  cell: BoardCellType;
  pendingTile?: PlacedTile;
  isSelected: boolean;
  isLastMove: boolean;
  pendingEdges?: EdgeFlags;
  lastMoveEdges?: EdgeFlags;
  scorePreview?: number | null;
  onClick: () => void;
}

const BONUS_LABELS: Record<NonNullable<BonusType>, string> = {
  DL: 'DL',
  TL: 'TL',
  DW: 'DW',
  TW: 'TW',
};

export function BoardCell({
  cell,
  pendingTile,
  isSelected,
  isLastMove,
  pendingEdges,
  lastMoveEdges,
  scorePreview,
  onClick,
}: BoardCellProps) {
  const tile = pendingTile || cell.tile;
  const isCenter = cell.row === 7 && cell.col === 7;
  const isPending = !!pendingTile;

  const droppableId = `cell-${cell.row}-${cell.col}`;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: { row: cell.row, col: cell.col },
  });

  const {
    setNodeRef: setDragRef,
    listeners,
    attributes,
    isDragging,
  } = useDraggable({
    id: pendingTile ? `board-${pendingTile.id}` : `cell-${cell.row}-${cell.col}-static`,
    data: { type: 'board-tile' },
    disabled: !pendingTile,
  });

  const classNames = [
    'board-cell',
    cell.bonus && !tile ? `bonus-${cell.bonus.toLowerCase()}` : '',
    isCenter && !tile ? 'center' : '',
    isSelected ? 'selected' : '',
    tile ? 'has-tile' : '',
    isPending ? 'pending' : '',
    isOver ? 'drag-over' : '',
    isLastMove ? 'last-move' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Build inset box-shadow for outer edges of tile groups
  const pendingShadows: string[] = [];
  if (pendingEdges) {
    if (pendingEdges.top) pendingShadows.push('inset 0 2px 0 0 var(--tile-selected)');
    if (pendingEdges.bottom) pendingShadows.push('inset 0 -2px 0 0 var(--tile-selected)');
    if (pendingEdges.left) pendingShadows.push('inset 2px 0 0 0 var(--tile-selected)');
    if (pendingEdges.right) pendingShadows.push('inset -2px 0 0 0 var(--tile-selected)');
  }
  const cellStyle: React.CSSProperties | undefined =
    pendingShadows.length > 0 ? { boxShadow: pendingShadows.join(', ') } : undefined;

  // Last-move outline goes on the ::after pseudo-element (fades via CSS animation)
  const lastMoveStyle: React.CSSProperties | undefined = lastMoveEdges
    ? {
        ['--lm-shadow' as string]: [
          lastMoveEdges.top && 'inset 0 2px 0 0 rgba(255, 171, 0, 0.45)',
          lastMoveEdges.bottom && 'inset 0 -2px 0 0 rgba(255, 171, 0, 0.45)',
          lastMoveEdges.left && 'inset 2px 0 0 0 rgba(255, 171, 0, 0.45)',
          lastMoveEdges.right && 'inset -2px 0 0 0 rgba(255, 171, 0, 0.45)',
        ]
          .filter(Boolean)
          .join(', '),
      }
    : undefined;

  const mergedStyle = cellStyle || lastMoveStyle ? { ...cellStyle, ...lastMoveStyle } : undefined;

  return (
    <div ref={setNodeRef} className={classNames} style={mergedStyle} onClick={onClick}>
      {tile ? (
        <div
          ref={isPending ? setDragRef : undefined}
          {...(isPending ? listeners : undefined)}
          {...(isPending ? attributes : undefined)}
          className={`cell-tile ${isPending ? 'pending-tile' : 'placed-tile'} ${
            isDragging ? 'dragging' : ''
          }`}
        >
          <span className="tile-letter">{tile.designatedLetter || tile.letter}</span>
          {tile.value > 0 && <span className="tile-value">{tile.value}</span>}
        </div>
      ) : (
        <>
          {cell.bonus && <span className="bonus-label">{BONUS_LABELS[cell.bonus]}</span>}
          {isCenter && !cell.bonus && <span className="center-star">★</span>}
        </>
      )}
      {scorePreview != null && <span className="score-badge">+{scorePreview}</span>}
    </div>
  );
}
