import { GroupReservationStatus } from '@app/models/group-orders/group-status.model';
import { Participant } from '@app/models/group-orders/participant.model';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';

/** Стан першого завантаження екрана. */
export type GroupOrderLoadState = 'loading' | 'ready' | 'not-found' | 'error';

/** Усе, що потрібно екрану після першого завантаження. */
export interface GroupOrderInitialData {
  invite: GuestInvite;
  sessions: GroupSessionsResponse;
  ownerSessionId: string | null;
  status: GroupReservationStatus;
  maxCapacity: number | null;
}

/** Результат фонової синхронізації: свіжі кошики і статус групи. */
export interface GroupOrderSyncData {
  sessions: GroupSessionsResponse;
  status: GroupReservationStatus;
}

/** Картка учасника на екрані: дані + чи це Owner і чи можна видалити. */
export interface ParticipantCardView {
  participant: Participant;
  isMe: boolean;
  canRemove: boolean;
}
