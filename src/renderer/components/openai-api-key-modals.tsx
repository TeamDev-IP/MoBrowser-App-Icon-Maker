import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from "react"
import { ExternalLink, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ipc } from "@/gen/ipc"
import { Input } from "@/components/ui/input"

const OPENAI_API_KEYS_HELP_URL = "https://platform.openai.com/api-keys"

export type OpenAIApiKeyManageReason = "settings" | "authError"

function openOpenAIApiKeysHelp() {
  ipc.app.OpenExternalUrl({ url: OPENAI_API_KEYS_HELP_URL }).catch(() => {})
}

/** Returns null on success; otherwise an error string for the UI. */
async function persistOpenAIApiKey(key: string): Promise<string | null> {
  const trimmed = key.trim()
  try {
    const res = await ipc.app.SetOpenAIApiKey({ apiKey: trimmed })
    return res.error || null
  } catch {
    return "Could not save the API key. Try again."
  }
}

function ApiKeyModalShell({
  titleId,
  title,
  headerTrailing,
  children,
  footer,
}: {
  titleId: string
  title: string
  headerTrailing?: ReactNode
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="relative w-[420px] max-w-[calc(100vw-32px)] rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex justify-between px-4 pt-4">
            <h2 id={titleId} className="font-medium text-foreground place-content-center">{title}</h2>
          {headerTrailing != null && (
            <div className="shrink-0 flex items-center">{headerTrailing}</div>
          )}
        </div>
        {children}
        <div className="flex items-center justify-between gap-3 px-4 pb-4">
          <button
            type="button"
            onClick={openOpenAIApiKeysHelp}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary/60 hover:bg-secondary transition-colors shrink-0"
            aria-label="Open OpenAI API keys in your browser"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden />
            Open API Keys
          </button>
          {footer}
        </div>
      </div>
    </div>
  )
}

/** Blocking first launch: no saved key yet. Empty field, not the same as preferences. */
export function OpenAIApiKeyStartupModal({ onSaved }: { onSaved: () => void }) {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = useCallback(async () => {
    const key = value.trim()
    if (!key) {
      setError("Enter your API key.")
      return
    }
    setBusy(true)
    setError(null)
    const errMsg = await persistOpenAIApiKey(key)
    setBusy(false)
    if (errMsg) {
      setError(errMsg === "API key cannot be empty." ? "Enter your API key." : errMsg)
    } else {
      onSaved()
    }
  }, [value, onSaved])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <ApiKeyModalShell
      titleId="openai-api-key-startup-title"
      title="Add your OpenAI API key"
      footer={
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="h-8 px-4 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
        >
          {busy ? "Saving…" : "Continue"}
        </button>
      }
    >
      <div className="px-4 py-3 space-y-2">
      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
      Icon generation uses OpenAI. Paste a key below; it is stored only in this app&apos;s
      preferences on your computer.
      </p>
        <Input
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          className="font-mono text-xs h-9"
        />
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    </ApiKeyModalShell>
  )
}

/** View or change the key already saved in preferences. */
export function OpenAIApiKeyManageModal({
  reason,
  onClose,
}: {
  reason: OpenAIApiKeyManageReason
  onClose: (saved: boolean) => void
}) {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ipc.app
      .GetStoredOpenAIApiKey({})
      .then((r) => {
        setValue(r.apiKey ?? "")
      })
      .catch(() => {})
  }, [])

  const submit = useCallback(async () => {
    const key = value.trim()
    if (!key) {
      setError("Enter your API key.")
      return
    }
    setBusy(true)
    setError(null)
    const errMsg = await persistOpenAIApiKey(key)
    setBusy(false)
    if (errMsg) {
      setError(errMsg === "API key cannot be empty." ? "Enter your API key." : errMsg)
    } else {
      onClose(true)
    }
  }, [value, onClose])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      void submit()
    }
  }

  const title =
    reason === "authError" ? "Update OpenAI API key" : "OpenAI API key"
  const description =
    reason === "authError" ? (
      <>
        OpenAI rejected the last request (often an invalid, expired, or mistyped key). Enter a valid
        key below; it replaces the one saved in this app&apos;s preferences.
      </>
    ) : (
      <>
        Here's your API key. Edit it and save to update it.
      </>
    )

  return (
    <ApiKeyModalShell
      titleId={reason === "authError" ? "openai-api-key-update-title" : "openai-api-key-manage-title"}
      title={title}
      headerTrailing={
        <button
          type="button"
          disabled={busy}
          onClick={() => onClose(false)}
          className={cn(
            "flex items-center justify-center h-8 w-8 rounded-md",
            "text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors",
            "disabled:opacity-50 disabled:pointer-events-none"
          )}
          aria-label="Close"
        >
          <X className="w-4 h-4" strokeWidth={2} />
        </button>
      }
      footer={
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="h-8 px-4 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      }
    >
      <div className="px-4 py-4 space-y-2">
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{description}</p>
        <Input
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          className="font-mono text-xs h-9"
        />
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    </ApiKeyModalShell>
  )
}
