import { create } from "zustand";

interface DragState {
  // The note being dragged
  draggedNoteId: string | null;
  draggedNoteTitle: string | null;
  
  // Mouse position for the drag preview
  mouseX: number;
  mouseY: number;
  
  // Is dragging active?
  isDragging: boolean;
  
  // Actions
  startDrag: (noteId: string, noteTitle: string, x: number, y: number) => void;
  updatePosition: (x: number, y: number) => void;
  endDrag: () => void;
}

export const useDragStore = create<DragState>((set) => ({
  draggedNoteId: null,
  draggedNoteTitle: null,
  mouseX: 0,
  mouseY: 0,
  isDragging: false,
  
  startDrag: (noteId, noteTitle, x, y) => {
    set({
      draggedNoteId: noteId,
      draggedNoteTitle: noteTitle,
      mouseX: x,
      mouseY: y,
      isDragging: true,
    });
  },
  
  updatePosition: (x, y) => {
    set({ mouseX: x, mouseY: y });
  },
  
  endDrag: () => {
    set({
      draggedNoteId: null,
      draggedNoteTitle: null,
      isDragging: false,
    });
  },
}));
