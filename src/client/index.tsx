import React from "react";
import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import { useState, useEffect, useRef } from "react";
import type { ChatMessage, Message, UserInfo, SessionInfo, PublicChannel, PrivateChatInfo } from "../shared";

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [channels, setChannels] = useState<PublicChannel[]>([]);
  const [currentUser, setCurrentUser] = useState<SessionInfo | null>(null);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentChannel, setCurrentChannel] = useState<string | null>(null);
  const [currentPrivateChat, setCurrentPrivateChat] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [pendingName, setPendingName] = useState<string>("");
  const [pendingAnon, setPendingAnon] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [privateChats, setPrivateChats] = useState<PrivateChatInfo[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(Notification.permission);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const hasReleasedName = useRef<boolean>(false);

  const socket = usePartySocket({
    party: "chat",
    room: "main",
    onMessage(event) {
      const message = JSON.parse(event.data) as Message;
      
      if (message.type === "add" || message.type === "update") {
        // Handle private messages
        if (message.isPrivate) {
          // Check if this private message involves us
          const isSender = message.sessionId === sessionId;
          const isRecipient = message.recipientId === sessionId;
          
          // Check if we're currently in a private chat with either the sender or recipient
          const isInPrivateChat = currentPrivateChat === message.sessionId || currentPrivateChat === message.recipientId;
          
          // Only add message if we're currently viewing this specific private chat
          if (isInPrivateChat) {
            setMessages((prev) => {
              const existingIndex = prev.findIndex((m) => m.id === message.id);
              const timestamp = (message as any).timestamp || Date.now();
              if (existingIndex >= 0) {
                const newMessages = [...prev];
                newMessages[existingIndex] = {
                  ...message,
                  timestamp,
                };
                return newMessages;
              } else {
                return [...prev, { 
                  ...message, 
                  timestamp
                }];
              }
            });
          }
          
          // Show browser notification for private messages from others
          if (message.user !== currentUser?.displayName && notificationPermission === "granted") {
            new Notification(`Private message from ${message.user}`, {
              body: message.content,
              icon: "/favicon.ico",
            });
          }
        } else {
          // Handle regular messages (channel messages)
          // Only add message if we're currently in this specific channel
          if (message.channelId && currentChannel === message.channelId) {
            setMessages((prev) => {
              const existingIndex = prev.findIndex((m) => m.id === message.id);
              const timestamp = (message as any).timestamp || Date.now();
              if (existingIndex >= 0) {
                const newMessages = [...prev];
                newMessages[existingIndex] = {
                  ...message,
                  timestamp,
                };
                return newMessages;
              } else {
                return [...prev, { 
                  ...message, 
                  timestamp
                }];
              }
            });
          }
        }
      } else if (message.type === "all") {
        if (message.channelId) {
          // Channel messages - only show if we're in this channel
          if (currentChannel === message.channelId) {
            setMessages(message.messages);
          }
        } else {
          // Direct messages
          setMessages(message.messages);
        }
      } else if (message.type === "private_messages") {
        // Private messages - only show if we're in this private chat
        if (currentPrivateChat === message.recipientId) {
          setMessages(message.messages);
        }
      } else if (message.type === "users_list") {
        setUsers(message.users);
      } else if (message.type === "channels_list") {
        setChannels(message.channels);
      } else if (message.type === "user_joined") {
        setUsers((prev) => {
          const existing = prev.find((u) => u.sessionId === message.sessionId);
          if (existing) {
            return prev.map((u) =>
              u.sessionId === message.sessionId ? { ...u, isOnline: true } : u
            );
          } else {
            return [...prev, { name: message.name, sessionId: message.sessionId, isOnline: true, isAnon: false }];
          }
        });
      } else if (message.type === "user_left") {
        setUsers((prev) =>
          prev.map((u) =>
            u.sessionId === message.sessionId ? { ...u, isOnline: false } : u
          )
        );
      } else if (message.type === "name_reserved") {
        // Name is reserved, create the user
        const user: SessionInfo = {
          sessionId: sessionId,
          displayName: pendingName,
          isAnon: pendingAnon,
          createdAt: Date.now(),
        };
        
        setCurrentUser(user);
        localStorage.setItem("chatUser", JSON.stringify(user));
        setShowNamePrompt(false);
        setPendingName("");
        setPendingAnon(false);
      } else if (message.type === "name_reservation_failed") {
        // Name reservation failed
        alert(`Username "${pendingName}" is already taken. Please choose a different name.`);
        setPendingName("");
        setPendingAnon(false);
      } else if (message.type === "name_check_result") {
        if (message.available) {
          // Name is available, create the user
          const user: SessionInfo = {
            sessionId: sessionId,
            displayName: pendingName,
            isAnon: pendingAnon,
            createdAt: Date.now(),
          };
          
          setCurrentUser(user);
          localStorage.setItem("chatUser", JSON.stringify(user));
          setShowNamePrompt(false);
          setPendingName("");
          setPendingAnon(false);
        } else {
          // Name is taken
          alert(`Username "${pendingName}" is already taken. Please choose a different name.`);
          setPendingName("");
          setPendingAnon(false);
        }
      } else if (message.type === "name_taken") {
        // Handle username taken error
        alert(`Username "${message.name}" is already taken. Please choose a different name.`);
        // Clear the current user and show name prompt again
        setCurrentUser(null);
        localStorage.removeItem("chatUser");
        setShowNamePrompt(true);
      } else if (message.type === "db_cleanup_result") {
        // Handle database cleanup result
        if (message.success) {
          alert(`Database cleaned successfully!\nRemoved ${message.removedUsers} duplicate users, ${message.removedMessages} messages, and ${message.removedPrivateMessages} private messages.`);
        } else {
          alert(`Database cleanup failed: ${message.message}`);
        }
      } else if (message.type === "unread_update") {
        // Handle unread count updates
        setUnreadCounts(prev => {
          const newCounts = new Map(prev);
          newCounts.set(`${message.chatType}:${message.chatId}`, message.unreadCount);
          return newCounts;
        });
      } else if (message.type === "private_chats_list" && "chats" in message) {
        // Handle private chats list update
        setPrivateChats(message.chats);
      }
    },
  });

  useEffect(() => {
    // Check if user exists in localStorage
    const savedUser = localStorage.getItem("chatUser");
    if (savedUser) {
      const user = JSON.parse(savedUser) as SessionInfo;
      setCurrentUser(user);
      setShowNamePrompt(false);
    } else {
      setShowNamePrompt(true);
    }
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    // Focus name input when prompt shows
    if (showNamePrompt && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [showNamePrompt]);

  // Generate or retrieve session ID
  useEffect(() => {
    let storedSessionId = localStorage.getItem("chatSessionId");
    if (!storedSessionId) {
      storedSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("chatSessionId", storedSessionId);
    }
    setSessionId(storedSessionId);
  }, []);

  // Request private chats list when user is set
  useEffect(() => {
    if (currentUser && sessionId) {
      requestPrivateChatsList();
    }
  }, [currentUser, sessionId]);

  // Request notification permission on first user interaction
  const requestNotificationPermission = async () => {
    if (Notification.permission === "default") {
      try {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        if (permission === "granted") {
          // Show a test notification to confirm it's working
          new Notification("Notifications enabled!", {
            body: "You'll now receive notifications for private messages.",
            icon: "/favicon.ico",
          });
        }
      } catch (error) {
        console.error("Failed to request notification permission:", error);
      }
    }
  };

  // Cleanup effect for name reservation - only run once on unmount
  useEffect(() => {
    return () => {
      if (currentUser && socket && sessionId && !hasReleasedName.current && socket.readyState === WebSocket.OPEN) {
        hasReleasedName.current = true;
        const releaseMessage: Message = {
          type: "release_name",
          name: currentUser.displayName,
          sessionId: sessionId,
        };
        socket.send(JSON.stringify(releaseMessage));
      }
    };
  }, []); // Empty dependency array - only run on mount/unmount

  const handleNameSubmit = (name: string, isAnon: boolean = false) => {
    let finalName = name.trim();
    if (isAnon) {
      // For anonymous users, we don't need a specific name - the server will generate a UUID
      finalName = "Anon"; // This will be replaced by the server
    }
    if (!finalName) return;
    setPendingName(finalName);
    setPendingAnon(isAnon);
    if (socket) {
      const reserveMessage: Message = {
        type: "reserve_name",
        name: finalName,
        sessionId: sessionId,
        ...(isAnon ? { isAnon: true } : {}),
      } as any;
      socket.send(JSON.stringify(reserveMessage));
    }
  };

  const handleSendMessage = () => {
    if (!inputValue.trim() || !currentUser || !socket) return;
    
    const messageId = `msg_${Date.now()}_${Math.random()}`;
    const message: Message = {
      type: "add",
      id: messageId,
      content: inputValue.trim(),
      user: currentUser.displayName,
      role: "user",
      channelId: currentChannel || undefined,
      sessionId: sessionId,
      ...(currentPrivateChat ? { isPrivate: true, recipientId: currentPrivateChat } : {}),
      ...(currentUser.isAnon ? { isAnon: true } : {}),
    } as any;
    
    socket.send(JSON.stringify(message));
    setInputValue("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleNameEdit = () => {
    if (!currentUser) return;
    
    setTempName(currentUser.displayName);
    setEditingName(true);
  };

  const handleNameSave = () => {
    if (!tempName.trim() || !currentUser) return;
    
    // Release the old name reservation first
    if (socket && sessionId && currentUser.displayName !== tempName.trim()) {
      const releaseMessage: Message = {
        type: "release_name",
        name: currentUser.displayName,
        sessionId: sessionId,
      };
      socket.send(JSON.stringify(releaseMessage));
    }
    
    const updatedUser = { ...currentUser, displayName: tempName.trim() };
    setCurrentUser(updatedUser);
    localStorage.setItem("chatUser", JSON.stringify(updatedUser));
    setEditingName(false);
  };

  const handleNameCancel = () => {
    setEditingName(false);
    setTempName("");
  };

  const handleChannelJoin = (channelId: string) => {
    setCurrentChannel(channelId);
    setCurrentPrivateChat(null);
    setMessages([]);
    
    // Mark channel as read
    markChatAsRead("channel", channelId);
    
    socket.send(
      JSON.stringify({
        type: "join_channel",
        channelId: channelId,
        sessionId: sessionId,
      } satisfies Message),
    );
  };

  const handleLeaveChannel = () => {
    if (currentChannel) {
      socket.send(
        JSON.stringify({
          type: "leave_channel",
          channelId: currentChannel,
          sessionId: sessionId,
        } satisfies Message),
      );
    }
    setCurrentChannel(null);
    setMessages([]);
  };

  const handleOpenPrivateChat = (recipientId: string) => {
    setCurrentPrivateChat(recipientId);
    setCurrentChannel(null);
    setMessages([]);
    
    // Mark private chat as read
    markChatAsRead("private", recipientId);
    
    socket.send(
      JSON.stringify({
        type: "open_private_chat",
        recipientId: recipientId,
        sessionId: sessionId,
      } satisfies Message),
    );
  };

  const handleClosePrivateChat = () => {
    setCurrentPrivateChat(null);
    setMessages([]);
  };

  const handleCleanupDatabase = () => {
    if (confirm("This will remove duplicate users and old sessions. Are you sure?")) {
      socket.send(JSON.stringify({
        type: "db_cleanup",
        sessionId: sessionId,
      }));
    }
  };

  const markChatAsRead = (chatType: "private" | "channel", chatId: string) => {
    socket.send(JSON.stringify({
      type: "mark_read",
      sessionId: sessionId,
      chatType,
      chatId,
    }));
    
    // Update local unread count
    setUnreadCounts(prev => {
      const newCounts = new Map(prev);
      newCounts.set(`${chatType}:${chatId}`, 0);
      return newCounts;
    });
  };

  const requestPrivateChatsList = () => {
    socket.send(JSON.stringify({
      type: "private_chats_list",
      sessionId: sessionId,
    }));
  };

  const getCurrentChannelInfo = () => {
    if (!currentChannel) return null;
    return channels.find(ch => ch.id === currentChannel);
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (showNamePrompt) {
    return (
      <div className="name-prompt-overlay">
        <div className="name-prompt-modal">
          <h2>Welcome to Chat!</h2>
          <p>Enter your name to get started:</p>
          <input
            ref={nameInputRef}
            type="text"
            placeholder="Your name"
            maxLength={20}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                handleNameSubmit(e.currentTarget.value);
              }
            }}
          />
          <div className="name-prompt-buttons">
            <button onClick={() => handleNameSubmit(nameInputRef.current?.value || "")}>
              Join Chat
            </button>
            <button 
              className="anon-button"
              onClick={() => handleNameSubmit(nameInputRef.current?.value || "", true)}
            >
              Join Anonymously
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Mobile Menu Button */}
      <button 
        className="mobile-menu-button"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        ☰
      </button>

      {/* Sidebar */}
      <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h3>Chat</h3>
          <button 
            className="close-sidebar"
            onClick={() => setIsSidebarOpen(false)}
          >
            ×
          </button>
        </div>

        <div className="sidebar-content">
          {/* User Profile */}
          <div className="user-profile">
            <div className="avatar">
              {currentUser?.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              {editingName ? (
                <div className="name-edit">
                  <input
                    type="text"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") handleNameSave();
                      if (e.key === "Escape") handleNameCancel();
                    }}
                    maxLength={20}
                    autoFocus
                    disabled={currentUser?.isAnon}
                  />
                  <button onClick={handleNameSave} disabled={currentUser?.isAnon}>✓</button>
                  <button onClick={handleNameCancel}>✗</button>
                </div>
              ) : (
                <div className="name-display" onClick={currentUser?.isAnon ? undefined : handleNameEdit}>
                  <span className="name">{currentUser?.displayName}</span>
                  {currentUser?.isAnon && <span className="anon-badge">Anon</span>}
                  <span className="edit-icon">✏️</span>
                </div>
              )}
            </div>
          </div>

          {/* Notification Settings */}
          <div className="sidebar-section">
            <div className="notification-settings">
              <div className="notification-status">
                <span className="notification-icon">
                  {notificationPermission === "granted" ? "🔔" : 
                   notificationPermission === "denied" ? "🔕" : "🔇"}
                </span>
                <span className="notification-text">
                  {notificationPermission === "granted" ? "Notifications enabled" : 
                   notificationPermission === "denied" ? "Notifications blocked" : "Notifications disabled"}
                </span>
              </div>
              {notificationPermission === "default" && (
                <button 
                  className="notification-btn"
                  onClick={requestNotificationPermission}
                  title="Enable notifications for private messages"
                >
                  Enable Notifications
                </button>
              )}
              {notificationPermission === "denied" && (
                <div className="notification-help">
                  <small>Check browser settings to enable notifications</small>
                </div>
              )}
            </div>
          </div>

          {/* Database Cleanup - Hidden for production */}
          {/* <div className="sidebar-section">
            <button 
              className="cleanup-button"
              onClick={handleCleanupDatabase}
              title="Remove duplicate users and old sessions"
            >
              🧹 Clean Database
            </button>
          </div> */}

          {/* Public Channels */}
          <div className="sidebar-section">
            <h4>Public Channels</h4>
            <div className="channels-list">
              {channels.map((channel) => {
                const unreadCount = unreadCounts.get(`channel:${channel.id}`) || 0;
                return (
                  <div
                    key={channel.id}
                    className={`channel-item ${currentChannel === channel.id ? 'active' : ''}`}
                    onClick={() => handleChannelJoin(channel.id)}
                  >
                    <span className="channel-name">{channel.name}</span>
                    <div className="channel-meta">
                      <span className="member-count">{channel.memberCount}</span>
                      {unreadCount > 0 && (
                        <div className="unread-badge">{unreadCount}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Private Chats */}
          {privateChats.length > 0 && (
            <div className="sidebar-section">
              <h4>Private Chats</h4>
              <div className="private-chats-list">
                {privateChats.map((chat) => (
                  <div 
                    key={chat.recipientId} 
                    className={`private-chat-item ${currentPrivateChat === chat.recipientId ? 'active' : ''}`}
                    onClick={() => handleOpenPrivateChat(chat.recipientId)}
                  >
                    <div className="chat-avatar">
                      {chat.recipientName.charAt(0).toUpperCase()}
                    </div>
                    <div className="chat-info">
                      <span className="chat-name">{chat.recipientName}</span>
                      {chat.lastMessage && (
                        <span className="last-message">{chat.lastMessage}</span>
                      )}
                    </div>
                    <div className="chat-meta">
                      <span className="last-time">{formatTime(chat.lastMessageTime)}</span>
                      {chat.unreadCount > 0 && (
                        <div className="unread-badge">{chat.unreadCount}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contacts */}
          <div className="sidebar-section">
            <h4>Contacts</h4>
            <div className="users-list">
              {users
                .filter((user) => !user.isAnon && user.sessionId !== sessionId)
                // Group by name and keep only the most recent session for each name
                .reduce((unique, user) => {
                  const existing = unique.find(u => u.name.toLowerCase() === user.name.toLowerCase());
                  if (!existing) {
                    unique.push(user);
                  } else {
                    // Replace with more recent user (use lastSeen or default to 0)
                    const userTime = user.lastSeen || 0;
                    const existingTime = existing.lastSeen || 0;
                    if (userTime > existingTime) {
                      const index = unique.indexOf(existing);
                      unique[index] = user;
                    }
                  }
                  return unique;
                }, [] as UserInfo[])
                .map((user) => {
                  const unreadCount = unreadCounts.get(`private:${user.sessionId}`) || 0;
                  return (
                    <div 
                      key={user.sessionId} 
                      className={`user-item ${currentPrivateChat === user.sessionId ? 'active' : ''} ${user.isOnline ? 'online' : 'offline'}`}
                      onClick={() => handleOpenPrivateChat(user.sessionId)}
                    >
                      <div className="user-avatar">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="user-name">
                        {user.name}
                      </span>
                      <div className={`online-indicator ${user.isOnline ? 'online' : 'offline'}`}></div>
                      {unreadCount > 0 && (
                        <div className="unread-badge">{unreadCount}</div>
                      )}
                    </div>
                  );
                })}
              {users.filter((user) => !user.isAnon && user.sessionId !== sessionId).length === 0 && (
                <div className="empty-contacts">
                  <p>No contacts available</p>
                </div>
              )}
            </div>
          </div>

          {/* Online Users */}
          <div className="sidebar-section">
            <h4>Online Users ({users.filter(u => u.isOnline).length})</h4>
            <div className="users-list">
              {users
                .filter((user) => user.isOnline)
                .map((user) => (
                  <div key={user.sessionId} className="user-item">
                    <div className="user-avatar">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="user-name">
                      {user.name}
                      {user.isAnon && <span className="anon-badge">Anon</span>}
                    </span>
                    <div className="online-indicator"></div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Main Chat Area */}
      <div className="chat-container">
        {currentChannel ? (
          <>
            {/* Channel Header */}
            <div className="chat-header">
              <div className="channel-info">
                <h2>{getCurrentChannelInfo()?.name}</h2>
                <p>{getCurrentChannelInfo()?.description}</p>
                <span className="member-count">
                  {getCurrentChannelInfo()?.memberCount} members
                </span>
              </div>
              <button className="leave-channel" onClick={handleLeaveChannel}>
                Leave Channel
              </button>
            </div>

            {/* Messages */}
            <div className="messages">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <p>No messages yet in this channel. Be the first to say something!</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message ${message.user === currentUser?.displayName ? "own" : ""}`}
                  >
                    <div className="message-avatar">
                      {message.user.charAt(0).toUpperCase()}
                    </div>
                    <div className="message-content">
                      <div className="message-header">
                        <span className="message-user">{message.user}</span>
                        <span className="message-time">
                          {formatTime(message.timestamp)}
                        </span>
                      </div>
                      <div className="message-text">{message.content}</div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="input-container">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                rows={1}
              />
              <button onClick={handleSendMessage} disabled={!inputValue.trim()}>
                Send
              </button>
            </div>
          </>
        ) : currentPrivateChat ? (
          <>
            {/* Private Chat Header */}
            <div className="chat-header">
              <div className="channel-info">
                <h2>Private Chat with {users.find(u => u.sessionId === currentPrivateChat)?.name}</h2>
                <p>Direct message conversation</p>
              </div>
              <button className="leave-channel" onClick={handleClosePrivateChat}>
                Close Chat
              </button>
            </div>

            {/* Messages */}
            <div className="messages">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <p>No messages yet in this conversation. Start the conversation!</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message ${message.user === currentUser?.displayName ? "own" : ""}`}
                  >
                    <div className="message-avatar">
                      {message.user.charAt(0).toUpperCase()}
                    </div>
                    <div className="message-content">
                      <div className="message-header">
                        <span className="message-user">{message.user}</span>
                        <span className="message-time">
                          {formatTime(message.timestamp)}
                        </span>
                      </div>
                      <div className="message-text">{message.content}</div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="input-container">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a private message..."
                rows={1}
              />
              <button onClick={handleSendMessage} disabled={!inputValue.trim()}>
                Send
              </button>
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="empty-chat">
            <div className="empty-content">
              <h2>Welcome to Chat!</h2>
              <p>Join a public channel to start chatting with others.</p>
              <div className="empty-actions">
                <button 
                  className="join-public-btn"
                  onClick={() => handleChannelJoin("general")}
                >
                  Join #General
                </button>
                <button 
                  className="join-public-btn"
                  onClick={() => handleChannelJoin("random")}
                >
                  Join #Random
                </button>
                <button 
                  className="join-public-btn"
                  onClick={() => handleChannelJoin("support")}
                >
                  Join #Support
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Render the app
const root = createRoot(document.getElementById("root")!);
root.render(<App />);

export default App;
