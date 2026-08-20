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

/**
 * A picker entry addresses a model *and* the endpoint it lives on, because the
 * same model id can exist on several. Kept opaque behind these two helpers so
 * the separator never leaks into a comparison somewhere else.
 */
const optionValue = (providerId: string, model: string) => `${providerId}\u0000${model}`;
const parseOption = (value: string): { providerId: string; model: string } => {
  const at = value.indexOf("\u0000");
  return at === -1
    ? { providerId: OWN_ENDPOINT, model: value }
    : { providerId: value.slice(0, at), model: value.slice(at + 1) };
};

export function App() {
  // `useMatch` rather than `useParams`: `App` is the shell now, mounted above
  // the routes rather than by one of them, so the conversation id has to be read
  // off the location instead of arriving as a param.
  const id = useMatch("/c/:id")?.params.id;
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings | undefined>(loadSettings);
  const [ownModels, setOwnModels] = useState<readonly string[]>([]);
  const [chats, setChats] = useState<readonly Conversation[]>([]);
  const { runCommand, editorText, setEditorText, ready } = usePluginHost();

  // Endpoints plugins added with `pi.registerProvider`, and the models each
  // publishes. Live state: a provider may be registered from a command handler
  // after a setup flow, which pi allows and this list has to reflect.
  const providers = usePluginProviders();

  // Pages plugins registered. One that declared a `label` also wants a row in
  // the navigation; one that did not is reached from a command or a button.
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

  // Stable: `useChat` folds this into `send`, which the plugin bridge below
  // depends on. An inline arrow here gives `send` a new identity every render
  // and spins the host.
  const onConversationCreated = useCallback(
    (createdId: string) => {
      navigate(`/c/${createdId}`);
      refreshChats();
    },
    [navigate, refreshChats],
  );

  /**
   * What the selected model speaks. A provider may declare an api for the whole
   * endpoint and override it per model, as pi allows; the user's own endpoint
   * carries its api on the settings object.
   */
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

  // Populate the model picker from the configured endpoint; a failure here is
  // non-fatal (the saved model still works), so it only empties the list.
  useEffect(() => {
    if (!settingsComplete(settings)) return;
    listModels(settings).then(setOwnModels, () => setOwnModels([]));
  }, [settings]);

  // The same, per registered provider. One provider that cannot be reached
  // contributes no models rather than emptying the picker for the others.
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

  /**
   * Which endpoint this conversation streams through. `providerId` names a
   * plugin provider; absent means the user's own endpoint, which is what every
   * settings object saved before providers existed resolves to.
   */
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

    // A provider disappears when its plugin is disabled or removed; the saved
    // model then has nowhere to go until another is picked.
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

  // Grouped only once there is more than one endpoint to tell apart, so a
  // single-endpoint app looks exactly as it did.
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

  /** `pi.setSessionName()` — renames the conversation the user is looking at. */
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

  // Published into the plugin host so plugins can read chat state and act on
  // it. Memoised because the host stores it as state.
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
              // The user's own endpoint is the absence of a provider, which is
              // also how settings saved before providers existed look.
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
        title="Tiny"
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

      {/* Plugin pages replace the thread and nothing else, so the sidebar and
          the rail stay put and there is always a way back. The app's own routes
          are listed first, because React Router breaks a tie in specificity by
          declaration order — and `registerRoute` canonicalises what it stores,
          so a plugin cannot dodge that tie by spelling the app's own path more
          specifically (`/c/:id/`). */}
      <Routes>
        <Route path="/" element={thread} />
        <Route path="/c/:id" element={thread} />
        {pages.map((entry) => (
          <Route key={entry.path} path={entry.path} element={<PluginPage entry={entry} />} />
        ))}
        {/* The fallback answers a path nothing else claimed — but only once the
            factories have run, because until then no plugin page exists yet and
            this would answer a bookmarked plugin URL with the chat. It still
            matches in the meantime, holding the layout with an empty page
            rather than leaving the router with nothing to render. */}
        <Route path="*" element={ready ? thread : <main className="min-w-0 flex-1 bg-page" />} />
      </Routes>

      <Panels />

      <Slot name="app.overlays" />
    </div>
  );
}
