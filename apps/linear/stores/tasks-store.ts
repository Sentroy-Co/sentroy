import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { IssuePriority } from "@/lib/linear/types"

export type DraftTaskForm = {
  title: string
  description: string
  priority: IssuePriority
  teamId: string
  stateId: string
  assigneeId: string
  labelIds: string[]
}

type TasksState = {
  draftForm: DraftTaskForm
  setDraft: (patch: Partial<DraftTaskForm>) => void
  toggleLabel: (labelId: string) => void
  clearDraft: () => void
}

const EMPTY_DRAFT: DraftTaskForm = {
  title: "",
  description: "",
  priority: 0,
  teamId: "",
  stateId: "",
  assigneeId: "",
  labelIds: [],
}

const isBrowser = typeof window !== "undefined"

export const useTasksStore = create<TasksState>()(
  persist(
    (set) => ({
      draftForm: EMPTY_DRAFT,
      setDraft: (patch) =>
        set((s) => ({ draftForm: { ...s.draftForm, ...patch } })),
      toggleLabel: (labelId) =>
        set((s) => {
          const has = s.draftForm.labelIds.includes(labelId)
          return {
            draftForm: {
              ...s.draftForm,
              labelIds: has
                ? s.draftForm.labelIds.filter((id) => id !== labelId)
                : [...s.draftForm.labelIds, labelId],
            },
          }
        }),
      clearDraft: () => set({ draftForm: EMPTY_DRAFT }),
    }),
    {
      name: "linear-lite:tasks",
      storage: createJSONStorage(() =>
        isBrowser ? sessionStorage : (undefined as unknown as Storage),
      ),
      partialize: (s) => ({ draftForm: s.draftForm }),
    },
  ),
)
