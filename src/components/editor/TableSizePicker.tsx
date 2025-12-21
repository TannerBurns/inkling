import { useState, useCallback } from "react";

interface TableSizePickerProps {
  onSelect: (rows: number, cols: number) => void;
  onClose: () => void;
}

const MAX_ROWS = 10;
const MAX_COLS = 10;

/**
 * A grid picker for selecting table dimensions
 * Hover over cells to select the desired rows x columns
 */
export function TableSizePicker({ onSelect, onClose }: TableSizePickerProps) {
  const [hoveredRows, setHoveredRows] = useState(0);
  const [hoveredCols, setHoveredCols] = useState(0);

  const handleCellHover = useCallback((row: number, col: number) => {
    setHoveredRows(row);
    setHoveredCols(col);
  }, []);

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      onSelect(row, col);
      onClose();
    },
    [onSelect, onClose]
  );

  return (
    <div
      className="rounded-lg border p-3 shadow-lg"
      style={{
        backgroundColor: "var(--color-bg-primary)",
        borderColor: "var(--color-border)",
      }}
    >
      <div
        className="mb-2 text-center text-sm font-medium"
        style={{ color: "var(--color-text-primary)" }}
      >
        {hoveredRows > 0 && hoveredCols > 0
          ? `${hoveredRows} × ${hoveredCols}`
          : "Select table size"}
      </div>

      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${MAX_COLS}, 1fr)`,
        }}
        onMouseLeave={() => {
          setHoveredRows(0);
          setHoveredCols(0);
        }}
      >
        {Array.from({ length: MAX_ROWS }, (_, rowIndex) =>
          Array.from({ length: MAX_COLS }, (_, colIndex) => {
            const row = rowIndex + 1;
            const col = colIndex + 1;
            const isHighlighted = row <= hoveredRows && col <= hoveredCols;

            return (
              <button
                key={`${row}-${col}`}
                className="h-4 w-4 rounded-sm border transition-colors"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: isHighlighted
                    ? "var(--color-accent)"
                    : "var(--color-bg-secondary)",
                }}
                onMouseEnter={() => handleCellHover(row, col)}
                onClick={() => handleCellClick(row, col)}
              />
            );
          })
        )}
      </div>

      <div
        className="mt-2 text-center text-xs"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        Click to insert table
      </div>
    </div>
  );
}

export default TableSizePicker;
