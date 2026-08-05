import { useState, useEffect } from 'react';
import { NotificationService, AppNotification } from '../services/notificationService';

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    // Initial load
    setNotifications(NotificationService.getNotifications());

    // Listen for updates
    const handleUpdate = () => {
      setNotifications(NotificationService.getNotifications());
    };

    window.addEventListener('novaire:notifications_updated', handleUpdate);
    return () => window.removeEventListener('novaire:notifications_updated', handleUpdate);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    notifications,
    unreadCount,
    markAllAsRead: () => NotificationService.markAllAsRead(),
    clearAll: () => NotificationService.clearAll(),
    addNotification: (category: any, title: string, desc: string) => NotificationService.addNotification(category, title, desc)
  };
}
