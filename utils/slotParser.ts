import { getRequiredEnv } from './runtime.js';
import type { ResySlot } from './types.js';
import { convertTimeToTwelveHourFormat, isTimeBetween } from './helpers.js';

export async function slotParser(slots: ResySlot[]): Promise<string | null> {
  console.log(`There are ${slots.length} slots available`);

  for (const slot of slots) {
    const time = convertTimeToTwelveHourFormat(slot.date.start);
    const reservationType = slot.config.type;
    const slotId = await slotChooser(slot, time, reservationType);

    if (slotId) {
      return slotId;
    }
  }

  return null;
}

async function slotChooser(
  slot: ResySlot,
  time: string,
  type: string,
): Promise<string | null> {
  const earliest = getRequiredEnv('EARLIEST');
  const latest = getRequiredEnv('LATEST');

  if (isTimeBetween(earliest, latest, slot.date.start)) {
    console.log(
      `Booking a prime slot at ${time} ${type === 'Dining Room' ? 'in' : 'on'} the ${type}!`,
    );
    return slot.config.token;
  }

  return null;
}
