<script setup lang="ts">
import type { Hotel } from '../api/types';
import { formatMoney, plural, titleCase } from '../utils/format';

defineProps<{
  hotel: Hotel;
  canAddToTrip: boolean;
}>();

defineEmits<{
  addToTrip: [hotel: Hotel];
}>();
</script>

<template>
  <article class="card hotel-card" data-testid="hotel-card">
    <img
      :src="hotel.imageUrl"
      :alt="`${hotel.destinationName}, sample illustration`"
      loading="lazy"
    />
    <div>
      <div class="row row--between">
        <h3>{{ hotel.name }}</h3>
        <span class="chip">★ {{ hotel.rating.toFixed(1) }}</span>
      </div>
      <p class="muted small">{{ hotel.address }}</p>
      <p>
        <span v-for="amenity in hotel.amenities" :key="amenity" class="chip">{{
          titleCase(amenity)
        }}</span>
      </p>
      <p class="small">
        From <strong>{{ formatMoney(hotel.fromNightly) }}</strong> a night ·
        {{ formatMoney(hotel.fromTotal) }} total for {{ plural(hotel.nights, 'night') }} (incl. tax,
        sample price)
      </p>
      <div
        v-for="room in hotel.rooms"
        :key="room.id"
        class="room row row--between"
        data-testid="room-option"
      >
        <div>
          <strong>{{ room.name }}</strong>
          <span class="muted small"> · sleeps {{ room.capacity }}</span>
        </div>
        <div class="small">
          {{ formatMoney(room.nightlyPrice) }} a night ·
          <strong>{{ formatMoney(room.price.total) }}</strong> total
        </div>
      </div>
      <p>
        <button
          type="button"
          class="primary button--small"
          :disabled="!canAddToTrip"
          data-testid="add-hotel"
          @click="$emit('addToTrip', hotel)"
        >
          Add to trip
        </button>
        <span v-if="!canAddToTrip" class="muted small">
          Choose a trip above to add this hotel.</span
        >
      </p>
    </div>
  </article>
</template>
