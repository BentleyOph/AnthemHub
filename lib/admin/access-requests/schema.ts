export const ACCESS_REQUEST_STATUSES = ["PENDING", "APPROVED", "DENIED"] as const;

export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];

export const ACCESS_REQUEST_STATUS_FILTERS = [...ACCESS_REQUEST_STATUSES, "ALL"] as const;

export type AccessRequestStatusFilter = (typeof ACCESS_REQUEST_STATUS_FILTERS)[number];
