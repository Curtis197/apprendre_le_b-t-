'use client'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { Pencil, Check } from 'lucide-react'

/**
 * Edit mode of the lexicon entry page: the forms and contribution controls stay hidden
 * until the reader taps the pencil, so learners just read.
 * Outside a provider the value is `true`, so these components behave as before everywhere else.
 */
const EditModeContext = createContext<{ editing: boolean; toggle: () => void }>({
  editing: true,
  toggle: () => {},
})

export function EditModeProvider({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState(false)
  return (
    <EditModeContext.Provider value={{ editing, toggle: () => setEditing(e => !e) }}>
      {children}
    </EditModeContext.Provider>
  )
}

export function useEditMode(): boolean {
  return useContext(EditModeContext).editing
}

/** Renders its children (e.g. a server-rendered form) only in edit mode. */
export function EditOnly({ children }: { children: ReactNode }) {
  return useEditMode() ? <>{children}</> : null
}

export function EditToggle() {
  const { editing, toggle } = useContext(EditModeContext)
  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={editing}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        {editing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
        {editing ? 'Terminer' : 'Modifier ou contribuer'}
      </button>
    </div>
  )
}
