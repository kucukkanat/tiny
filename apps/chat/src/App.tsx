import { listModels } from "@tiny/ai";
import {
  Slot,
  StatusBar,
  usePluginExtensions,
  usePluginHost,
  usePluginTools,
  useProvideApp,
  Widgets,
} from "@tiny/plugin";
import { PromptBar, Sidebar } from "@tiny/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Thread } from "./components/Thread.tsx";
import { useChat } from "./hooks/useChat.ts";
import {
  type Conversation,
  deleteConversation,
  listConversations,
} from "./storage/conversations.ts";
import { loadSettings, type Settings, saveSettings, settingsComplete } from "./storage/settings.ts";

export function App() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings | undefined>(loadSettings);
  const [models, setModels] = useState<readonly string[]>([]);
  const [chats, setChats] = useState<readonly Conversation[]>([]);
  const { runCommand, editorText } = usePluginHost();

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

  const chat = useChat(
    id,
    settings,
    onConversationCreated,
    usePluginExtensions(),
    usePluginTools(),
  );

  // Populate the model picker from the configured endpoint; a failure here is
  // non-fatal (the saved model still works), so it only empties the list.
  useEffect(() => {
    if (!settingsComplete(settings)) return;
    listModels(settings).then(setModels, () => setModels([]));
  }, [settings]);

  useEffect(() => {
    if (chat.streaming === undefined) refreshChats();
  }, [chat.streaming, refreshChats]);

  const updateSettings = useCallback((next: Settings) => {
    saveSettings(next);
    setSettings(next);
  }, []);

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
      }),
      [chat.messages, chat.streaming, chat.send, chat.stop, settings, updateSettings, navigate],
    ),
  );

  const empty = chat.messages.length === 0 && chat.streaming === undefined;

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
        defaultCollapsed={window.innerWidth < 640}
        footer={<Slot name="sidebar.footer" />}
      />

      <main className="flex min-w-0 flex-1 flex-col bg-page">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-4">
            {empty ? (
              <div className="flex h-full min-h-[60vh] items-end justify-center pb-6">
                <p className="text-[15px] text-ink-3">Ask anything</p>
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
            model={settings?.model ?? ""}
            onModelChange={(model) => {
              if (settings !== undefined) updateSettings({ ...settings, model });
            }}
            disabled={!settingsComplete(settings)}
            placeholder={
              settingsComplete(settings) ? "Write a message…" : "Configure your endpoint first"
            }
            actions={<Slot name="composer.actions" />}
            text={editorText}
          />
          <Widgets placement="belowEditor" />
          <StatusBar />
        </div>
      </main>

      <Slot name="app.overlays" />
    </div>
  );
}
