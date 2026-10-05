# Contributor instructions

Read README.md, docs/architecture.md and docs/security.md before runtime changes.

- Separate real inference, live devnet/mainnet reads, paper USD, browser simulations and dated observer evidence.
- Default tests never pay providers, sign mainnet, mint tokens, deposit assets or send messages.
- Unknown dispatched outcomes remain held. Do not silently repeat external effects to fix recovery.
- Use integer microUSD; test lamports have a separate policy. Never imply one funds the other.
- Never commit .env, live-state, devnet-state, mainnet-state, reference/artifacts, SQLite, private keys, credentials or personal machine paths.
- Preserve ASCII/mobile/loading/error/freshness UI. Model output is data, not authority.
- Run ledger/runtime, published-proof, memo guard and API boundary tests before release. Actual experiments use fresh state directories.
- Report exact verified scope and unpassed gates. No inflation into production uptime/custody.

For product research read docs/agents.md; it enables evidence discovery, not endorsement.
