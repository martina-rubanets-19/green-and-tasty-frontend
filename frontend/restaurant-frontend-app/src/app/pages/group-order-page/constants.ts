import { GroupReservationStatus } from '@app/models/group-orders/group-status.model';

/** Інтервал фонової синхронізації, поки група Open. */
export const GROUP_SYNC_INTERVAL_MS = 15_000;

/** Текст бейджа біля заголовка. */
export const GROUP_STATUS_LABELS: Record<GroupReservationStatus, string> = {
  Open: 'Collecting pre-orders',
  Submitted: 'Sent to Restaurant',
  Closed: 'Closed',
};
