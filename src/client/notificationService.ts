// Notification Service for CloudChat
// Supports multiple notification backends with fallback options

export type NotificationMethod = 'null' | 'popup' | 'browser' | 'push';

export interface NotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
  silent?: boolean;
  vibrate?: number[];
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

export interface NotificationServiceConfig {
  methods: NotificationMethod[];
  // Mobile-specific settings
  disableBrowserAPIOnMobile?: boolean;
  // Fallback order for different methods
  fallbackOrder?: NotificationMethod[];
}

class NotificationService {
  private config: NotificationServiceConfig;
  private isMobile: boolean;
  private isSecureContext: boolean;
  private browserPermission: NotificationPermission = 'denied';
  private pushSubscription: PushSubscription | null = null;

  constructor(config: NotificationServiceConfig = { methods: ['popup'] }) {
    this.config = {
      disableBrowserAPIOnMobile: true,
      fallbackOrder: ['browser', 'popup', 'null'],
      ...config
    };
    
    this.isMobile = this.detectMobile();
    this.isSecureContext = window.isSecureContext;
    this.initialize();
  }

  private detectMobile(): boolean {
    // Simple mobile detection
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           window.innerWidth <= 768;
  }

  private async initialize(): Promise<void> {
    // Check browser notification permission
    if (typeof Notification !== 'undefined' && 'permission' in Notification) {
      this.browserPermission = Notification.permission;
    }

    // Check push notification support
    if (this.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        this.pushSubscription = await registration.pushManager.getSubscription();
      } catch (error) {
        console.error('Error checking push subscription:', error);
      }
    }
  }

  // Get available notification methods based on current environment
  private getAvailableMethods(): NotificationMethod[] {
    const available: NotificationMethod[] = [];

    // Always available
    available.push('null');
    available.push('popup');

    // Browser API - check if available and enabled
    if (this.config.methods.includes('browser') && 
        typeof Notification !== 'undefined' && 
        this.browserPermission === 'granted' &&
        this.isSecureContext &&
        !(this.config.disableBrowserAPIOnMobile && this.isMobile)) {
      available.push('browser');
    }

    // Push notifications - check if available and enabled
    if (this.config.methods.includes('push') && 
        this.isSecureContext && 
        'serviceWorker' in navigator && 
        'PushManager' in window &&
        this.pushSubscription) {
      available.push('push');
    }

    return available;
  }

  // Get the best available method based on fallback order
  private getBestMethod(): NotificationMethod {
    const available = this.getAvailableMethods();
    const fallbackOrder = this.config.fallbackOrder || ['browser', 'popup', 'null'];
    
    for (const method of fallbackOrder) {
      if (available.includes(method)) {
        return method;
      }
    }
    
    return 'null'; // Always fallback to null
  }

  // Show notification using the best available method
  async show(options: NotificationOptions): Promise<boolean> {
    console.log("NotificationService.show() called with:", options);
    const method = this.getBestMethod();
    console.log("Using notification method:", method);
    
    try {
      switch (method) {
        case 'null':
          return this.showNullNotification(options);
        case 'popup':
          return this.showPopupNotification(options);
        case 'browser':
          return this.showBrowserNotification(options);
        case 'push':
          return this.showPushNotification(options);
        default:
          return false;
      }
    } catch (error) {
      console.error(`Failed to show notification with method ${method}:`, error);
      // Try fallback to popup
      if (method !== 'popup') {
        return this.showPopupNotification(options);
      }
      return false;
    }
  }

  // Null notification (does nothing)
  private async showNullNotification(options: NotificationOptions): Promise<boolean> {
    console.log('Null notification:', options.title, options.body);
    return true;
  }

  // In-browser popup notification
  private async showPopupNotification(options: NotificationOptions): Promise<boolean> {
    console.log("Creating popup notification:", options);
    // Create a simple in-browser popup
    const popup = document.createElement('div');
    popup.className = 'notification-popup';
    popup.innerHTML = `
      <div class="notification-popup-content">
        <div class="notification-popup-header">
          <span class="notification-popup-title">${options.title}</span>
          <button class="notification-popup-close" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
        </div>
        ${options.body ? `<div class="notification-popup-body">${options.body}</div>` : ''}
      </div>
    `;

    // Add styles
    popup.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #0088cc;
      color: white;
      padding: 0;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      max-width: 300px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: notification-slide-in 0.3s ease-out;
    `;

    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
      @keyframes notification-slide-in {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      .notification-popup-content {
        padding: 12px 16px;
      }
      .notification-popup-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }
      .notification-popup-title {
        font-weight: 600;
        font-size: 14px;
      }
      .notification-popup-close {
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.7;
      }
      .notification-popup-close:hover {
        opacity: 1;
      }
      .notification-popup-body {
        font-size: 13px;
        opacity: 0.9;
        line-height: 1.4;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(popup);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (popup.parentElement) {
        popup.remove();
      }
    }, 5000);

    return true;
  }

  // Browser notification API
  private async showBrowserNotification(options: NotificationOptions): Promise<boolean> {
    if (typeof Notification === 'undefined' || this.browserPermission !== 'granted') {
      return false;
    }

    const notification = new Notification(options.title, {
      body: options.body,
      icon: options.icon,
      tag: options.tag || 'cloudchat-message',
      requireInteraction: options.requireInteraction || false,
      silent: options.silent || false,
      actions: options.actions
    } as NotificationOptions);

    // Handle click
    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // Auto-close after 5 seconds
    setTimeout(() => {
      notification.close();
    }, 5000);

    return true;
  }

  // Push notification
  private async showPushNotification(options: NotificationOptions): Promise<boolean> {
    // This would typically send to a server to trigger a push notification
    // For now, we'll just log it
    console.log('Push notification would be sent:', options);
    return true;
  }

  // Request browser notification permission
  async requestBrowserPermission(): Promise<NotificationPermission> {
    if (typeof Notification === 'undefined') {
      return 'denied';
    }

    if (this.config.disableBrowserAPIOnMobile && this.isMobile) {
      console.log('Browser notifications disabled on mobile');
      return 'denied';
    }

    if (!this.isSecureContext) {
      console.log('Browser notifications require HTTPS');
      return 'denied';
    }

    if (Notification.permission === 'default') {
      try {
        const permission = await Notification.requestPermission();
        this.browserPermission = permission;
        return permission;
      } catch (error) {
        console.error('Error requesting notification permission:', error);
        return 'denied';
      }
    }

    return Notification.permission;
  }

  // Subscribe to push notifications
  async subscribeToPush(): Promise<boolean> {
    if (!this.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array('YOUR_VAPID_PUBLIC_KEY')
      });
      
      this.pushSubscription = subscription;
      return true;
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
      return false;
    }
  }

  // Unsubscribe from push notifications
  async unsubscribeFromPush(): Promise<boolean> {
    if (this.pushSubscription) {
      try {
        await this.pushSubscription.unsubscribe();
        this.pushSubscription = null;
        return true;
      } catch (error) {
        console.error('Failed to unsubscribe from push notifications:', error);
        return false;
      }
    }
    return false;
  }

  // Helper function to convert VAPID key
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Get current status
  getStatus() {
    const status = {
      isMobile: this.isMobile,
      isSecureContext: this.isSecureContext,
      browserPermission: this.browserPermission,
      hasPushSubscription: !!this.pushSubscription,
      availableMethods: this.getAvailableMethods(),
      bestMethod: this.getBestMethod(),
      config: this.config
    };
    console.log("NotificationService.getStatus():", status);
    return status;
  }

  // Update configuration
  updateConfig(newConfig: Partial<NotificationServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// Create and export a default instance
export const notificationService = new NotificationService({
  methods: ['popup', 'browser', 'push'],
  disableBrowserAPIOnMobile: true,
  fallbackOrder: ['browser', 'popup', 'null']
});

export default notificationService; 