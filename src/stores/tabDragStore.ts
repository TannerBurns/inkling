import { create } from "zustand";
import type { TabItem } from "./editorGroupStore";

interface TabDragState {
  // Drag state
  isDragging: boolean;
  draggedTab: TabItem | null;
  fromGroupId: string | null;
  
  // Mouse position
  mouseX: number;
  mouseY: number;
  
  // Drop target
  dropTargetGroupId: string | null;
  dropTargetIndex: number | null;
  
  // Actions
  startDrag: (tab: TabItem, fromGroupId: string, x: number, y: number) => void;
  updatePosition: (x: number, y: number) => void;
  setDropTarget: (groupId: string | null, index: number | null) => void;
  endDrag: () => void;
}

export const useTabDragStore = create<TabDragState>((set) => ({
  isDragging: false,
  draggedTab: null,
  fromGroupId: null,
  mouseX: 0,
  mouseY: 0,
  dropTargetGroupId: null,
  dropTargetIndex: null,

  startDrag: (tab, fromGroupId, x, y) => {
    console.log("[TabDragStore] startDrag", { tab, fromGroupId, x, y });
    set({
      isDragging: true,
      draggedTab: tab,
      fromGroupId,
      mouseX: x,
      mouseY: y,
      dropTargetGroupId: null,
      dropTargetIndex: null,
    });
  },

  updatePosition: (x, y) => {
    set({ mouseX: x, mouseY: y });
  },

  setDropTarget: (groupId, index) => {
    set({ dropTargetGroupId: groupId, dropTargetIndex: index });
  },

  endDrag: () => {
    console.log("[TabDragStore] endDrag");
    set({
      isDragging: false,
      draggedTab: null,
      fromGroupId: null,
      dropTargetGroupId: null,
      dropTargetIndex: null,
    });
  },
}));
