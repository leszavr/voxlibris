import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Heart } from "lucide-react";
import { ReactionsDisplay } from "./ReactionsDisplay";

interface InteractionPanelProps {
  session: {
    isLive: boolean;
    reactions: any[];
    connectionLostAt?: number | null;
  };
}

export function InteractionPanel({ session }: Readonly<InteractionPanelProps>) {
  const mockChatMessages = [
    { id: "alice", user: "Алиса", msg: "Атмосфера просто потрясающая!", time: "2м" },
    { id: "boris", user: "Борис", msg: "Обожаю эту главу.", time: "1м" }
  ];

  return (
    <aside className="w-80 border-l border-white/10 bg-[#151515] flex flex-col shrink-0">
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <h3 className="font-medium text-stone-400 text-xs uppercase tracking-wider">
          Взаимодействие
        </h3>
        <Badge variant="outline" className="border-amber-500/30 text-amber-500 bg-amber-500/5">
          {session.isLive ? 'В эфире' : 'Ожидание'}
        </Badge>
      </div>

      {/* Реакции */}
      <div className="p-4 border-b border-white/10">
        <ReactionsDisplay 
          reactions={session.reactions}
          className="h-32"
        />
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {mockChatMessages.map((chat) => (
            <ChatMessage key={chat.id} {...chat} />
          ))}
        </div>
      </ScrollArea>

      {/* Индикатор статуса соединения */}
      {session.connectionLostAt && (
        <ConnectionStatus />
      )}

      {/* Reactions Stream */}
      <ReactionsStream />
    </aside>
  );
}

interface ChatMessageProps {
  user: string;
  msg: string;
  time: string;
}

function ChatMessage({ user, msg, time }: Readonly<ChatMessageProps>) {
  return (
    <div className="flex gap-3 animate-in slide-in-from-bottom-2 duration-500">
      <div className="w-8 h-8 rounded-full bg-stone-700 flex items-center justify-center text-xs font-bold text-stone-300">
        {user[0]}
      </div>
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-stone-300">{user}</span>
          <span className="text-xs text-stone-600">{time}</span>
        </div>
        <p className="text-sm text-stone-400 mt-0.5">{msg}</p>
      </div>
    </div>
  );
}

function ConnectionStatus() {
  return (
    <div className="p-4 border-t border-white/10 bg-red-950/20">
      <div className="flex items-center gap-2 text-sm text-red-400">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        Проблемы с соединением...
      </div>
    </div>
  );
}

function ReactionsStream() {
  return (
    <div className="h-24 border-t border-white/10 p-4 relative overflow-hidden">
      <div className="absolute bottom-4 right-4 flex gap-2">
        <div className="animate-bounce delay-75">
          <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
        </div>
        <div className="animate-bounce delay-100">
          <span className="text-xl">👏</span>
        </div>
      </div>
    </div>
  );
}
