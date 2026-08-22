import type { Endpoint, ModelSpec } from "@tiny/ai";
import { listModels } from "@tiny/ai";
import {
  endpointOf,
  modelSpec,
  modelsOf,
  Panels,
  PluginPage,
  Slot,
  StatusBar,
  settingsComplete,
  usePluginExtensions,
  usePluginHost,
  usePluginProviders,
  usePluginRoutes,
  usePluginTools,
  useProvideApp,
  Widgets,
} from "@tiny/plugin";
import { type ModelOption, PromptBar, Sidebar, type SidebarLink } from "@tiny/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Route, Routes, useLocation, useMatch, useNavigate } from "react-router";
import {
  type Conversation,
  deleteConversation,
  getConversation,
  listConversations,
  putConversation,
} from "./conversations.ts";
import { loadSettings, OWN_ENDPOINT, type Settings, saveSettings } from "./settings.ts";
import { Thread } from "./Thread.tsx";
import { useChat } from "./useChat.ts";

// A picker value addresses model + endpoint; the separator stays behind these two helpers.
const optionValue = (providerId: string, model: string) => `${providerId}\u0000${model}`;
const parseOption = (value: string): { providerId: string; model: string } => {
  const at = value.indexOf("\u0000");
  return at === -1
    ? { providerId: OWN_ENDPOINT, model: value }
    : { providerId: value.slice(0, at), model: value.slice(at + 1) };
};

/** The assembled chat application, wired to the plugin host. Expects a `PluginHost`
 * and a router above it — reach for `TinyApp` unless you own either. */
export function ChatShell({ title = "Tiny" }: { readonly title?: string | undefined } = {}) {
  // Mounted above the routes, so the id must be read off the location, not params.
  const id = useMatch("/c/:id")?.params.id;
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings | undefined>(loadSettings);
  const [ownModels, setOwnModels] = useState<readonly string[]>([]);
  const [chats, setChats] = useState<readonly Conversation[]>([]);
  const { runCommand, editorText, setEditorText, ready } = usePluginHost();

  // Live state: a provider may be registered after startup, e.g. from a command handler.
  const providers = usePluginProviders();

  const pages = usePluginRoutes();
  const links = useMemo<readonly SidebarLink[]>(
    () =>
      pages.flatMap(({ path, options: { label, icon } }) =>
        label === undefined ? [] : [{ id: path, label, ...(icon === undefined ? {} : { icon }) }],
      ),
    [pages],
  );
  const [providerModels, setProviderModels] = useState<ReadonlyMap<string, readonly string[]>>(
    new Map(),
  );
  const [endpoint, setEndpoint] = useState<Endpoint | undefined>(undefined);

  const refreshChats = useCallback(() => {
    void listConversations().then(setChats);
  }, []);
  useEffect(refreshChats, [refreshChats]);

  // Stable: an inline arrow gives `send` a new identity every render and spins the host.
  const onConversationCreated = useCallback(
    (createdId: string) => {
      navigate(`/c/${createdId}`);
      refreshChats();
    },
    [navigate, refreshChats],
  );

  // What the selected model speaks; providers may override the api per model.
  const selectedSpec = useMemo<ModelSpec>(() => {
    const providerId = settings?.providerId;
    if (providerId === undefined || providerId === OWN_ENDPOINT)
      return settings?.api === undefined ? {} : { api: settings.api };
    const entry = providers.find((candidate) => candidate.id === providerId);
    return entry === undefined ? {} : modelSpec(entry.config, settings?.model ?? "");
  }, [settings, providers]);

  const chat = useChat({
    conversationId: id,
    endpoint,
    model: settings?.model ?? "",
    onConversationCreated,
    extensions: usePluginExtensions(),
    tools: usePluginTools(),
    modelSpec: selectedSpec,
  });

  // A failure here is non-fatal (the saved model still works); it only empties the list.
  useEffect(() => {
    if (!settingsComplete(settings)) return;
    listModels(settings).then(setOwnModels, () => setOwnModels([]));
  }, [settings]);

  // One unreachable provider contributes no models rather than emptying the picker.
  useEffect(() => {
    let live = true;
    Promise.all(
      providers.map(
        async (entry) => [entry.id, await modelsOf(entry.config).catch(() => [])] as const,
      ),
    ).then((pairs) => {
      if (live) setProviderModels(new Map(pairs));
    });
    return () => {
      live = false;
    };
  }, [providers]);

  // Which endpoint the conversation streams through; absent providerId = the user's own.
  useEffect(() => {
    if (settings === undefined) return setEndpoint(undefined);
    const providerId = settings.providerId;
    if (providerId === undefined || providerId === OWN_ENDPOINT)
      return setEndpoint(
        settingsComplete(settings)
          ? {
              baseUrl: settings.baseUrl,
              apiKey: settings.apiKey,
              ...(settings.api === undefined ? {} : { api: settings.api }),
            }
          : undefined,
      );

    const entry = providers.find((candidate) => candidate.id === providerId);
    if (entry === undefined) return setEndpoint(undefined);

    let live = true;
    // `apiKey` may be a thunk that prompts, so resolving it is asynchronous.
    endpointOf(entry.config).then(
      (resolved) => {
        if (live) setEndpoint(resolved);
      },
      () => {
        if (live) setEndpoint(undefined);
      },
    );
    return () => {
      live = false;
    };
  }, [settings, providers]);

  // Grouped only once there is more than one endpoint to tell apart.
  const models = useMemo<readonly ModelOption[]>(() => {
    const grouped = providers.length > 0;
    return [
      ...ownModels.map((model) => ({
        value: optionValue(OWN_ENDPOINT, model),
        label: model,
        ...(grouped ? { group: "Your endpoint" } : {}),
      })),
      ...providers.flatMap((entry) =>
        (providerModels.get(entry.id) ?? []).map((model) => ({
          value: optionValue(entry.id, model),
          label: model,
          group: entry.config.name,
        })),
      ),
    ];
  }, [ownModels, providers, providerModels]);

  const selectedModel =
    settings === undefined ? "" : optionValue(settings.providerId ?? OWN_ENDPOINT, settings.model);
  const canSend = endpoint !== undefined && (settings?.model ?? "") !== "";

  useEffect(() => {
    if (chat.streaming === undefined) refreshChats();
  }, [chat.streaming, refreshChats]);

  const updateSettings = useCallback((next: Settings) => {
    saveSettings(next);
    setSettings(next);
  }, []);

  const sessionName = chats.find((conversation) => conversation.id === id)?.title;

  /** `tiny.setSessionName()` — renames the conversation the user is looking at. */
  const setSessionName = useCallback(
    (name: string) => {
      if (id === undefined) return;
      void getConversation(id).then((conversation) => {
        if (conversation === undefined) return;
        void putConversation({ ...conversation, title: name }).then(refreshChats);
      });
    },
    [id, refreshChats],
  );

  const remove = async (chatId: string) => {
    await deleteConversation(chatId);
    refreshChats();
    if (chatId === id) navigate("/");
  };

  // Published into the plugin host; memoised because the host stores it as state.
  useProvideApp(
    useMemo(
      () => ({
        messages: chat.messages,
        streaming: chat.streaming,
        settings,
        signal: undefined,
        send: (text: string) => void chat.send(text),
        stop: chat.stop,
        updateSettings,
        navigate: (path: string) => navigate(path),
        sessionName,
        setSessionName,
      }),
      [
        chat.messages,
        chat.streaming,
        chat.send,
        chat.stop,
        settings,
        updateSettings,
        navigate,
        sessionName,
        setSessionName,
      ],
    ),
  );

  const empty = chat.messages.length === 0 && chat.streaming === undefined;

  const thread = (
    <main className="flex min-w-0 flex-1 flex-col bg-page">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4">
          {empty ? (
            <div className="flex h-full min-h-[60vh] items-end justify-center pb-6">
              <p className="text-xl text-ink-3">Ask anything</p>
            </div>
          ) : (
            <Thread messages={chat.messages} streaming={chat.streaming} error={chat.error} />
          )}
        </div>
      </div>
      <div className="mx-auto w-full max-w-2xl px-4 pb-4">
        <Widgets placement="aboveEditor" />
        <PromptBar
          onSend={(text) => void chat.send(text)}
          busy={chat.streaming !== undefined}
          onStop={chat.stop}
          models={models}
          model={selectedModel}
          onModelChange={(value) => {
            if (settings === undefined) return;
            const { providerId, model } = parseOption(value);
            updateSettings({
              ...settings,
              model,
              // The user's own endpoint is the absence of a provider.
              ...(providerId === OWN_ENDPOINT ? { providerId: undefined } : { providerId }),
            });
          }}
          disabled={!canSend}
          placeholder={canSend ? "Write a message…" : "Configure your endpoint first"}
          actions={<Slot name="composer.actions" />}
          text={editorText}
          onTextChange={setEditorText}
        />
        <Widgets placement="belowEditor" />
        <StatusBar />
      </div>
    </main>
  );

  return (
    <div className="flex h-full bg-canvas">
      <Sidebar
        title={title}
        chats={chats.map(({ id: chatId, title }) => ({ id: chatId, title }))}
        activeId={id}
        onSelect={(chatId) => navigate(`/c/${chatId}`)}
        onNew={() => navigate("/")}
        onDelete={(chatId) => void remove(chatId)}
        onSettings={() => void runCommand("settings")}
        links={links}
        activeLinkId={pathname}
        onLink={(path) => navigate(path)}
        defaultCollapsed={window.innerWidth < 640}
        footer={<Slot name="sidebar.footer" />}
      />

      {/* App routes first: React Router breaks specificity ties by declaration order,
          and `registerRoute` canonicalises paths so a plugin cannot dodge the tie. */}
      <Routes>
        <Route path="/" element={thread} />
        <Route path="/c/:id" element={thread} />
        {pages.map((entry) => (
          <Route key={entry.path} path={entry.path} element={<PluginPage entry={entry} />} />
        ))}
        {/* Until the factories run, a bookmarked plugin URL must not answer with the
            chat — the fallback holds the layout with an empty page instead. */}
        <Route path="*" element={ready ? thread : <main className="min-w-0 flex-1 bg-page" />} />
      </Routes>

      <Panels />

      <Slot name="app.overlays" />
    </div>
  );
}
