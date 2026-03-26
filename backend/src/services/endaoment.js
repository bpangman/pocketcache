/**
 * Endaoment Service
 *
 * Responsibilities:
 *  1. Authenticate with Endaoment API using OAuth client credentials
 *  2. Submit a grant from PocketChange's platform DAF to the user's chosen nonprofit
 *  3. Check grant status
 *
 * Setup required:
 *  - Open a ticket with partnerships@endaoment.org to get OAuth credentials
 *  - Reference: https://github.com/endaoment/endaoment-integration-docs
 *
 * Flow:
 *  - PocketChange holds ONE platform-level DAF account at Endaoment
 *  - Quarterly sweep deposits the full Treasury balance into this DAF
 *  - We then split the DAF balance into individual grants per nonprofit
 *    (proportional to each user's accumulated donations for the quarter)
 *
 * Simpler alternative (confirm with Endaoment during onboarding):
 *  - Some partners submit one grant per user per quarter directly to each nonprofit
 *  - Endaoment handles the DAF receipt and grant execution automatically
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const ENDAOMENT_API = process.env.ENDAOMENT_API_URL ?? 'https://api.endaoment.org';
let _accessToken = null;
let _tokenExpiry = 0;

/**
 * Get a valid OAuth access token (cached, auto-refreshes).
 * Uses client_credentials grant — no user interaction required.
 */
async function getAccessToken() {
  if (_accessToken && Date.now() < _tokenExpiry - 60_000) return _accessToken;

  const response = await axios.post(`${ENDAOMENT_API}/oauth/token`, {
    grant_type: 'client_credentials',
    client_id: process.env.ENDAOMENT_CLIENT_ID,
    client_secret: process.env.ENDAOMENT_CLIENT_SECRET,
  });

  _accessToken = response.data.access_token;
  _tokenExpiry = Date.now() + (response.data.expires_in * 1000);
  return _accessToken;
}

function authHeaders() {
  return { headers: { Authorization: `Bearer ${_accessToken}` } };
}

/**
 * Look up a nonprofit by EIN or Endaoment org ID.
 * Use this during cause selection to validate org IDs.
 */
export async function getNonprofit(orgId) {
  await getAccessToken();
  const response = await axios.get(`${ENDAOMENT_API}/v1/orgs/${orgId}`, authHeaders());
  return response.data;
}

/**
 * Submit a grant from PocketChange's platform DAF to a nonprofit.
 *
 * This is called AFTER the Treasury sweep has deposited funds to Endaoment.
 * amount: dollars (not cents)
 * orgId: Endaoment org ID for the nonprofit (stored in users.cause_org_id)
 * description: human-readable note on the grant (e.g. "Q1 2026 PocketChange user donations")
 *
 * Endaoment automatically emails the user a tax receipt after the grant is processed.
 */
export async function submitGrant({ orgId, amountDollars, description, metadata = {} }) {
  await getAccessToken();

  // TODO: Confirm exact grant submission endpoint with Endaoment during onboarding
  // The endaoment-integration-docs repo has the canonical API reference
  const response = await axios.post(
    `${ENDAOMENT_API}/v1/grants`,
    {
      to_org_id: orgId,
      amount: amountDollars,
      description,
      metadata,
    },
    authHeaders()
  );

  return {
    grantId: response.data.id,
    status: response.data.status,
    amount: response.data.amount,
  };
}

/**
 * Check the status of a previously submitted grant.
 * Statuses: 'pending' | 'processing' | 'completed' | 'failed'
 */
export async function getGrantStatus(grantId) {
  await getAccessToken();
  const response = await axios.get(`${ENDAOMENT_API}/v1/grants/${grantId}`, authHeaders());
  return response.data.status;
}
