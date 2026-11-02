import { DishShort } from '@app/models/group-orders/participant.model';

/** Рядок кошика в картці учасника: страва, кількість і вже порахована сума. */
export interface ParticipantCardLine {
  dish: DishShort;
  quantity: number;
  initial: string;
  lineTotal: number;
}
