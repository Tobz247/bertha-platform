import "server-only";

/**
 * Placeholder for SMS / WhatsApp / email notifications.
 * Today it only logs. Wire an SMS provider (e.g. Termii) in here later; every caller already
 * passes the business to reach and a short message.
 */
export async function notify(businessId: string, message: string) {
  console.info(`[notify] business=${businessId} ${message}`);
}
