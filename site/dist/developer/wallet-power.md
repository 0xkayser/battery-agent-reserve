# UNHALT / public wallet power check

UNHALT is the new public identity of BATTERY. The SDK, evidence filenames and schema names retain BATTERY for compatibility. Existing proof is historical, not a new UNHALT experiment.

Open [/check](https://usebattery.xyz/check), paste a public Solana wallet, and check its actual finalized SOL and spendable canonical USDC. No wallet connection, signature, payment or API key. Add your expected daily USDC spend and protected floor to estimate runway. Export JSON or a dated PNG card. Copying a share link includes the public address and calculated assumptions; opening it performs a new read.

`GET /api/wallet?wallet=<canonical public address>` returns `battery.wallet/1`: wallet, mainnet identity, RPC, observedAt (ISO UTC), commitment, per-response slots, integer lamports, USDC mint/6 decimals/spendableUnits/frozenUnits/delegatedAllowanceUnits/account count and wallet owner classification. USDC units are strings to avoid floating-point loss. Result schema is not an agent-health attestation.

Only one wallet parameter is permitted. POST:405; invalid/extra/duplicate params:400; throttled, timed-out or malformed RPC:502. A failure never becomes a zero balance. Observations may be cached for15seconds; HTTP response is no-store. Maximum128cached wallets and32in-flight reads per warm instance; this is not a global rate limit or production SLA.

Data comes from the fixed Solana public mainnet RPC. Four methods: genesis, balance, account info, token accounts by canonical USDC mint. All account reads are finalized; different slots may occur within a batch. Frozen USDC is excluded. Delegations are flagged. A program-owned account may require a different fee payer. A zero-SOL wallet may still use a sponsored transaction.

Estimate: `max(spendableUSDC - protectedFloor, 0) / expectedDailySpend`, rounded down to0.1day. Rates/floors accept six decimals, up to1,000,000USDC. Daily spend must be positive. More than365days is capped in the presentation, not returned as a precise projection. Estimate covers USDC spending only: SOL fees, account rent, gas purchases, provider credit, other assets, future income and changes in burn are outside it. A card cannot authorize work or transfers. Meters show the first seven estimated days, not a measured health score.

No visitor balance/estimate history is stored on the server. Hosting/RPC can process wallet/query metadata. The wallet/assumptions live in the link fragment and are readable by recipients. JSON/PNG downloads preserve a dated snapshot. No private keys, personal wallets or secrets should be pasted. Do not publish an address whose association you want to keep private.

The wallet tool is an entry into the existing recovery SDK. It does not replace durable provider receipts, paid-job acceptance or settlement verification. Actual hosted customer demand, virality, paid vendor canary and hosted recovery operations remain unverified. [Recovery evidence](https://usebattery.xyz/evidence), [SDK](https://usebattery.xyz/docs).
