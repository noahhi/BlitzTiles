import './BlankTilePicker.css';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface BlankTilePickerProps {
  onSelect: (letter: string) => void;
  onCancel: () => void;
}

export function BlankTilePicker({ onSelect, onCancel }: BlankTilePickerProps) {
  return (
    <div className="blank-picker-overlay" onClick={onCancel}>
      <div className="blank-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="blank-picker-title">Choose a letter</div>
        <div className="blank-picker-grid">
          {LETTERS.map((letter) => (
            <button key={letter} className="blank-picker-letter" onClick={() => onSelect(letter)}>
              {letter}
            </button>
          ))}
        </div>
        <button className="blank-picker-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
