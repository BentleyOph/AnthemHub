export const ACCESS_REQUEST_STATUSES = ["PENDING", "APPROVED", "DENIED"] as const;

export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];
