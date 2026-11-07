<script setup lang="ts">
import { ref } from 'vue';
import { endpoints } from '../api/endpoints';
import type { Payment, PaymentMethod, TripCost } from '../api/types';
import { PAYMENT_METHOD_LABELS } from '../utils/checkout';
import { errorMessage } from '../utils/errors';
import { formatDate, formatMoney } from '../utils/format';

/**
 * The trip's price and its fake checkout (SCRUM-25). Flight and hotel checkout end here too, so
 * every booking is paid for through this one form.
 */
const props = defineProps<{
  tripId: number;
  cost: TripCost;
  payment: Payment | null;
}>();

const emit = defineEmits<{ paid: [payment: Payment] }>();

const payMethod = ref<PaymentMethod>('credit_card');
const paying = ref(false);
const message = ref<{ kind: 'success' | 'error'; text: string } | null>(null);

async function pay(): Promise<void> {
  paying.value = true;
  message.value = null;
  try {
    const { payment } = await endpoints.trips.pay(props.tripId, payMethod.value);
    message.value = { kind: 'success', text: 'Payment complete. Your trip is booked.' };
    emit('paid', payment);
  } catch (err) {
    message.value = { kind: 'error', text: errorMessage(err) };
  } finally {
    paying.value = false;
  }
}
</script>

<template>
  <section class="card" aria-label="Payment" data-testid="payment">
    <h2>Payment</h2>
    <p v-if="payment" data-testid="payment-receipt">
      <span class="kind kind--booked">Paid</span>
      {{ formatMoney(payment.amount) }} by {{ PAYMENT_METHOD_LABELS[payment.method] }} on
      {{ formatDate(payment.createdAt.slice(0, 10)) }} · Receipt #{{ payment.id }}. This trip is
      locked and can no longer be changed.
    </p>
    <template v-else>
      <p v-if="cost.lines.length === 0" class="muted small">
        Add a flight or hotel to this trip to see its price.
      </p>
      <ul v-else class="timeline">
        <li
          v-for="line in cost.lines"
          :key="line.itemId"
          class="timeline__item"
          style="grid-template-columns: 1fr auto"
          data-testid="cost-line"
        >
          <div>
            <span class="kind">{{ line.kind }}</span
            >{{ line.title }}
            <div v-if="line.detail" class="muted small">{{ line.detail }}</div>
          </div>
          <strong>{{ formatMoney(line.amount) }}</strong>
        </li>
      </ul>
      <form class="row row--between" aria-label="Pay for trip" @submit.prevent="pay">
        <strong data-testid="cost-total">Total: {{ formatMoney(cost.total) }}</strong>
        <div class="row">
          <label for="pay-method" class="small" style="margin: 0">Pay with</label>
          <select id="pay-method" v-model="payMethod" style="width: auto">
            <option v-for="(label, value) in PAYMENT_METHOD_LABELS" :key="value" :value="value">
              {{ label }}
            </option>
          </select>
          <button
            type="submit"
            class="primary"
            :disabled="paying || cost.total <= 0"
            data-testid="pay"
          >
            {{ paying ? 'Paying…' : 'Pay now' }}
          </button>
        </div>
      </form>
      <p class="muted small">
        Sample prices including taxes and fees. Flights and stays booked through checkout use your
        passengers, bags, room and requests; anything added without checkout is priced for one
        passenger or the cheapest room. No real payment is taken. Once paid, the trip can no longer
        be changed.
      </p>
    </template>
    <div v-if="message" class="alert" :class="`alert--${message.kind}`" role="status">
      {{ message.text }}
    </div>
  </section>
</template>
