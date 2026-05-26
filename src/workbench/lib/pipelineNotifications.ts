import { PipelineService } from './pipelineService';

let isActive = false;

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
};
