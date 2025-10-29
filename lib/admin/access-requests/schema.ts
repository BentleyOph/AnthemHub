import {
  ACCESS_REQUEST_STATUSES,
  type AccessRequestStatus,
} from "@/lib/access-requests/constants";

export { ACCESS_REQUEST_STATUSES, type AccessRequestStatus };

export const ACCESS_REQUEST_STATUS_FILTERS = [...ACCESS_REQUEST_STATUSES, "ALL"] as const;

export type AccessRequestStatusFilter = (typeof ACCESS_REQUEST_STATUS_FILTERS)[number];
