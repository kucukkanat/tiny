import { Sidebar, type SidebarChat } from "@tiny/ui";
import { useState } from "react";

const INITIAL: readonly SidebarChat[] = [
  { id: "1", title: "Why is the sky blue?" },
  { id: "2", title: "Refactor the parser" },
];

/** The rail owns its collapsed state; the chat list stays yours. */
export function SidebarExample() {
  const [chats, setChats] = useState(INITIAL);
  const [activeId, setActiveId] = useState<string | undefined>("1");

  return (
    <Sidebar
      title="Tiny"
      chats={chats}
      activeId={activeId}
      onSelect={setActiveId}
      onNew={() => {
        const chat = { id: String(chats.length + 1), title: "Untitled chat" };
        setChats((all) => [chat, ...all]);
        setActiveId(chat.id);
      }}
      onDelete={(id) => {
        setChats((all) => all.filter((chat) => chat.id !== id));
        setActiveId((current) => (current === id ? undefined : current));
      }}
      onSettings={() => console.log("open settings")}
    />
  );
}
