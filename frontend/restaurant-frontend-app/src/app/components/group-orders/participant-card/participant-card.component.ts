import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Participant } from '@app/models/group-orders/participant.model';
import { ParticipantCardLine } from './models';

@Component({
  selector: 'app-participant-card',
  imports: [CurrencyPipe],
  templateUrl: './participant-card.component.html',
  styleUrl: './participant-card.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ParticipantCardComponent {
  // що картка отримує ззовні — як параметр функції
  readonly participant = input.required<Participant>();
  /** Власна картка Owner — підписується «My Pre-Order». */
  readonly isMe = input(false);
  /** Показати посилання «Remove Guest» (лише для гостей, поки група Open). */
  readonly canRemove = input(false);

  readonly removeClick = output<Participant>();

  // рахується саме, коли змінюється participant
  readonly title = computed(() => {
    const person = this.participant();
    if (this.isMe()) {
      return 'My Pre-Order';
    }
    return person.type === 'Owner' ? `Owner: ${person.name}` : `Guest: ${person.name}`;
  });

  /** Рядки кошика з уже порахованою сумою — без арифметики в шаблоні. */
  readonly lines = computed<ParticipantCardLine[]>(() =>
    this.participant().items.map((item) => ({
      dish: item.dish,
      quantity: item.quantity,
      initial: item.dish.name.charAt(0).toUpperCase(),
      lineTotal: item.dish.price * item.quantity,
    })),
  );

  readonly removeLabel = computed(() => `Remove ${this.participant().name}`);

  onRemove(): void {
    this.removeClick.emit(this.participant());
  }
}
