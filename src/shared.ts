export type ChatMessage = {
  id: string;
  content: string;
  user: string;
  role: "user" | "assistant";
  channelId?: string;
  isPrivate?: boolean;
  recipientId?: string;
  timestamp: number;
};

export type PublicChannel = {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  isActive: boolean;
};

export type Message =
  | {
      type: "add";
      id: string;
      content: string;
      user: string;
      role: "user" | "assistant";
      channelId?: string;
      isPrivate?: boolean;
      recipientId?: string;
      sessionId?: string;
      isAnon?: boolean;
    }
  | {
      type: "update";
      id: string;
      content: string;
      user: string;
      role: "user" | "assistant";
      channelId?: string;
      isPrivate?: boolean;
      recipientId?: string;
      sessionId?: string;
      isAnon?: boolean;
    }
  | {
      type: "all";
      messages: ChatMessage[];
      channelId?: string;
    }
  | {
      type: "name_check";
      name: string;
      sessionId: string;
    }
  | {
      type: "name_check_result";
      available: boolean;
      isOwn: boolean;
      name: string;
    }
  | {
      type: "user_joined";
      name: string;
      sessionId: string;
    }
  | {
      type: "user_left";
      name: string;
      sessionId: string;
    }
  | {
      type: "users_list";
      users: UserInfo[];
    }
  | {
      type: "channels_list";
      channels: PublicChannel[];
    }
  | {
      type: "join_channel";
      channelId: string;
      sessionId: string;
    }
  | {
      type: "leave_channel";
      channelId: string;
      sessionId: string;
    }
  | {
      type: "name_taken";
      name: string;
    }
  | {
      type: "reserve_name";
      name: string;
      sessionId: string;
      isAnon?: boolean;
    }
  | {
      type: "name_reserved";
      name: string;
      sessionId: string;
    }
  | {
      type: "name_reservation_failed";
      name: string;
      reason: string;
    }
  | {
      type: "release_name";
      name: string;
      sessionId: string;
    }
  | {
      type: "open_private_chat";
      recipientId: string;
      sessionId: string;
    }
  | {
      type: "private_messages";
      messages: ChatMessage[];
      recipientId: string;
    }
  | {
      type: "db_cleanup";
      sessionId: string;
    }
  | {
      type: "db_cleanup_result";
      success: boolean;
      message: string;
      removedUsers: number;
      removedMessages: number;
      removedPrivateMessages: number;
    }
  | {
      type: "mark_read";
      sessionId: string;
      chatType: "private" | "channel";
      chatId: string;
    }
  | {
      type: "unread_update";
      sessionId: string;
      chatType: "private" | "channel";
      chatId: string;
      unreadCount: number;
    }
  | {
      type: "private_chats_list";
      sessionId: string;
    }
  | {
      type: "private_chats_list";
      chats: PrivateChatInfo[];
    };

export type UserInfo = {
  name: string;
  sessionId: string;
  isOnline: boolean;
  isAnon: boolean;
  lastSeen?: number;
  currentChannel?: string;
  internalId?: string;
  unreadCount?: number;
};

export type SessionInfo = {
  sessionId: string;
  displayName: string;
  isAnon: boolean;
  createdAt: number;
  currentChannel?: string;
  internalId?: string;
};

export type PrivateChatInfo = {
  recipientId: string;
  recipientName: string;
  lastMessageTime: number;
  unreadCount: number;
  lastMessage?: string;
};

export const names = [
  "Alice",
  "Bob",
  "Charlie",
  "David",
  "Eve",
  "Frank",
  "Grace",
  "Heidi",
  "Ivan",
  "Judy",
  "Kevin",
  "Linda",
  "Mallory",
  "Nancy",
  "Oscar",
  "Peggy",
  "Quentin",
  "Randy",
  "Steve",
  "Trent",
  "Ursula",
  "Victor",
  "Walter",
  "Xavier",
  "Yvonne",
  "Zoe",
];

// Default public channels
export const DEFAULT_CHANNELS: PublicChannel[] = [
  {
    id: "general",
    name: "#general",
    description: "General discussion and announcements",
    memberCount: 0,
    isActive: true,
  },
  {
    id: "random",
    name: "#random",
    description: "Random topics and casual conversation",
    memberCount: 0,
    isActive: true,
  },
  {
    id: "support",
    name: "#support",
    description: "Get help and ask questions",
    memberCount: 0,
    isActive: true,
  },
];

export const ILLEGAL_NAMES = [
  "anonymous",
  "system",
  "admin",
  "moderator",
  "root"
];

// Helper function to generate a hex UUID
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
