import type { BoardCell as BoardCellType, BonusType, PlacedTile } from '@blitztiles/shared';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import './BoardCell.css';

interface BoardCellProps {
  cell: BoardCellType;
  pendingTile?: PlacedTile;
  isSelected: boolean;
  isLastMove: boolean;
  onClick: () => void;
}

const BONUS_LABELS: Record<NonNullable<BonusType>, string> = {
  DL: 'DL',
  TL: 'TL',
  DW: 'DW',
  TW: 'TW',
};

export function BoardCell({ cell, pendingTile, isSelected, isLastMove, onClick }: BoardCellProps) {
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

  return (
    <div ref={setNodeRef} className={classNames} onClick={onClick}>
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
    </div>
  );
}
