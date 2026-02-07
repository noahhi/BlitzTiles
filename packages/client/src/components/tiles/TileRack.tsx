import { useSortable } from '@dnd-kit/sortable';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Tile } from '@blitztiles/shared';
import { useGameStore } from '../../hooks/useGameStore';
import './TileRack.css';

function RackTile({ tile }: { tile: Tile }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tile.id,
    data: { tile, type: 'rack-tile' },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? undefined : transition,
  };

  const placedTiles = useGameStore((s) => s.placedTiles);
  const isPlaced = placedTiles.some((t) => t.id === tile.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rack-tile ${isDragging ? 'dragging' : ''} ${isPlaced ? 'placed' : ''}`}
    >
      <span className="rack-tile-letter">{tile.isBlank ? '' : tile.letter}</span>
      {tile.value > 0 && <span className="rack-tile-value">{tile.value}</span>}
    </div>
  );
}

export function TileRack() {
  const currentHand = useGameStore((s) => s.currentHand);
  const phase = useGameStore((s) => s.phase);
  const tileIds = currentHand.map((t) => t.id);

  const { setNodeRef, isOver } = useDroppable({
    id: 'rack-drop-zone',
    data: { type: 'rack-zone' },
  });

  if (phase !== 'playing') {
    return (
      <div className="tile-rack-container">
        <div className="tile-rack" />
      </div>
    );
  }

  return (
    <div className="tile-rack-container">
      <div ref={setNodeRef} className={`tile-rack ${isOver ? 'rack-drag-over' : ''}`}>
        <SortableContext items={tileIds} strategy={horizontalListSortingStrategy}>
          {currentHand.map((tile) => (
            <RackTile key={tile.id} tile={tile} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
