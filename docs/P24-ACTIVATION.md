# Przelewy24 activation

Verified 8 September 2026: production methods include card 241, Apple Pay 252,
Google Pay 264 and Visa Mobile 299. Raty 303 is absent. PayPo 317 is a separate
product and is not evidence of Raty 0% activation.

Cards and wallets appear automatically from the provider's enabled methods.
Registration pins the selected method; Przelewy24 handles card data and any
device/browser eligibility. Bank counts exclude these wallets.

## Raty activation checklist

1. Obtain the promised provider activation confirmation, specifically for the
   agreed **0%** offer. A method status flag alone proves neither the rate nor
   the permitted number of installments.
2. Resolve the existing 4 September hold: provider-controlled basket/tenor
   restrictions (under 2,000 PLN: 5 only; 2,000 to 2,999.99 PLN: up to 10;
   3,000 PLN and above: up to 20) and the linked-credit wording in the terms and privacy notice.
   The registration payload has no locally implemented tenor controls. Do not
   advertise an unverified 5/10/20-installment promise.
3. Confirm method 303 has `status: true` in the authenticated provider methods
   response. Run `node tests/p24-pipeline.test.mjs` in the canonical repo.
4. From `/root/englishmetro`, enable the reviewed offer with
   `node_modules/.bin/convex env set P24_RATY_ZERO_CONFIRMED true --prod`.
   No code deployment is needed. This is a manual confirmation switch, not an
   automated inference that every enabled installment product has a 0% rate.
5. Check `p24:listMethods` and `p24:installmentWidgetConfig` through the public
   site API, then refresh pricing and checkout. Both the switch and provider
   availability must be present. The pricing widget retains its 2,000 PLN
   display floor; this is not a lender eligibility or tenor restriction.
6. Inspect the provider's actual calculator/offer and complete a user-approved
   payment with the user, verifying signed callback, allocation and receipt.

Rollback: set `P24_RATY_ZERO_CONFIRMED false --prod`. This hides the tile and
calculator and rejects attempts to pin method 303. Existing legitimate payment
callbacks remain processable. The generic provider payment page remains under
Przelewy24's control; ask the provider to disable its offer there if necessary.

## Validation boundaries

`node tests/p24-pipeline.test.mjs` executes real application handlers offline,
with synthetic credentials and no network: method routing, signatures, Raty
gates, callback rejection, verification, lesson allocation and replay safety.
An unpaid provider registration proves the live handoff but does not prove
card authorization, settlement, or delivery of the production confirmation
email. Those require a completed real payment. Never simulate a paid callback
against production or grant production lessons to make a test pass.
