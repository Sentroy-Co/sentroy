import { create } from "zustand"

interface InboxStore {
  selectedMailboxId: string | null
  selectedEmailId: string | null
  searchQuery: string
  setSelectedMailbox: (id: string | null) => void
  setSelectedEmail: (id: string | null) => void
  setSearchQuery: (query: string) => void
}

export const useInboxStore = create<InboxStore>((set) => ({
  selectedMailboxId: null,
  selectedEmailId: null,
  searchQuery: "",
  setSelectedMailbox: (id) => set({ selectedMailboxId: id }),
  setSelectedEmail: (id) => set({ selectedEmailId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}))
