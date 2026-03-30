import {
  checkForExistingBooking,
  fetchDataAndParseSlots,
  getBookingConfig,
  makeBooking,
} from './utils/bookingLogic.js';
import { checkTokenExpiration } from './utils/helpers.js';
import { getRequiredEnv } from './utils/runtime.js';

async function main(): Promise<void> {
  const authToken = getRequiredEnv('AUTH_TOKEN');
  const tokenIsValid = checkTokenExpiration(authToken);

  if (!tokenIsValid) {
    return;
  }

  const hasExistingBooking = await checkForExistingBooking();
  if (hasExistingBooking) {
    return;
  }

  const slotId = await fetchDataAndParseSlots();
  if (!slotId) {
    return;
  }

  const bookToken = await getBookingConfig(slotId);
  if (!bookToken) {
    return;
  }

  const booking = await makeBooking(bookToken);
  if (booking?.resy_token) {
    console.log("You've got a reservation!");
    return;
  }

  console.log('Booking attempt completed without a reservation token.');
}

main().catch((error: unknown) => {
  console.error('Unhandled error while running the booking flow:', error);
  process.exitCode = 1;
});
