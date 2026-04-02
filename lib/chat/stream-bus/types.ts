export type StreamEventInput = {
  dbId?: number;
  logicalEventId?: number;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt?: Date | string;
};

export type StreamEventEnvelope = {
  dbId: number;
  logicalEventId: number;
  chatId: number;
  runId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date | string;
};

export type PublishEventsParams = {
  chatId: number;
  runId: string;
  events: StreamEventInput[];
};

export type ReadEventsAfterParams = {
  chatId: number;
  afterLogicalEventId: number;
  limit: number;
};

export type StreamBusAdapter = {
  publishEvents: (params: PublishEventsParams) => Promise<StreamEventEnvelope[]>;
  readEventsAfter: (
    params: ReadEventsAfterParams
  ) => Promise<StreamEventEnvelope[]>;
};
