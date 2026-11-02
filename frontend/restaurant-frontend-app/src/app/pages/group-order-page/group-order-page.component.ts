import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  Observable,
  Subscription,
  catchError,
  defer,
  exhaustMap,
  finalize,
  forkJoin,
  interval,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';
import { ParticipantCardComponent } from '@app/components/group-orders/participant-card/participant-card.component';
import { GroupReservationStatus } from '@app/models/group-orders/group-status.model';
import { Participant } from '@app/models/group-orders/participant.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { ToastService } from '@app/services/toast/toast.service';
import { ModalComponent } from '@app/shared/custom-components/modal/modal.component';
import { consolidatePreOrder } from '@app/shared/helpers/consolidate-pre-order';
import { GROUP_STATUS_LABELS, GROUP_SYNC_INTERVAL_MS } from './constants';
import { GroupOrderInitialData, GroupOrderLoadState, GroupOrderSyncData, ParticipantCardView } from './models';

@Component({
  selector: 'app-group-order-page',
  imports: [ParticipantCardComponent, ModalComponent, CurrencyPipe, DatePipe],
  templateUrl: './group-order-page.component.html',
  styleUrl: './group-order-page.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class GroupOrderPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly groupOrders = inject(GroupOrdersService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly reservationId = this.route.snapshot.paramMap.get('reservationId') ?? '';

  // ---------- стан ----------
  readonly loadState = signal<GroupOrderLoadState>('loading');
  readonly invite = signal<GuestInvite | null>(null);
  readonly participants = signal<Participant[]>([]);
  readonly ownerSessionId = signal<string | null>(null);
  readonly status = signal<GroupReservationStatus>('Open');
  readonly maxCapacity = signal<number | null>(null);

  readonly submitDialogOpen = signal(false);
  readonly submitting = signal(false);
  readonly guestToRemove = signal<Participant | null>(null);
  readonly removing = signal(false);

  readonly refreshing = signal(false);
  readonly lastUpdated = signal<Date | null>(null);
  readonly refreshFailed = signal(false);

  // ---------- похідні значення ----------
  readonly groupReservationId = computed(() => this.invite()?.GroupReservationId ?? '');
  readonly isOpen = computed(() => this.status() === 'Open');
  readonly statusLabel = computed(() => GROUP_STATUS_LABELS[this.status()]);

  /** Замовлення для ресторану: лише підтверджені кошики, однакові страви об'єднані. */
  readonly consolidated = computed(() => consolidatePreOrder(this.participants()));
  readonly consolidatedLines = computed(() =>
    this.consolidated().items.map((item) => ({ ...item, lineTotal: item.dish.price * item.quantity })),
  );
  /** Grand Total = сума консолідованого замовлення, а не `total` з API. */
  readonly grandTotal = computed(() => this.consolidated().total);

  readonly hasAnyDishes = computed(() => this.participants().some((person) => person.items.length > 0));
  readonly pendingCount = computed(() => this.participants().filter((person) => !person.isSubmitted).length);
  readonly pendingMessage = computed(() => {
    const count = this.pendingCount();
    const who = count === 1 ? '1 participant hasn’t' : `${count} participants haven’t`;
    return `${who} submitted their cart yet — their dishes won’t be included in the order.`;
  });

  readonly guestsLabel = computed(() => {
    const max = this.invite()?.MaxGuestCount ?? this.maxCapacity();
    const count = this.participants().length;
    return max ? `${count} of ${max} guests` : `${count} guests`;
  });

  /** Картки учасників з уже порахованими прапорцями — без логіки в шаблоні. */
  readonly cards = computed<ParticipantCardView[]>(() => {
    const ownerId = this.ownerSessionId();
    const open = this.isOpen();
    return this.participants().map((participant) => ({
      participant,
      isMe: participant.id === ownerId,
      canRemove: open && participant.type === 'Guest' && participant.id !== ownerId,
    }));
  });

  readonly canSubmit = computed(() => this.isOpen() && this.consolidated().items.length > 0 && !this.submitting());

  private loadSubscription?: Subscription;
  private syncSubscription?: Subscription;
  private refreshSubscription?: Subscription;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopSync();
      this.refreshSubscription?.unsubscribe();
    });
    this.load();
  }

  // ---------- перше завантаження ----------
  load(): void {
    this.stopSync();
    this.loadSubscription?.unsubscribe();
    this.loadState.set('loading');

    this.loadSubscription = this.groupOrders
      .getGroupInvite$(this.reservationId)
      .pipe(
        switchMap((invite) => this.loadGroup$(invite)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (data) => {
          this.invite.set(data.invite);
          this.ownerSessionId.set(data.ownerSessionId);
          this.maxCapacity.set(data.maxCapacity);
          this.applySnapshot(data.sessions.participants, data.status);
          this.loadState.set('ready');
          this.startSync();
        },
        error: (error: unknown) => {
          const notFound = error instanceof HttpErrorResponse && error.status === 404;
          this.loadState.set(notFound ? 'not-found' : 'error');
        },
      });
  }

  private loadGroup$(invite: GuestInvite): Observable<GroupOrderInitialData> {
    const groupId = invite.GroupReservationId;
    return forkJoin({
      sessions: this.groupOrders.getSessions$(groupId),
      // Без id власної сесії екран усе одно працює — просто без підпису «My Pre-Order».
      ownerSessionId: this.groupOrders.getOwnerSessionId$(this.reservationId).pipe(catchError(() => of(null))),
      groupStatus: this.groupOrders.getStatus$(groupId).pipe(catchError(() => of(null))),
    }).pipe(
      map(({ sessions, ownerSessionId, groupStatus }) => ({
        invite,
        sessions,
        ownerSessionId,
        status: groupStatus?.status ?? 'Open',
        maxCapacity: groupStatus?.maxCapacity ?? null,
      })),
    );
  }

  // ---------- фонова синхронізація (рівень 3) ----------
  /** Кнопка «Refresh»: синхронізуватись зараз. Поки попередній запит не відповів — новий не стартує. */
  refresh(): void {
    if (this.refreshing() || !this.groupReservationId()) {
      return;
    }
    this.refreshSubscription = this.sync$().subscribe();
  }

  private startSync(): void {
    this.stopSync();
    if (!this.isOpen()) {
      return;
    }
    this.syncSubscription = interval(GROUP_SYNC_INTERVAL_MS)
      .pipe(exhaustMap(() => (this.refreshing() ? EMPTY : this.sync$())))
      .subscribe();
  }

  private stopSync(): void {
    this.syncSubscription?.unsubscribe();
    this.syncSubscription = undefined;
  }

  /** Тихо тягне свіжі кошики і статус. Помилка не ламає екран — лишаються останні дані. */
  private sync$(): Observable<GroupOrderSyncData> {
    const groupId = this.groupReservationId();
    return defer(() => {
      this.refreshing.set(true);
      return forkJoin({
        sessions: this.groupOrders.getSessions$(groupId, { silent: true }),
        groupStatus: this.groupOrders.getStatus$(groupId, { silent: true }),
      });
    }).pipe(
      map(({ sessions, groupStatus }) => ({ sessions, status: groupStatus.status })),
      tap((data) => {
        this.applySnapshot(data.sessions.participants, data.status);
        if (!this.isOpen()) {
          this.stopSync();
        }
      }),
      catchError(() => {
        this.refreshFailed.set(true);
        return EMPTY;
      }),
      finalize(() => this.refreshing.set(false)),
    );
  }

  private applySnapshot(participants: Participant[], status: GroupReservationStatus): void {
    this.participants.set(participants);
    this.status.set(status);
    this.lastUpdated.set(new Date());
    this.refreshFailed.set(false);
  }

  // ---------- Submit Pre-Order ----------
  openSubmitDialog(): void {
    if (this.canSubmit()) {
      this.submitDialogOpen.set(true);
    }
  }

  closeSubmitDialog(): void {
    if (!this.submitting()) {
      this.submitDialogOpen.set(false);
    }
  }

  confirmSubmit(): void {
    // подвійний клік / повторний клік поки запит іде — нічого не відправляє
    if (!this.canSubmit()) {
      return;
    }
    this.submitting.set(true);

    this.groupOrders
      .submit$(this.groupReservationId(), this.reservationId)
      .pipe(
        finalize(() => this.submitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.status.set('Submitted');
          this.stopSync();
          this.submitDialogOpen.set(false);
          this.toast.success('Pre-order sent to the restaurant');
        },
        // toast з текстом від API вже показав tokenInterceptor — не дублюємо
        error: () => this.submitDialogOpen.set(false),
      });
  }

  // ---------- Remove Guest (бонус) ----------
  askRemove(person: Participant): void {
    this.guestToRemove.set(person);
  }

  closeRemoveDialog(): void {
    if (!this.removing()) {
      this.guestToRemove.set(null);
    }
  }

  confirmRemove(): void {
    const guest = this.guestToRemove();
    if (!guest || this.removing()) {
      return;
    }
    this.removing.set(true);

    this.groupOrders
      .removeSession$(this.groupReservationId(), guest.id)
      .pipe(
        finalize(() => this.removing.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (snapshot) => {
          this.participants.set(snapshot.participants);
          this.lastUpdated.set(new Date());
          this.guestToRemove.set(null);
          this.toast.success(`${guest.name} was removed from the reservation`);
        },
        // toast з помилкою показав tokenInterceptor; список не змінюємо
        error: () => this.guestToRemove.set(null),
      });
  }
}
