import { create } from "zustand";

type UIState = {
  currentWorkspace: string;
  setCurrentWorkspace: (workspace: string) => void;
};

export const useUIStore = create<UIState>((set) => ({
  currentWorkspace: "Global Banking Ops",
  setCurrentWorkspace: (currentWorkspace) => set({ currentWorkspace })
}));

