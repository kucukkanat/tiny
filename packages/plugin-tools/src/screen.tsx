import { Button } from '@tiny/ui/components/button'
import { Input } from '@tiny/ui/components/input'
import { Label } from '@tiny/ui/components/label'
import { Switch } from '@tiny/ui/components/switch'
import { Textarea } from '@tiny/ui/components/textarea'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router'
import { compile, type Parameter } from './compile'
import { TEMPLATES } from './templates'
import {
  isToolName,
  newTool,
  removeTool,
  saveTool,
  useTools,
  type UserTool,
} from './tool'

/** `/#/tools` is the list, `/#/tools/:id` is the one you're writing. */
export function ToolsScreen() {
  return (
    <Routes>
      <Route index element={<ToolList />} />
      <Route path=":id" element={<ToolEditor />} />
      <Route path="*" element={<Navigate to="/tools" replace />} />
    </Routes>
  )
}

function ToolList() {
  const tools = useTools()
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <Button
        type="button"
        data-testid="tool-new"
        className="h-control"
        onClick={() => {
          const tool = newTool()
          saveTool(tool)
          void navigate(tool.id)
        }}
      >
        <PlusIcon /> New tool
      </Button>

      {tools.length === 0 ? (
        <p className="text-muted-foreground text-sm text-balance">
          A tool is a function the model can call mid-answer — fetch something, work
          something out, ask you. Write one and it can use it.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tools.map((tool) => (
            <ToolRow key={tool.id} tool={tool} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ToolRow({ tool }: { tool: UserTool }) {
  const built = useMemo(() => compile(tool.source), [tool.source])

  return (
    <li className="border-line bg-surface rounded-card flex items-center gap-2 border p-3">
      <Link to={tool.id} data-testid={`tool-open-${tool.id}`} className="min-w-0 flex-1">
        <span className="block truncate font-medium">{tool.name || 'Untitled'}</span>
        <span className="text-ink-3 block truncate text-sm">
          {built.ok ? built.description || 'No description.' : built.error}
        </span>
      </Link>
      <Switch
        data-testid={`tool-enabled-${tool.id}`}
        checked={tool.enabled}
        onCheckedChange={(enabled) => saveTool({ ...tool, enabled })}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Delete ${tool.name || 'Untitled'}`}
        data-testid={`tool-delete-${tool.id}`}
        onClick={() => removeTool(tool.id)}
      >
        <Trash2Icon />
      </Button>
    </li>
  )
}

function ToolEditor() {
  const { id = '' } = useParams()
  const tools = useTools()
  const tool = tools.find((one) => one.id === id)

  // Deleted from under us, or a link to something that never existed.
  if (!tool) return <Navigate to="/tools" replace />

  return <Editor tool={tool} others={tools.filter((one) => one.id !== id)} />
}

/** What the box compiled to, said out loud under it. */
const summarise = (parameters: readonly Parameter[]) =>
  parameters.length === 0
    ? 'Compiles, and takes nothing.'
    : `Compiles. Takes ${parameters
        .map(({ name, required }) => (required ? `${name} (required)` : name))
        .join(', ')}.`

function Editor({ tool, others }: { tool: UserTool; others: readonly UserTool[] }) {
  const built = useMemo(() => compile(tool.source), [tool.source])
  const navigate = useNavigate()

  const nameIsTaken = others.some((one) => one.name === tool.name)
  const nameIsBad = !isToolName(tool.name)

  // No submit button: every keystroke is already saved, same as Settings.
  return (
    <form className="mx-auto flex w-full max-w-md flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <Label htmlFor="tool-name">Name</Label>
        <Input
          id="tool-name"
          data-testid="tool-name"
          autoComplete="off"
          spellCheck={false}
          className="h-control font-mono"
          aria-invalid={nameIsBad || nameIsTaken}
          value={tool.name}
          onChange={(event) => saveTool({ ...tool, name: event.target.value })}
        />
        <p className="text-muted-foreground text-sm" data-testid="tool-name-hint">
          {nameIsTaken
            ? 'Another tool already answers to this.'
            : nameIsBad
              ? 'Letters, digits, dash and underscore, up to 64.'
              : 'What the model calls to run it.'}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="tool-source">Definition</Label>
          <div className="flex gap-1">
            {TEMPLATES.map(({ label, source }) => (
              <Button
                key={label}
                type="button"
                variant="outline"
                size="sm"
                data-testid={`tool-template-${label.toLowerCase()}`}
                onClick={() => saveTool({ ...tool, source })}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <Textarea
          id="tool-source"
          data-testid="tool-source"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="min-h-72 font-mono text-sm"
          aria-invalid={!built.ok}
          value={tool.source}
          onChange={(event) => saveTool({ ...tool, source: event.target.value })}
        />
        <p className="text-muted-foreground text-sm" data-testid="tool-source-hint">
          {built.ok ? summarise(built.parameters) : built.error}
        </p>
      </fieldset>

      <div className="flex gap-2">
        <Button asChild variant="outline" className="h-control flex-1">
          <Link to="/tools" data-testid="tool-done">
            Done
          </Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-control px-4"
          data-testid="tool-delete"
          onClick={() => {
            removeTool(tool.id)
            void navigate('/tools')
          }}
        >
          Delete
        </Button>
      </div>
    </form>
  )
}
