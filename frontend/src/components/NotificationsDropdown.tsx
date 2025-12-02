/**
 * Notifications Dropdown Component
 * 
 * Displays notifications in a dropdown menu accessible from the header
 * Shows unread count badge and allows marking as read/clearing
 * 
 * Features:
 * - Bell icon with unread count badge
 * - Dropdown list of notifications
 * - Mark individual/all as read
 * - Clear all notifications
 * - Click notification to navigate to relevant page
 */

import React from 'react';
import { Bell, Check, Trash2, AlertCircle, Activity, FileText, Rss, Shield } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { useNotificationStore, type Notification, type NotificationType } from '../stores/notificationStore';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

// Icon mapping for notification types
const typeIcons: Record<NotificationType, React.FC<{ className?: string }>> = {
  hazard: AlertCircle,
  rss: Rss,
  system: Activity,
  validation: Shield,
  report: FileText,
};

// Color mapping for notification severity
const severityColors = {
  info: 'text-blue-500',
  success: 'text-green-500',
  warning: 'text-yellow-500',
  error: 'text-red-500',
};

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onRemove: (id: string) => void;
  onNavigate: (link?: string) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onMarkRead,
  onRemove,
  onNavigate,
}) => {
  const Icon = typeIcons[notification.type];
  
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 hover:bg-muted/50 cursor-pointer rounded-md transition-colors',
        !notification.read && 'bg-muted/30'
      )}
      onClick={() => {
        onMarkRead(notification.id);
        onNavigate(notification.link);
      }}
    >
      <div className={cn('mt-0.5', severityColors[notification.severity])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium leading-none">{notification.title}</p>
          {!notification.read && (
            <div className="h-2 w-2 rounded-full bg-primary" />
          )}
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">{notification.message}</p>
        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true })}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(notification.id);
        }}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
};

export const NotificationsDropdown: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, markAsRead, markAllAsRead, removeNotification, clearAll, getUnreadCount } =
    useNotificationStore();
  
  const unreadCount = getUnreadCount();
  
  const handleNavigate = (link?: string) => {
    if (link) {
      navigate(link);
    }
  };
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}>
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {notifications.length > 0 && (
            <div className="flex gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={markAllAsRead}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Mark all read
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                onClick={clearAll}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear all
              </Button>
            </div>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No notifications</p>
          </div>
        ) : (
          <ScrollArea className="h-96">
            <div className="space-y-1 p-1">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkRead={markAsRead}
                  onRemove={removeNotification}
                  onNavigate={handleNavigate}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
