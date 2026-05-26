let isRunning = false;
let currentStatus = '';

export const PipelineService = {
  async start(): Promise<void> {
    isRunning = true;
    currentStatus = 'Starting...';
  },

  async update(status: string): Promise<void> {
    currentStatus = status;
  },

  async stop(): Promise<void> {
    isRunning = false;
    currentStatus = '';
  },

  isActive(): boolean {
    return isRunning;
  },

  getStatus(): string {
    return currentStatus;
  },
};
