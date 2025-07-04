import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import React, { useState, useRef, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
} from "react-router";
import { nanoid } from "nanoid";

import { names, type ChatMessage, type Message } from "../shared";

// Telegram-like color scheme
const COLORS = {
  primary: "#0088cc",
  secondary: "#f1f1f1",
  messageBubble: "#e3f2fd",
  messageBubbleOwn: "#dcf8c6",
  text: "#212121",
  textSecondary: "#757575",
  background: "#ffffff",
  border: "#e0e0e0",
};

// Example chat data for sidebar
const exampleChats = [
  {
    id: "1",
    name: "Alice Johnson",
    lastMessage: "Hey, how's the project going?",
    timestamp: "2:30 PM",
    unreadCount: 2,
    avatar: "A",
    isOnline: true,
  },
  {
    id: "2", 
    name: "Bob Smith",
    lastMessage: "Meeting at 3 PM today",
    timestamp: "1:45 PM",
    unreadCount: 0,
    avatar: "B",
    isOnline: false,
  },
  {
    id: "3",
    name: "Charlie Brown",
    lastMessage: "Thanks for the help!",
    timestamp: "12:20 PM",
    unreadCount: 1,
    avatar: "C",
    isOnline: true,
  },
  {
    id: "4",
    name: "Design Team",
    lastMessage: "New mockups are ready for review",
    timestamp: "11:15 AM",
    unreadCount: 5,
    avatar: "D",
    isOnline: false,
  },
  {
    id: "5",
    name: "David Wilson",
    lastMessage: "Can you send me the files?",
    timestamp: "Yesterday",
    unreadCount: 0,
    avatar: "D",
    isOnline: true,
  },
  {
    id: "6",
    name: "Eve Anderson",
    lastMessage: "Great work on the presentation!",
    timestamp: "Yesterday",
    unreadCount: 0,
    avatar: "E",
    isOnline: false,
  },
];

function UserProfile({ displayName, onNameChange }: { 
  displayName: string; 
  onNameChange: (name: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(displayName);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    if (editName.trim()) {
      onNameChange(editName.trim());
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditName(displayName);
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <div className="user-profile">
      <div className="user-profile-avatar">
        {displayName.charAt(0).toUpperCase()}
      </div>
      <div className="user-profile-content">
        {isEditing ? (
          <div className="user-profile-edit">
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleKeyPress}
              className="user-name-input"
              placeholder="Enter your name"
            />
            <div className="user-profile-actions">
              <button onClick={handleSave} className="save-button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
              </button>
              <button onClick={handleCancel} className="cancel-button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <div className="user-profile-info">
            <div className="user-profile-name">{displayName}</div>
            <button 
              onClick={() => setIsEditing(true)}
              className="edit-name-button"
              title="Edit name"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatPreview({ chat, isActive }: { chat: typeof exampleChats[0]; isActive: boolean }) {
  return (
    <div className={`chat-preview ${isActive ? 'active' : ''}`}>
      <div className="chat-preview-avatar">
        <div className={`avatar ${chat.isOnline ? 'online' : ''}`}>
          {chat.avatar}
        </div>
        {chat.isOnline && <div className="online-indicator"></div>}
      </div>
      <div className="chat-preview-content">
        <div className="chat-preview-header">
          <div className="chat-preview-name">{chat.name}</div>
          <div className="chat-preview-time">{chat.timestamp}</div>
        </div>
        <div className="chat-preview-message">{chat.lastMessage}</div>
      </div>
      {chat.unreadCount > 0 && (
        <div className="unread-badge">{chat.unreadCount}</div>
      )}
    </div>
  );
}

function Sidebar({ displayName, onNameChange, isMobileOpen, onClose }: { 
  displayName: string; 
  onNameChange: (name: string) => void;
  isMobileOpen?: boolean;
  onClose?: () => void;
}) {
  return (
    <div className={`sidebar ${isMobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-title">
          <span className="sidebar-icon">💬</span>
          Chats
        </div>
        <div className="sidebar-header-actions">
          <button className="new-chat-button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </button>
          {isMobileOpen && (
            <button className="close-sidebar-button" onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      
      <div className="sidebar-search">
        <input 
          type="text" 
          placeholder="Search chats..." 
          className="search-input"
        />
      </div>
      
      <div className="chats-list">
        {exampleChats.map((chat) => (
          <ChatPreview 
            key={chat.id} 
            chat={chat} 
            isActive={chat.id === "1"} // First chat is "active"
          />
        ))}
      </div>
      
      <div className="sidebar-footer">
        <UserProfile displayName={displayName} onNameChange={onNameChange} />
      </div>
    </div>
  );
}

function MessageBubble({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  const [timestamp] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  return (
    <div className={`message-bubble ${isOwn ? 'own' : ''}`}>
      <div className="message-content">
        <div className="message-text">{message.content}</div>
        <div className="message-time">{timestamp}</div>
      </div>
    </div>
  );
}

function ChatHeader({ room, onMenuClick }: { room: string; onMenuClick?: () => void }) {
  return (
    <div className="chat-header">
      <div className="chat-header-content">
        {onMenuClick && (
          <button className="mobile-menu-button" onClick={onMenuClick}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
            </svg>
          </button>
        )}
        <div className="chat-header-info">
          <div className="chat-title">
            <span className="chat-icon">💬</span>
            Room #{room.slice(0, 8)}
          </div>
          <div className="chat-subtitle">Share this link to invite others</div>
        </div>
      </div>
    </div>
  );
}

function ChatInput({ onSendMessage, placeholder }: { 
  onSendMessage: (content: string) => void; 
  placeholder: string;
}) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSendMessage(inputValue.trim());
      setInputValue("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="chat-input-container">
      <form onSubmit={handleSubmit} className="chat-input-form">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          className="chat-input"
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="send"
        />
        <button 
          type="submit" 
          className="send-button"
          disabled={!inputValue.trim()}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </form>
    </div>
  );
}

function ChatArea({ displayName, onMenuClick }: { displayName: string; onMenuClick?: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { room } = useParams();

  const socket = usePartySocket({
    party: "chat",
    room,
    onMessage: (evt) => {
      const message = JSON.parse(evt.data as string) as Message;
      if (message.type === "add") {
        const foundIndex = messages.findIndex((m) => m.id === message.id);
        if (foundIndex === -1) {
          // probably someone else who added a message
          setMessages((messages) => [
            ...messages,
            {
              id: message.id,
              content: message.content,
              user: message.user,
              role: message.role,
            },
          ]);
        } else {
          // this usually means we ourselves added a message
          // and it was broadcasted back
          // so let's replace the message with the new message
          setMessages((messages) => {
            return messages
              .slice(0, foundIndex)
              .concat({
                id: message.id,
                content: message.content,
                user: message.user,
                role: message.role,
              })
              .concat(messages.slice(foundIndex + 1));
          });
        }
      } else if (message.type === "update") {
        setMessages((messages) =>
          messages.map((m) =>
            m.id === message.id
              ? {
                  id: message.id,
                  content: message.content,
                  user: message.user,
                  role: message.role,
                }
              : m,
          ),
        );
      } else {
        setMessages(message.messages);
      }
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (content: string) => {
    const chatMessage: ChatMessage = {
      id: nanoid(8),
      content,
      user: displayName,
      role: "user",
    };
    
    setMessages((messages) => [...messages, chatMessage]);
    
    socket.send(
      JSON.stringify({
        type: "add",
        ...chatMessage,
      } satisfies Message),
    );
  };

  return (
    <div className="chat-area">
      <ChatHeader room={room || ''} onMenuClick={onMenuClick} />
      
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💬</div>
            <div className="empty-title">Welcome to the chat!</div>
            <div className="empty-subtitle">Start a conversation by sending a message below.</div>
          </div>
        ) : (
          <div className="messages-list">
            {messages.map((message, index) => {
              const isOwn = message.user === displayName;
              const showAvatar = !isOwn && (
                index === 0 || messages[index - 1]?.user !== message.user
              );
              
              return (
                <div key={message.id} className={`message-wrapper ${isOwn ? 'own' : ''}`}>
                  {showAvatar && (
                    <div className="message-avatar">
                      {message.user.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="message-content-wrapper">
                    {!isOwn && showAvatar && (
                      <div className="message-username">{message.user}</div>
                    )}
                    <MessageBubble message={message} isOwn={isOwn} />
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      
      <ChatInput 
        onSendMessage={handleSendMessage}
        placeholder={`Message as ${displayName}...`}
      />
    </div>
  );
}

function ChatApp() {
  const [displayName, setDisplayName] = useState(() => {
    // Try to get saved name from localStorage, fallback to random name
    const saved = localStorage.getItem('chat-display-name');
    return saved || names[Math.floor(Math.random() * names.length)];
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleNameChange = (newName: string) => {
    setDisplayName(newName);
    localStorage.setItem('chat-display-name', newName);
  };

  const handleMenuClick = () => {
    setIsMobileMenuOpen(true);
  };

  const handleCloseMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="chat-app">
      <Sidebar 
        displayName={displayName} 
        onNameChange={handleNameChange}
        isMobileOpen={isMobileMenuOpen}
        onClose={handleCloseMenu}
      />
      <ChatArea 
        displayName={displayName} 
        onMenuClick={handleMenuClick}
      />
      {isMobileMenuOpen && (
        <div className="mobile-overlay" onClick={handleCloseMenu} />
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Navigate to={`/${nanoid()}`} />} />
      <Route path="/:room" element={<ChatApp />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  </BrowserRouter>,
);
