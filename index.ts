import {
  checkForExistingBooking,
  fetchDataAndParseSlots,
  getBookingConfig,
  makeBooking,
  resetBookingState,
} from './utils/bookingLogic.js';
import {
  describeDiscoveryConfig,
  getDiscoveryConfig,
  runCalendarDiscovery,
} from './utils/discovery.js';
import { checkTokenExpiration } from './utils/helpers.js';
import {
  getPollingConfig,
  type PollingAttemptOutcome,
  runWithPolling,
} from './utils/polling.js';
import { buildSearchPlan, describeSearchPlan } from './utils/searchTargets.js';
import { getRequiredEnv } from './utils/runtime.js';

async function runBookingPass(): Promise<PollingAttemptOutcome> {
  resetBookingState();

  if (await checkForExistingBooking()) {
    return {
      success: false,
      shouldContinue: false,
    };
  }

  const slotId = await fetchDataAndParseSlots();
  if (!slotId) {
    return {
      success: false,
      shouldContinue: true,
    };
  }

  const bookToken = await getBookingConfig(slotId);
  if (!bookToken) {
    return {
      success: false,
      shouldContinue: true,
    };
  }

  const booking = await makeBooking(bookToken);

  if (booking?.resy_token) {
    console.log("You've got a reservation!");
    return {
      success: true,
      shouldContinue: false,
    };
  }

  console.log('Booking request completed without a reservation token.');
  return {
    success: false,
    shouldContinue: true,
  };
}

async function main(): Promise<void> {
  const discoveryConfig = getDiscoveryConfig();

  if (discoveryConfig.enabled) {
    console.log(describeDiscoveryConfig(discoveryConfig));
    await runCalendarDiscovery(discoveryConfig);
    return;
  }

  const authToken = getRequiredEnv('AUTH_TOKEN');
  const pollingConfig = getPollingConfig();

  if (!checkTokenExpiration(authToken)) {
    return;
  }

  console.log(describeSearchPlan(buildSearchPlan()));

  const booked = await runWithPolling(runBookingPass, pollingConfig);
  if (!booked) {
    console.log('Booking run completed without a reservation.');
  }
}

main().catch((error: unknown) => {
  console.error('Unhandled error while running the booking flow:', error);
  process.exitCode = 1;
});
