import {
  type Connection,
  Server,
  type WSMessage,
  routePartykitRequest,
} from "partyserver";

import type { ChatMessage, Message, UserInfo, SessionInfo, PublicChannel, PrivateChatInfo } from "../shared";
import { DEFAULT_CHANNELS, ILLEGAL_NAMES, generateUUID } from "../shared";

export class Chat extends Server<Env> {
  static options = { hibernate: true };

  messages = [] as ChatMessage[];
  channelMessages = new Map<string, ChatMessage[]>();
  privateMessages = new Map<string, Map<string, ChatMessage[]>>(); // sessionId -> recipientId -> messages
  users = new Map<string, UserInfo>();
  sessions = new Map<string, SessionInfo>();
  channels = new Map<string, PublicChannel>();
  channelMembers = new Map<string, Set<string>>(); // channelId -> Set of sessionIds
  connectionToSession = new Map<string, string>(); // connectionId -> sessionId
  pendingPrivateMessages: any[] = []; // Store private messages to load after users
  unreadCounts = new Map<string, Map<string, number>>(); // sessionId -> chatId -> unreadCount
  lastReadTimes = new Map<string, Map<string, number>>(); // sessionId -> chatId -> lastReadTime

  broadcastMessage(message: Message, exclude?: string[]) {
    // If this is a users_list, hide anon users completely
    if (message.type === "users_list") {
      const filtered = {
        ...message,
        users: message.users.filter(u => !u.isAnon), // Remove anonymous users from the list
      };
      this.broadcast(JSON.stringify(filtered), exclude);
      return;
    }
    // If this is a user_joined or user_left, mask anon name
    if ((message.type === "user_joined" || message.type === "user_left") && this.users.get(message.sessionId ?? '')?.isAnon) {
      const masked = { ...message, name: "Anon" };
      this.broadcast(JSON.stringify(masked), exclude);
      return;
    }
    // If this is a chat message, mask anon name
    if ((message.type === "add" || message.type === "update") && this.users.get(message.sessionId ?? '')?.isAnon) {
      const masked = { ...message, user: "Anon" };
      this.broadcast(JSON.stringify(masked), exclude);
      return;
    }
    this.broadcast(JSON.stringify(message), exclude);
  }

  broadcastToChannel(channelId: string, message: Message, exclude?: string[]) {
    // If this is a chat message, mask anon name
    if ((message.type === "add" || message.type === "update") && this.users.get(message.sessionId ?? '')?.isAnon) {
      const masked = { ...message, user: "Anon" };
      const channelMembers = this.channelMembers.get(channelId) || new Set();
      const messageStr = JSON.stringify(masked);
      for (const connection of this.getConnections()) {
        const connectionId = connection.id;
        const sessionId = this.connectionToSession.get(connectionId) || connectionId;
        if (channelMembers.has(sessionId) && !exclude?.includes(sessionId)) {
          connection.send(messageStr);
        }
      }
      return;
    }
    // Default: no masking
    const channelMembers = this.channelMembers.get(channelId) || new Set();
    const messageStr = JSON.stringify(message);
    for (const connection of this.getConnections()) {
      const connectionId = connection.id;
      const sessionId = this.connectionToSession.get(connectionId) || connectionId;
      if (channelMembers.has(sessionId) && !exclude?.includes(sessionId)) {
        connection.send(messageStr);
      }
    }
  }

  onStart() {
    // this is where you can initialize things that need to be done before the server starts
    // for example, load previous messages from a database or a service

    // create the messages table if it doesn't exist
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, user TEXT, role TEXT, content TEXT, channelId TEXT, timestamp INTEGER)`,
    );

    // create the users table if it doesn't exist
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS users (sessionId TEXT PRIMARY KEY, name TEXT, isAnon INTEGER, createdAt INTEGER, currentChannel TEXT, internalId TEXT)`,
    );
    
    // Add internalId column if it doesn't exist (migration for existing tables)
    try {
      this.ctx.storage.sql.exec(`ALTER TABLE users ADD COLUMN internalId TEXT`);
    } catch (e) {
      // Column already exists, ignore error
    }

    // create the channels table if it doesn't exist
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS channels (id TEXT PRIMARY KEY, name TEXT, description TEXT, memberCount INTEGER, isActive INTEGER)`,
    );

    // create the channel_members table if it doesn't exist
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS channel_members (channelId TEXT, sessionId TEXT, joinedAt INTEGER, PRIMARY KEY (channelId, sessionId))`,
    );

    // create the private_messages table if it doesn't exist
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS private_messages (id TEXT PRIMARY KEY, senderId TEXT, recipientId TEXT, content TEXT, timestamp INTEGER)`,
    );

    // Initialize default channels
    DEFAULT_CHANNELS.forEach(channel => {
      this.channels.set(channel.id, { ...channel });
      this.channelMessages.set(channel.id, []);
      this.channelMembers.set(channel.id, new Set());
    });

    // load the channels from the database
    const channelsData = this.ctx.storage.sql
      .exec(`SELECT * FROM channels`)
      .toArray() as any[];
    
    channelsData.forEach(channel => {
      this.channels.set(channel.id, {
        id: channel.id,
        name: channel.name,
        description: channel.description,
        memberCount: channel.memberCount,
        isActive: channel.isActive === 1,
      });
      this.channelMessages.set(channel.id, []);
      this.channelMembers.set(channel.id, new Set());
    });

    // load the messages from the database
    const messagesData = this.ctx.storage.sql
      .exec(`SELECT * FROM messages WHERE channelId IS NULL`)
      .toArray() as any[];
    
    this.messages = messagesData.map(msg => ({
      id: msg.id,
      content: msg.content,
      user: msg.user,
      role: msg.role,
      channelId: msg.channelId,
      timestamp: msg.timestamp,
    }));

    // load channel messages from the database
    const channelMessagesData = this.ctx.storage.sql
      .exec(`SELECT * FROM messages WHERE channelId IS NOT NULL`)
      .toArray() as any[];
    
    channelMessagesData.forEach(msg => {
      const channelId = msg.channelId;
      if (!this.channelMessages.has(channelId)) {
        this.channelMessages.set(channelId, []);
      }
      this.channelMessages.get(channelId)!.push({
        id: msg.id,
        content: msg.content,
        user: msg.user,
        role: msg.role,
        channelId: msg.channelId,
        timestamp: msg.timestamp,
      });
    });

    // load private messages from the database
    const privateMessagesData = this.ctx.storage.sql
      .exec(`SELECT * FROM private_messages`)
      .toArray() as any[];
    
    // Store private messages data to load after users are loaded
    this.pendingPrivateMessages = privateMessagesData;

    // load the users from the database
    const usersData = this.ctx.storage.sql
      .exec(`SELECT * FROM users`)
      .toArray() as any[];
    
    usersData.forEach(user => {
      this.users.set(user.sessionId, {
        name: user.name,
        sessionId: user.sessionId,
        isOnline: false,
        isAnon: user.isAnon === 1,
        lastSeen: Date.now(),
        currentChannel: user.currentChannel,
        internalId: user.internalId,
      });
      this.sessions.set(user.sessionId, {
        sessionId: user.sessionId,
        displayName: user.name,
        isAnon: user.isAnon === 1,
        createdAt: user.createdAt,
        currentChannel: user.currentChannel,
        internalId: user.internalId,
      });
    });

    // load channel members from the database
    const channelMembersData = this.ctx.storage.sql
      .exec(`SELECT * FROM channel_members`)
      .toArray() as any[];
    
    channelMembersData.forEach(member => {
      const channelId = member.channelId;
      if (!this.channelMembers.has(channelId)) {
        this.channelMembers.set(channelId, new Set());
      }
      this.channelMembers.get(channelId)!.add(member.sessionId);
    });

    // Update member counts
    this.updateChannelMemberCounts();

    // Load private messages after users are loaded
    this.pendingPrivateMessages.forEach(msg => {
      const senderId = msg.senderId;
      const recipientId = msg.recipientId;
      
      // Get the sender's display name
      const senderUser = this.users.get(senderId);
      const displayName = senderUser?.name || senderId;
      
      // Store for sender
      if (!this.privateMessages.has(senderId)) {
        this.privateMessages.set(senderId, new Map());
      }
      if (!this.privateMessages.get(senderId)!.has(recipientId)) {
        this.privateMessages.get(senderId)!.set(recipientId, []);
      }
      this.privateMessages.get(senderId)!.get(recipientId)!.push({
        id: msg.id,
        content: msg.content,
        user: displayName,
        role: "user",
        timestamp: msg.timestamp,
        isPrivate: true,
        recipientId: recipientId,
      });
      
      // Store for recipient
      if (!this.privateMessages.has(recipientId)) {
        this.privateMessages.set(recipientId, new Map());
      }
      if (!this.privateMessages.get(recipientId)!.has(senderId)) {
        this.privateMessages.get(recipientId)!.set(senderId, []);
      }
      this.privateMessages.get(recipientId)!.get(senderId)!.push({
        id: msg.id,
        content: msg.content,
        user: displayName,
        role: "user",
        timestamp: msg.timestamp,
        isPrivate: true,
        recipientId: recipientId,
      });
    });
    

    
    // Clear pending messages
    this.pendingPrivateMessages = [];
  }

  onConnect(connection: Connection) {
    // Store the mapping from connection ID to session ID
    // Initially use connection.id, will be updated when client sends sessionId
    this.connectionToSession.set(connection.id, connection.id);
    
    // Check if user exists in database and mark as online
    const existingUser = this.users.get(connection.id);
    if (existingUser) {
      existingUser.isOnline = true;
      existingUser.lastSeen = Date.now();
    }

    // Send current users list
    const usersList = Array.from(this.users.values());
    connection.send(
      JSON.stringify({
        type: "users_list",
        users: usersList,
      } satisfies Message),
    );

    // Send channels list
    const channelsList = Array.from(this.channels.values());
    connection.send(
      JSON.stringify({
        type: "channels_list",
        channels: channelsList,
      } satisfies Message),
    );

    // Send chat history if any (for non-channel messages)
    if (this.messages.length > 0) {
      connection.send(
        JSON.stringify({
          type: "all",
          messages: this.messages,
        } satisfies Message),
      );
    }

    // Note: Private chats list will be sent when the client requests it with their sessionId
    // This ensures we have the correct sessionId mapping before trying to load private chats
  }

  onDisconnect(connection: Connection) {
    // Find user by connection and mark as offline
    const sessionId = this.connectionToSession.get(connection.id) || connection.id;
    const user = this.users.get(sessionId);
    if (user) {
      user.isOnline = false;
      user.lastSeen = Date.now();
      
      // Remove from current channel
      if (user.currentChannel) {
        this.leaveChannel(sessionId, user.currentChannel);
      }
      
      // Broadcast user left
      this.broadcastMessage({
        type: "user_left",
        name: user.name,
        sessionId: user.sessionId,
      });
      
      // Broadcast updated users list to all clients
      const usersList = Array.from(this.users.values());
      this.broadcastMessage({
        type: "users_list",
        users: usersList,
      });
      
      // Broadcast updated channels list to all clients
      const channelsList = Array.from(this.channels.values());
      this.broadcastMessage({
        type: "channels_list",
        channels: channelsList,
      });
    }
    
    // Clean up connection mapping
    this.connectionToSession.delete(connection.id);
  }

  saveMessage(message: ChatMessage) {
    if (message.isPrivate) {
      // Private message - need to get sessionId from the message context
      // For now, we'll need to pass sessionId separately since ChatMessage doesn't have it
      // This will be handled in the onMessage method where we have access to sessionId
      return;
    } else if (message.channelId) {
      // Channel message
      const channelMessages = this.channelMessages.get(message.channelId) || [];
      const existingMessage = channelMessages.find((m) => m.id === message.id);
      
      if (existingMessage) {
        const updatedMessages = channelMessages.map((m) => {
          if (m.id === message.id) {
            return message;
          }
          return m;
        });
        this.channelMessages.set(message.channelId, updatedMessages);
      } else {
        channelMessages.push(message);
        this.channelMessages.set(message.channelId, channelMessages);
      }

      // Save to database
      this.ctx.storage.sql.exec(
        `INSERT INTO messages (id, user, role, content, channelId, timestamp) VALUES ('${
          message.id
        }', '${message.user}', '${message.role}', ${JSON.stringify(
          message.content,
        )}, '${message.channelId}', ${message.timestamp}) ON CONFLICT (id) DO UPDATE SET content = ${JSON.stringify(
          message.content,
        )}`,
      );
    } else {
      // Direct message
      const existingMessage = this.messages.find((m) => m.id === message.id);
      if (existingMessage) {
        this.messages = this.messages.map((m) => {
          if (m.id === message.id) {
            return message;
          }
          return m;
        });
      } else {
        this.messages.push(message);
      }

      this.ctx.storage.sql.exec(
        `INSERT INTO messages (id, user, role, content, channelId, timestamp) VALUES ('${
          message.id
        }', '${message.user}', '${message.role}', ${JSON.stringify(
          message.content,
        )}, NULL, ${message.timestamp}) ON CONFLICT (id) DO UPDATE SET content = ${JSON.stringify(
          message.content,
        )}`,
      );
    }
  }

  savePrivateMessage(message: ChatMessage, sessionId: string) {
    // Private message
    const senderId = sessionId;
    const recipientId = message.recipientId!;
    

    
    // Store for sender
    if (!this.privateMessages.has(senderId)) {
      this.privateMessages.set(senderId, new Map());
    }
    if (!this.privateMessages.get(senderId)!.has(recipientId)) {
      this.privateMessages.get(senderId)!.set(recipientId, []);
    }
    this.privateMessages.get(senderId)!.get(recipientId)!.push(message);
    
    // Store for recipient
    if (!this.privateMessages.has(recipientId)) {
      this.privateMessages.set(recipientId, new Map());
    }
    if (!this.privateMessages.get(recipientId)!.has(senderId)) {
      this.privateMessages.get(recipientId)!.set(senderId, []);
    }
    this.privateMessages.get(recipientId)!.get(senderId)!.push(message);
    

    
    // Save to database
    this.ctx.storage.sql.exec(
      `INSERT INTO private_messages (id, senderId, recipientId, content, timestamp) VALUES ('${message.id}', '${senderId}', '${recipientId}', ${JSON.stringify(message.content)}, ${message.timestamp})`,
    );
  }

  saveUser(sessionId: string, name: string, isAnon: boolean) {
    let internalId: string | undefined;
    let displayName = name;
    
    if (isAnon) {
      // Generate UUID for anonymous users
      internalId = generateUUID();
      displayName = "Anon"; // Always display as "Anon" for anonymous users
    }
    
    const user: UserInfo = {
      name: displayName,
      sessionId,
      isOnline: true,
      isAnon,
      lastSeen: Date.now(),
      currentChannel: undefined,
      internalId,
    };

    this.users.set(sessionId, user);
    this.sessions.set(sessionId, {
      sessionId,
      displayName: displayName,
      isAnon,
      createdAt: Date.now(),
      currentChannel: undefined,
      internalId,
    });

    // Save to database
    this.ctx.storage.sql.exec(
      `INSERT INTO users (sessionId, name, isAnon, createdAt, currentChannel, internalId) VALUES ('${sessionId}', '${displayName}', ${isAnon ? 1 : 0}, ${Date.now()}, NULL, ${internalId ? `'${internalId}'` : 'NULL'}) ON CONFLICT (sessionId) DO UPDATE SET name = '${displayName}', isAnon = ${isAnon ? 1 : 0}, internalId = ${internalId ? `'${internalId}'` : 'NULL'}`,
    );

    // Broadcast user joined
    this.broadcastMessage({
      type: "user_joined",
      name: user.name,
      sessionId: user.sessionId,
    });
  }

  joinChannel(sessionId: string, channelId: string) {
    const user = this.users.get(sessionId);
    if (!user) return;

    const channel = this.channels.get(channelId);
    if (!channel) return;

    // Mark user as online
    user.isOnline = true;
    user.lastSeen = Date.now();

    // Leave current channel if any
    if (user.currentChannel) {
      this.leaveChannel(sessionId, user.currentChannel);
    }

    // Join new channel
    user.currentChannel = channelId;
    const channelMembers = this.channelMembers.get(channelId) || new Set();
    channelMembers.add(sessionId);
    this.channelMembers.set(channelId, channelMembers);

    // Update database
    this.ctx.storage.sql.exec(
      `UPDATE users SET currentChannel = '${channelId}' WHERE sessionId = '${sessionId}'`,
    );
    this.ctx.storage.sql.exec(
      `INSERT INTO channel_members (channelId, sessionId, joinedAt) VALUES ('${channelId}', '${sessionId}', ${Date.now()}) ON CONFLICT (channelId, sessionId) DO NOTHING`,
    );

    this.updateChannelMemberCounts();
    
    // Broadcast updated channels list to all clients
    const channelsList = Array.from(this.channels.values());
    this.broadcastMessage({
      type: "channels_list",
      channels: channelsList,
    });

    // Broadcast updated users list to all clients
    const usersList = Array.from(this.users.values());
    this.broadcastMessage({
      type: "users_list",
      users: usersList,
    });
  }

  leaveChannel(sessionId: string, channelId: string) {
    const user = this.users.get(sessionId);
    if (!user) return;

    user.currentChannel = undefined;
    const channelMembers = this.channelMembers.get(channelId);
    if (channelMembers) {
      channelMembers.delete(sessionId);
    }

    // Update database
    this.ctx.storage.sql.exec(
      `UPDATE users SET currentChannel = NULL WHERE sessionId = '${sessionId}'`,
    );
    this.ctx.storage.sql.exec(
      `DELETE FROM channel_members WHERE channelId = '${channelId}' AND sessionId = '${sessionId}'`,
    );

    this.updateChannelMemberCounts();
    
    // Broadcast updated channels list to all clients
    const channelsList = Array.from(this.channels.values());
    this.broadcastMessage({
      type: "channels_list",
      channels: channelsList,
    });
  }

  updateChannelMemberCounts() {
    this.channels.forEach((channel, channelId) => {
      const members = this.channelMembers.get(channelId) || new Set();
      // Count all members in the channel, not just online ones
      channel.memberCount = members.size;
      this.channels.set(channelId, channel);
    });
  }

  // Track name reservations to prevent race conditions
  nameReservations = new Map<string, { sessionId: string; timestamp: number }>();

  checkNameAvailability(name: string, sessionId: string): { available: boolean; isOwn: boolean } {
    const normalizedName = name.toLowerCase();
    
    // Check for illegal names
    if (ILLEGAL_NAMES.some(illegal => illegal.toLowerCase() === normalizedName)) {
      return { available: false, isOwn: false };
    }
    
    // For anonymous users, skip uniqueness validation - they use UUIDs internally
    const existingUser = this.users.get(sessionId);
    if (existingUser?.isAnon) {
      return { available: true, isOwn: true };
    }
    
    // Also skip validation if the name is "Anon" and we're trying to create an anonymous user
    // This prevents the "Anon is already taken" error
    if (normalizedName === "anon") {
      return { available: true, isOwn: false };
    }
    
    // Check if name is already taken by another user (case-insensitive)
    for (const [id, user] of this.users.entries()) {
      if (user.name.toLowerCase() === normalizedName && id !== sessionId) {
        return { available: false, isOwn: false };
      }
    }
    
    // Check if this is the user's own name
    if (existingUser && existingUser.name.toLowerCase() === normalizedName) {
      return { available: true, isOwn: true };
    }
    
    // Check if name is reserved by another session
    const reservation = this.nameReservations.get(normalizedName);
    if (reservation && reservation.sessionId !== sessionId) {
      // Check if reservation is still valid (5 minutes)
      if (Date.now() - reservation.timestamp < 5 * 60 * 1000) {
        return { available: false, isOwn: false };
      } else {
        // Expired reservation, remove it
        this.nameReservations.delete(normalizedName);
      }
    }
    
    return { available: true, isOwn: false };
  }

  reserveName(name: string, sessionId: string): boolean {
    const normalizedName = name.toLowerCase();
    
    // For anonymous users, skip reservation - they use UUIDs internally
    const existingUser = this.users.get(sessionId);
    if (existingUser?.isAnon) {
      return true;
    }
    
    // Also allow "Anon" name for anonymous users (when creating new ones)
    if (normalizedName === "anon") {
      return true;
    }
    
    // Check if name is available
    const { available } = this.checkNameAvailability(name, sessionId);
    if (!available) {
      return false;
    }
    
    // Reserve the name
    this.nameReservations.set(normalizedName, {
      sessionId,
      timestamp: Date.now(),
    });
    
    return true;
  }

  releaseName(name: string, sessionId: string) {
    const reservation = this.nameReservations.get(name.toLowerCase());
    if (reservation && reservation.sessionId === sessionId) {
      this.nameReservations.delete(name.toLowerCase());
    }
  }

  cleanupDatabase() {
    let removedUsers = 0;
    let removedMessages = 0;
    let removedPrivateMessages = 0;

    try {
      // Get all users
      const allUsers = this.ctx.storage.sql.exec(`SELECT * FROM users ORDER BY createdAt DESC`).toArray() as any[];
      
      // Group users by name (case-insensitive)
      const usersByName = new Map<string, any[]>();
      allUsers.forEach(user => {
        const nameKey = user.name.toLowerCase();
        if (!usersByName.has(nameKey)) {
          usersByName.set(nameKey, []);
        }
        usersByName.get(nameKey)!.push(user);
      });

      // For each name, keep only the most recent user and remove duplicates
      usersByName.forEach((users, nameKey) => {
        if (users.length > 1) {
          // Sort by creation time, keep the most recent
          users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          const keepUser = users[0];
          const removeUsers = users.slice(1);

          // Remove duplicate users
          removeUsers.forEach(user => {
            this.ctx.storage.sql.exec(`DELETE FROM users WHERE sessionId = '${user.sessionId}'`);
            this.ctx.storage.sql.exec(`DELETE FROM channel_members WHERE sessionId = '${user.sessionId}'`);
            removedUsers++;
          });

          // Remove messages from deleted users
          removeUsers.forEach(user => {
            const userMessages = this.ctx.storage.sql.exec(`SELECT id FROM messages WHERE user = '${user.name}' AND id NOT IN (SELECT id FROM messages WHERE user = '${keepUser.name}')`).toArray() as any[];
            userMessages.forEach(msg => {
              this.ctx.storage.sql.exec(`DELETE FROM messages WHERE id = '${msg.id}'`);
              removedMessages++;
            });
          });

          // Remove private messages involving deleted users
          removeUsers.forEach(user => {
            const privateMsgs = this.ctx.storage.sql.exec(`SELECT id FROM private_messages WHERE senderId = '${user.sessionId}' OR recipientId = '${user.sessionId}'`).toArray() as any[];
            privateMsgs.forEach(msg => {
              this.ctx.storage.sql.exec(`DELETE FROM private_messages WHERE id = '${msg.id}'`);
              removedPrivateMessages++;
            });
          });
        }
      });

      // Remove old sessions (older than 24 hours) that are not online
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      const oldUsers = this.ctx.storage.sql.exec(`SELECT sessionId FROM users WHERE createdAt < ${oneDayAgo} AND sessionId NOT LIKE 'session_%'`).toArray() as any[];
      
      oldUsers.forEach(user => {
        this.ctx.storage.sql.exec(`DELETE FROM users WHERE sessionId = '${user.sessionId}'`);
        this.ctx.storage.sql.exec(`DELETE FROM channel_members WHERE sessionId = '${user.sessionId}'`);
        removedUsers++;
      });

      // Fix private messages with incorrect recipient IDs (names instead of session IDs)
      const privateMessagesWithNames = this.ctx.storage.sql.exec(`SELECT * FROM private_messages WHERE recipientId NOT LIKE 'session_%' AND recipientId NOT LIKE '%-%-%-%-%'`).toArray() as any[];
      
      privateMessagesWithNames.forEach(msg => {
        const recipientName = msg.recipientId;
        // Find the user with this name
        const userWithName = this.ctx.storage.sql.exec(`SELECT sessionId FROM users WHERE name = '${recipientName}' ORDER BY createdAt DESC LIMIT 1`).toArray() as any[];
        
        if (userWithName.length > 0) {
          // Update the recipient ID to use the session ID
          this.ctx.storage.sql.exec(`UPDATE private_messages SET recipientId = '${userWithName[0].sessionId}' WHERE id = '${msg.id}'`);
        } else {
          // No user found with this name, delete the message
          this.ctx.storage.sql.exec(`DELETE FROM private_messages WHERE id = '${msg.id}'`);
          removedPrivateMessages++;
        }
      });

      // Also fix sender IDs if they're using names instead of session IDs
      const privateMessagesWithNameSenders = this.ctx.storage.sql.exec(`SELECT * FROM private_messages WHERE senderId NOT LIKE 'session_%' AND senderId NOT LIKE '%-%-%-%-%'`).toArray() as any[];
      
      privateMessagesWithNameSenders.forEach(msg => {
        const senderName = msg.senderId;
        // Find the user with this name
        const userWithName = this.ctx.storage.sql.exec(`SELECT sessionId FROM users WHERE name = '${senderName}' ORDER BY createdAt DESC LIMIT 1`).toArray() as any[];
        
        if (userWithName.length > 0) {
          // Update the sender ID to use the session ID
          this.ctx.storage.sql.exec(`UPDATE private_messages SET senderId = '${userWithName[0].sessionId}' WHERE id = '${msg.id}'`);
        } else {
          // No user found with this name, delete the message
          this.ctx.storage.sql.exec(`DELETE FROM private_messages WHERE id = '${msg.id}'`);
          removedPrivateMessages++;
        }
      });

      // Reload users from database
      this.users.clear();
      this.sessions.clear();
      const updatedUsersData = this.ctx.storage.sql.exec(`SELECT * FROM users`).toArray() as any[];
      
      updatedUsersData.forEach(user => {
        this.users.set(user.sessionId, {
          name: user.name,
          sessionId: user.sessionId,
          isOnline: false,
          isAnon: user.isAnon === 1,
          lastSeen: Date.now(),
          currentChannel: user.currentChannel,
          internalId: user.internalId,
        });
        this.sessions.set(user.sessionId, {
          sessionId: user.sessionId,
          displayName: user.name,
          isAnon: user.isAnon === 1,
          createdAt: user.createdAt,
          currentChannel: user.currentChannel,
          internalId: user.internalId,
        });
      });

      // Reload private messages from database
      this.privateMessages.clear();
      const updatedPrivateMessagesData = this.ctx.storage.sql.exec(`SELECT * FROM private_messages`).toArray() as any[];
      
      updatedPrivateMessagesData.forEach(msg => {
        const senderId = msg.senderId;
        const recipientId = msg.recipientId;
        
        // Get the sender's display name
        const senderUser = this.users.get(senderId);
        const displayName = senderUser?.name || senderId;
        
        // Store for sender
        if (!this.privateMessages.has(senderId)) {
          this.privateMessages.set(senderId, new Map());
        }
        if (!this.privateMessages.get(senderId)!.has(recipientId)) {
          this.privateMessages.get(senderId)!.set(recipientId, []);
        }
        this.privateMessages.get(senderId)!.get(recipientId)!.push({
          id: msg.id,
          content: msg.content,
          user: displayName,
          role: "user",
          timestamp: msg.timestamp,
          isPrivate: true,
          recipientId: recipientId,
        });
        
        // Store for recipient
        if (!this.privateMessages.has(recipientId)) {
          this.privateMessages.set(recipientId, new Map());
        }
        if (!this.privateMessages.get(recipientId)!.has(senderId)) {
          this.privateMessages.get(recipientId)!.set(senderId, []);
        }
        this.privateMessages.get(recipientId)!.get(senderId)!.push({
          id: msg.id,
          content: msg.content,
          user: displayName,
          role: "user",
          timestamp: msg.timestamp,
          isPrivate: true,
          recipientId: recipientId,
        });
      });

      // Update channel member counts
      this.updateChannelMemberCounts();

      return {
        success: true,
        message: `Database cleaned successfully`,
        removedUsers,
        removedMessages,
        removedPrivateMessages,
      };
    } catch (error) {
      return {
        success: false,
        message: `Error cleaning database: ${error}`,
        removedUsers: 0,
        removedMessages: 0,
        removedPrivateMessages: 0,
      };
    }
  }

  markChatAsRead(sessionId: string, chatType: "private" | "channel", chatId: string) {
    const now = Date.now();
    
    if (!this.lastReadTimes.has(sessionId)) {
      this.lastReadTimes.set(sessionId, new Map());
    }
    this.lastReadTimes.get(sessionId)!.set(`${chatType}:${chatId}`, now);
    
    // Reset unread count
    if (!this.unreadCounts.has(sessionId)) {
      this.unreadCounts.set(sessionId, new Map());
    }
    this.unreadCounts.get(sessionId)!.set(`${chatType}:${chatId}`, 0);
  }

  incrementUnreadCount(sessionId: string, chatType: "private" | "channel", chatId: string) {
    if (!this.unreadCounts.has(sessionId)) {
      this.unreadCounts.set(sessionId, new Map());
    }
    
    const currentCount = this.unreadCounts.get(sessionId)!.get(`${chatType}:${chatId}`) || 0;
    this.unreadCounts.get(sessionId)!.set(`${chatType}:${chatId}`, currentCount + 1);
    
    return currentCount + 1;
  }

  getPrivateChatsList(sessionId: string): PrivateChatInfo[] {
    const privateChats: PrivateChatInfo[] = [];
    const userPrivateMessages = this.privateMessages.get(sessionId);
    
    if (!userPrivateMessages) return privateChats;
    
    userPrivateMessages.forEach((messages, recipientId) => {
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        const recipient = this.users.get(recipientId);
        const unreadCount = this.unreadCounts.get(sessionId)?.get(`private:${recipientId}`) || 0;
        
        privateChats.push({
          recipientId,
          recipientName: recipient?.name || recipientId,
          lastMessageTime: lastMessage.timestamp,
          unreadCount,
          lastMessage: lastMessage.content,
        });
      }
    });
    
    // Sort by last message time (most recent first)
    return privateChats.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
  }

  onMessage(connection: Connection, message: WSMessage) {
    const parsed = JSON.parse(message as string) as Message;
    
    if (parsed.type === "name_check") {
      const { available, isOwn } = this.checkNameAvailability(parsed.name, parsed.sessionId);
      
      connection.send(
        JSON.stringify({
          type: "name_check_result",
          available,
          isOwn,
          name: parsed.name,
        } satisfies Message),
      );
      return;
    }

    if (parsed.type === "reserve_name") {
      const reserved = this.reserveName(parsed.name, parsed.sessionId);
      
      if (reserved) {
        // For anonymous users, create them immediately with UUID
        if (parsed.isAnon) {
          this.saveUser(parsed.sessionId, parsed.name, true);
        }
        
        connection.send(
          JSON.stringify({
            type: "name_reserved",
            name: parsed.name,
            sessionId: parsed.sessionId,
          } satisfies Message),
        );
      } else {
        connection.send(
          JSON.stringify({
            type: "name_reservation_failed",
            name: parsed.name,
            reason: "Name is already taken or reserved",
          } satisfies Message),
        );
      }
      return;
    }

    if (parsed.type === "release_name") {
      this.releaseName(parsed.name, parsed.sessionId);
      return;
    }

    if (parsed.type === "join_channel") {
      this.joinChannel(parsed.sessionId, parsed.channelId);
      
      // Send channel messages to the user
      const channelMessages = this.channelMessages.get(parsed.channelId) || [];
      connection.send(
        JSON.stringify({
          type: "all",
          messages: channelMessages,
          channelId: parsed.channelId,
        } satisfies Message),
      );
      return;
    }

    if (parsed.type === "leave_channel") {
      this.leaveChannel(parsed.sessionId, parsed.channelId);
      return;
    }

    if (parsed.type === "open_private_chat") {
      const recipientId = parsed.recipientId;
      const senderId = parsed.sessionId;
      
      // Get private messages between these users
      const messages = this.privateMessages.get(senderId)?.get(recipientId) || [];
      
      connection.send(
        JSON.stringify({
          type: "private_messages",
          messages: messages,
          recipientId: recipientId,
        } satisfies Message),
      );
      return;
    }

    if (parsed.type === "db_cleanup") {
      // Only allow cleanup from admin users or in development
      const result = this.cleanupDatabase();
      
      connection.send(
        JSON.stringify({
          type: "db_cleanup_result",
          ...result,
        } satisfies Message),
      );
      
      // Broadcast updated users list to all clients
      const usersList = Array.from(this.users.values());
      this.broadcastMessage({
        type: "users_list",
        users: usersList,
      });
      
      // Broadcast updated channels list
      const channelsList = Array.from(this.channels.values());
      this.broadcastMessage({
        type: "channels_list",
        channels: channelsList,
      });
      
      return;
    }

    if (parsed.type === "mark_read") {
      this.markChatAsRead(parsed.sessionId, parsed.chatType, parsed.chatId);
      return;
    }

    if (parsed.type === "private_chats_list" && "sessionId" in parsed) {
      // Update the connection-to-session mapping
      this.connectionToSession.set(connection.id, parsed.sessionId);
      
      const privateChats = this.getPrivateChatsList(parsed.sessionId);
      connection.send(
        JSON.stringify({
          type: "private_chats_list",
          chats: privateChats,
        } satisfies Message),
      );
      
      // Also send unread count updates for all private chats
      const userUnreadCounts = this.unreadCounts.get(parsed.sessionId);
      if (userUnreadCounts) {
        for (const [chatKey, unreadCount] of userUnreadCounts) {
          if (chatKey.startsWith("private:")) {
            const chatId = chatKey.replace("private:", "");
            connection.send(
              JSON.stringify({
                type: "unread_update",
                sessionId: parsed.sessionId,
                chatType: "private",
                chatId: chatId,
                unreadCount: unreadCount,
              } satisfies Message),
            );
          }
        }
      }
      
      return;
    }

    if (parsed.type === "add" || parsed.type === "update") {
      // Check if user is registered
      const sessionId = parsed.sessionId || connection.id;
      
      // Update the connection-to-session mapping if we have a sessionId
      if (parsed.sessionId) {
        this.connectionToSession.set(connection.id, parsed.sessionId);
      }
      
      let user = this.users.get(sessionId);
      
      if (!user) {
        // User not registered, create them from the message
        let isAnon = parsed.isAnon || false;
        
        if (isAnon) {
          // For anonymous users, create them with UUID - no name validation needed
          this.saveUser(sessionId, parsed.user, true);
          user = this.users.get(sessionId)!;
        } else {
          // For regular users, check name availability
          const { available } = this.checkNameAvailability(parsed.user, sessionId);
          if (!available) {
            // Username is taken or illegal, send error message back to the client
            connection.send(JSON.stringify({
              type: "name_taken",
              name: parsed.user,
            }));
            return;
          }
          
          // Prevent non-anonymous users from using Anon-like names
          if (/^anon\d{4,}$/i.test(parsed.user)) {
            connection.send(JSON.stringify({
              type: "name_taken",
              name: parsed.user,
            }));
            return;
          }
          
          // Create regular user
          this.saveUser(sessionId, parsed.user, false);
          user = this.users.get(sessionId)!;
        }
        
        // Broadcast updated users list to all clients
        const usersList = Array.from(this.users.values());
        this.broadcastMessage({
          type: "users_list",
          users: usersList,
        });
        
        // For new users, if they're sending a channel message, automatically add them to that channel
        if (parsed.channelId) {
          this.joinChannel(sessionId, parsed.channelId);
        }
        
        // Send private chats list to new user if they have any
        const userPrivateChats = this.getPrivateChatsList(sessionId);
        if (userPrivateChats.length > 0) {
          connection.send(
            JSON.stringify({
              type: "private_chats_list",
              chats: userPrivateChats,
            } satisfies Message),
          );
          
          // Also send unread count updates for all private chats
          const userUnreadCounts = this.unreadCounts.get(sessionId);
          if (userUnreadCounts) {
            for (const [chatKey, unreadCount] of userUnreadCounts) {
              if (chatKey.startsWith("private:")) {
                const chatId = chatKey.replace("private:", "");
                connection.send(
                  JSON.stringify({
                    type: "unread_update",
                    sessionId: sessionId,
                    chatType: "private",
                    chatId: chatId,
                    unreadCount: unreadCount,
                  } satisfies Message),
                );
              }
            }
          }
        }
      } else {
        // User exists, mark as online
        user.isOnline = true;
        user.lastSeen = Date.now();
        
        // Send private chats list to existing user if they have any (in case they reconnected)
        const userPrivateChats = this.getPrivateChatsList(sessionId);
        if (userPrivateChats.length > 0) {
          connection.send(
            JSON.stringify({
              type: "private_chats_list",
              chats: userPrivateChats,
            } satisfies Message),
          );
          
          // Also send unread count updates for all private chats
          const userUnreadCounts = this.unreadCounts.get(sessionId);
          if (userUnreadCounts) {
            for (const [chatKey, unreadCount] of userUnreadCounts) {
              if (chatKey.startsWith("private:")) {
                const chatId = chatKey.replace("private:", "");
                connection.send(
                  JSON.stringify({
                    type: "unread_update",
                    sessionId: sessionId,
                    chatType: "private",
                    chatId: chatId,
                    unreadCount: unreadCount,
                  } satisfies Message),
                );
              }
            }
          }
        }
      }

      // For anon users, only allow messages in public chats (channel-based)
      if (user.isAnon && !parsed.channelId) {
        // Anon users can only send messages in channels
        return;
      }

      // Validate message length (3000 characters max)
      if (parsed.content && parsed.content.length > 3000) {
        connection.send(JSON.stringify({
          type: "message_too_long",
          message: "Message is too long. Please keep messages under 3,000 characters.",
        }));
        return;
      }

      // Add timestamp to message
      const messageWithTimestamp = {
        ...parsed,
        timestamp: Date.now(),
      };

      // Broadcast the message based on whether it's a channel message, private message, or direct message
      if (parsed.isPrivate) {
        // Private message - send only to sender and recipient
        const recipientId = parsed.recipientId!;
        const senderId = parsed.sessionId!;
        
        // Increment unread count for recipient (if not the sender)
        if (recipientId !== senderId) {
          this.incrementUnreadCount(recipientId, "private", senderId);
        }
        
        // Send to sender
        connection.send(JSON.stringify(messageWithTimestamp));
        
        // Send to recipient
        for (const conn of this.getConnections()) {
          const connSessionId = this.connectionToSession.get(conn.id) || conn.id;
          if (connSessionId === recipientId) {
            conn.send(JSON.stringify(messageWithTimestamp));
            break;
          }
        }
      } else if (parsed.channelId) {
        // Channel message - only broadcast to channel members (including sender)
        this.broadcastToChannel(parsed.channelId, messageWithTimestamp);
        
        // Increment unread count for channel members (except sender)
        const channelMembers = this.channelMembers.get(parsed.channelId) || new Set();
        channelMembers.forEach(memberId => {
          if (memberId !== sessionId && parsed.channelId) {
            this.incrementUnreadCount(memberId, "channel", parsed.channelId);
          }
        });
      } else {
        // Direct message - broadcast to everyone
        this.broadcast(JSON.stringify(messageWithTimestamp));
      }

      // let's update our local messages store
      if (parsed.isPrivate) {
        // Convert Message to ChatMessage for private message storage
        const chatMessage: ChatMessage = {
          id: messageWithTimestamp.id,
          content: messageWithTimestamp.content,
          user: messageWithTimestamp.user,
          role: messageWithTimestamp.role,
          timestamp: messageWithTimestamp.timestamp,
          isPrivate: true,
          recipientId: messageWithTimestamp.recipientId,
        };
        this.savePrivateMessage(chatMessage, sessionId);
        
        // Update private chats list for both sender and recipient
        const senderId = sessionId;
        const recipientId = parsed.recipientId!;
        
        // Send updated private chats list to sender
        const senderPrivateChats = this.getPrivateChatsList(senderId);
        connection.send(
          JSON.stringify({
            type: "private_chats_list",
            chats: senderPrivateChats,
          } satisfies Message),
        );
        
        // Send updated private chats list to recipient
        const recipientPrivateChats = this.getPrivateChatsList(recipientId);
        for (const conn of this.getConnections()) {
          const connSessionId = this.connectionToSession.get(conn.id) || conn.id;
          if (connSessionId === recipientId) {
            conn.send(
              JSON.stringify({
                type: "private_chats_list",
                chats: recipientPrivateChats,
              } satisfies Message),
            );
            break;
          }
        }
        
        // Also send unread count update to recipient
        const recipientUnreadCount = this.unreadCounts.get(recipientId)?.get(`private:${senderId}`) || 0;
        for (const conn of this.getConnections()) {
          const connSessionId = this.connectionToSession.get(conn.id) || conn.id;
          if (connSessionId === recipientId) {
            conn.send(
              JSON.stringify({
                type: "unread_update",
                sessionId: recipientId,
                chatType: "private",
                chatId: senderId,
                unreadCount: recipientUnreadCount,
              } satisfies Message),
            );
            break;
          }
        }
      } else {
        // Convert Message to ChatMessage for regular message storage
        const chatMessage: ChatMessage = {
          id: messageWithTimestamp.id,
          content: messageWithTimestamp.content,
          user: messageWithTimestamp.user,
          role: messageWithTimestamp.role,
          channelId: messageWithTimestamp.channelId,
          timestamp: messageWithTimestamp.timestamp,
        };
        this.saveMessage(chatMessage);
      }
    }
  }
}

export default {
  async fetch(request, env) {
    return (
      (await routePartykitRequest(request, { ...env })) ||
      env.ASSETS.fetch(request)
    );
  },
} satisfies ExportedHandler<Env>;
