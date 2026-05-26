import { PipelineService } from './pipelineService';

let isActive = false;

async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

function sendNotification(title: string, body: string): void {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  // Only fire when tab is not active
  if (document.visibilityState === 'visible') return;
  new Notification(title, { body, icon: '/favicon.ico' });
}

export const PipelineNotifications = {
  async start(status: string): Promise<void> {
    await PipelineService.start();
    isActive = true;
    await this.update(status);
  },

  async update(status: string): Promise<void> {
    if (!isActive) return;
    await PipelineService.update(status);
  },

  async stop(): Promise<void> {
    if (!isActive) return;
    isActive = false;
    await PipelineService.stop();
  },

  async notifyComplete(title: string, body: string): Promise<void> {
    await requestNotificationPermission();
    sendNotification(title, body);
  },

  async notifyAttention(title: string, body: string): Promise<void> {
    await requestNotificationPermission();
    sendNotification(title, body);
  },
};
