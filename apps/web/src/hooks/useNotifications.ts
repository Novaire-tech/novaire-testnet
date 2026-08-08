import { useSyncExternalStore } from 'react';
import { NotificationService, NotificationCategory } from '../services/notificationService';

function subscribe(callback: () => void) {
  window.addEventListener('novaire:notifications_updated', callback);
  return () => window.removeEventListener('novaire:notifications_updated', callback);
}

export function useNotifications() {
  const notifications = useSyncExternalStore(
    subscribe,
    NotificationService.getNotifications.bind(NotificationService),
    () => []
  );

  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    notifications,
    unreadCount,
    markAllAsRead: () => NotificationService.markAllAsRead(),
    clearAll: () => NotificationService.clearAll(),
    addNotification: (category: NotificationCategory, title: string, desc: string) => NotificationService.addNotification(category, title, desc)
  };
}
