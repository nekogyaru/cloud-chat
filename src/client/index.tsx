import React, { Component } from "react";
import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import { useState, useEffect, useRef } from "react";
import type { ChatMessage, Message, UserInfo, SessionInfo, PublicChannel, PrivateChatInfo } from "../shared";
import notificationService, { NotificationOptions } from "./notificationService";

function App() {
  console.log("App component rendering...");
  
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
  const [notificationStatus, setNotificationStatus] = useState(() => {
    const status = notificationService.getStatus();
    console.log("Initial notification status:", status);
    return status;
  });
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
          
          // Show notification for private messages from others
          if (message.user !== currentUser?.displayName) {
            notificationService.show({
              title: `Private message from ${message.user}`,
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
      } else if (message.type === "message_too_long") {
        // Handle message too long error
        alert(message.message);
      }
    },
  });

  useEffect(() => {
    console.log("Initializing app...");
    // Check if user exists in localStorage
    const savedUser = localStorage.getItem("chatUser");
    console.log("Saved user:", savedUser);
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser) as SessionInfo;
        console.log("Setting current user:", user);
        setCurrentUser(user);
        setShowNamePrompt(false);
      } catch (error) {
        console.error("Error parsing saved user:", error);
        setShowNamePrompt(true);
      }
    } else {
      console.log("No saved user, showing name prompt");
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
    console.log("Setting up session ID...");
    let storedSessionId = localStorage.getItem("chatSessionId");
    if (!storedSessionId) {
      storedSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("chatSessionId", storedSessionId);
      console.log("Generated new session ID:", storedSessionId);
    } else {
      console.log("Using existing session ID:", storedSessionId);
    }
    setSessionId(storedSessionId);
  }, []);

  // Request private chats list when user is set
  useEffect(() => {
    if (currentUser && sessionId) {
      requestPrivateChatsList();
    }
  }, [currentUser, sessionId]);

  // Update notification status when it changes
  useEffect(() => {
    const updateStatus = () => {
      setNotificationStatus(notificationService.getStatus());
    };
    
    // Update status periodically
    const interval = setInterval(updateStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Request browser notification permission
  const requestNotificationPermission = async () => {
    const permission = await notificationService.requestBrowserPermission();
    setNotificationStatus(notificationService.getStatus());
    
    if (permission === "granted") {
      // Show a test notification
      notificationService.show({
        title: "Notifications enabled!",
        body: "You'll now receive notifications for private messages.",
        icon: "/favicon.ico",
      });
    }
  };

  // Subscribe to push notifications
  const subscribeToPushNotifications = async () => {
    const success = await notificationService.subscribeToPush();
    setNotificationStatus(notificationService.getStatus());
    
    if (success && socket && currentUser) {
      // Send subscription to server
      socket.send(JSON.stringify({
        type: "push_subscription",
        subscription: notificationStatus.hasPushSubscription,
        sessionId: sessionId,
      }));
    }
  };

  // Unsubscribe from push notifications
  const unsubscribeFromPushNotifications = async () => {
    const success = await notificationService.unsubscribeFromPush();
    setNotificationStatus(notificationService.getStatus());
    
    if (success && socket && currentUser) {
      // Notify server
      socket.send(JSON.stringify({
        type: "push_unsubscription",
        sessionId: sessionId,
      }));
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
    const trimmedContent = inputValue.trim();
    if (!trimmedContent || !currentUser || !socket) return;
    
    // Check message length limit (3000 characters)
    if (trimmedContent.length > 3000) {
      alert("Message is too long. Please keep messages under 3,000 characters.");
      return;
    }
    
    const messageId = `msg_${Date.now()}_${Math.random()}`;
    const message: Message = {
      type: "add",
      id: messageId,
      content: trimmedContent,
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
          <h2>Welcome to CloudChat!</h2>
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

  // Add a fallback for when the app is loading or there's an error
  if (!currentUser) {
    console.log("No current user, showing loading state");
    return (
      <div className="app">
        <div className="loading-state">
          <h2>Loading...</h2>
          <p>Please wait while we connect to the chat server.</p>
          <p>Debug: showNamePrompt = {showNamePrompt.toString()}</p>
        </div>
      </div>
    );
  }

  console.log("Rendering main app with user:", currentUser.displayName);

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

          {/* Slim Notification Bar - Bottom of Sidebar */}
          {(() => { 
            console.log("Rendering notification bar with status:", notificationStatus); 
            console.log("Notification bar should be visible");
            return null; 
          })()}
          <div className="notification-bar">
            <button 
              className={`notification-toggle ${notificationStatus.browserPermission === "granted" ? "enabled" : "disabled"}`}
              onClick={requestNotificationPermission}
              title={
                !notificationStatus.isSecureContext ? "HTTPS required for notifications" :
                notificationStatus.browserPermission === "granted" ? "Notifications enabled - click to disable" :
                notificationStatus.browserPermission === "denied" ? "Notifications blocked - check browser settings" :
                "Click to enable notifications"
              }
            >
              {!notificationStatus.isSecureContext ? "🔒" :
               notificationStatus.browserPermission === "granted" ? "🔔" : 
               notificationStatus.browserPermission === "denied" ? "🔕" : "🔇"}
            </button>
            
            {notificationStatus.availableMethods.includes('push') && (
              <button 
                className={`push-toggle ${notificationStatus.hasPushSubscription ? "enabled" : "disabled"}`}
                onClick={notificationStatus.hasPushSubscription ? unsubscribeFromPushNotifications : subscribeToPushNotifications}
                title={
                  !notificationStatus.isSecureContext ? "HTTPS required for push notifications" :
                  notificationStatus.hasPushSubscription ? "Push notifications enabled - click to disable" :
                  "Click to enable push notifications"
                }
              >
                {!notificationStatus.isSecureContext ? "🔒" :
                 notificationStatus.hasPushSubscription ? "📱" : "📱❌"}
              </button>
            )}
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
              <div className="input-wrapper">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a message..."
                  rows={1}
                  maxLength={3000}
                />
                <div className="char-counter">
                  {inputValue.length}/3000
                </div>
              </div>
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
              <div className="input-wrapper">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a private message..."
                  rows={1}
                  maxLength={3000}
                />
                <div className="char-counter">
                  {inputValue.length}/3000
                </div>
              </div>
              <button onClick={handleSendMessage} disabled={!inputValue.trim()}>
                Send
              </button>
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="empty-chat">
                      <div className="empty-content">
            <h2>Welcome to CloudChat!</h2>
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

// Error boundary for debugging
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("App error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p>Error: {this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}>Reload Page</button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Render the app with error boundary
const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
} else {
  console.error("Root element not found!");
}

export default App;
