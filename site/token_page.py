"""Project token surface: user-designated mint, public finality-checked evidence."""
from pathlib import Path
import html
import json
import re
from urllib.parse import urlsplit

CONFIG = json.loads((Path(__file__).parent / 'token-config.json').read_text())
TWITTER = CONFIG['twitter']
MINT = CONFIG.get('mint')
if MINT is not None and not re.fullmatch(r'[1-9A-HJ-NP-Za-km-z]{32,44}', MINT):
    raise ValueError('Invalid mint address')
if MINT:
    PROOF = json.loads((Path(__file__).parent.parent / 'evidence/token-status.json').read_text())
    if (PROOF['mint'] != MINT or PROOF['symbol'] != 'BATTERY'
            or PROOF['genesis'] != '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
            or PROOF['commitment'] != 'finalized'):
        raise ValueError('Published mint requires matching finalized identity evidence')
if TWITTER is not None:
    parsed = urlsplit(TWITTER)
    if (parsed.scheme != 'https' or parsed.netloc != 'x.com'
            or not re.fullmatch(r'/[A-Za-z0-9_]{1,15}', parsed.path)
            or parsed.query or parsed.fragment):
        raise ValueError('Twitter must be the confirmed HTTPS project profile')


def social_link():
    if TWITTER:
        return f'<a class="text-button" href="{html.escape(TWITTER, quote=True)}" target="_blank" rel="noopener noreferrer">[ TWITTER / X ]</a>'
    return '<button class="text-button token-pending" type="button" disabled title="Project profile has not been announced">[ TWITTER / PENDING ]</button>'


def launch_block(home=False):
    details = '<a class="text-button" href="/token">[ TOKEN DETAILS &gt; ]</a>' if home else ''
    status = 'MINT PUBLISHED' if MINT else 'PRE-LAUNCH'
    address = f'<span class="token-ca">{MINT}</span>' if MINT else 'NOT ANNOUNCED'
    note = 'Official Solana mint. Verify this full address before buying.' if MINT else 'The official address and purchase links will appear here after launch.'
    purchase = (f'<a class="text-button primary-link" href="https://pump.fun/coin/{MINT}" target="_blank" rel="noopener noreferrer">[ BUY ON PUMP &gt; ]</a>'
                f'<button class="text-button copy-ca" type="button" data-ca="{MINT}">[ COPY CA ]</button>'
                f'<a class="text-button" href="https://explorer.solana.com/address/{MINT}" target="_blank" rel="noopener noreferrer">[ VERIFY MINT ]</a>'
                if MINT else '<button class="text-button token-pending" type="button" disabled title="Purchase links are not available before launch">[ BUY $BATTERY / NOT LIVE ]</button>')
    return f'''<section class="panel token-launch" aria-label="BATTERY token launch status">
<div class="token-launch-title"><span class="serial">TOKEN / SOLANA / {status}</span><h2>$BATTERY</h2><p>Agents shouldn't die when the hype does.</p></div>
<div class="token-launch-info"><dl class="token-facts"><div><dt>CA / CONTRACT ADDRESS</dt><dd>{address}</dd></div></dl>
<p class="fine">{note}</p>
<div class="actions">{purchase}{details}{social_link()}</div><p class="fine copy-status" role="status" aria-live="polite"></p></div>
</section>'''


def build_token(shell, head, panel):
    shell('token', 'Token / $BATTERY on Solana',
          head('TOKEN / $BATTERY / SOLANA', 'HYPE FADES.<br>KEEP THE SIGNAL.',
               'The BATTERY token on Solana.<br>Agent reserve and recovery infrastructure.')
          + launch_block()
          + '<section class="product-grid">'
          + panel('01 / THE PROJECT', '<p>BATTERY is building reserve and recovery infrastructure for AI agents on Solana: bounded spending, saved progress, and recovery after failure.</p><a class="text-button" href="/evidence">[ INSPECT THE WORK &gt; ]</a>')
          + panel('02 / THE TOKEN', '<p>$BATTERY is the project\'s community token on Solana. Its official mint is published above. No holder benefits are active. The project token is separate from agent reserves and provider payments.</p><a class="text-button" href="/evidence/token-status.json">[ DATED MINT CHECK ]</a>')
          + panel('03 / THE RESERVE', '<p>Agent reserves use USDC. Provider expenses and network fees remain separate from the project token. The free SDK is available without buying a token.</p><a class="text-button" href="/pricing">[ PRODUCT + COSTS &gt; ]</a>')
          + '</section>'
          + panel('FOLLOW THE SIGNAL', '<p>The official contract address is on this page and in the project announcement.</p><div class="actions">' + social_link() + '<a class="text-button" href="https://x.com/usebatteryxyz/status/2107219741383459069" target="_blank" rel="noopener noreferrer">[ LAUNCH POST ]</a><a class="text-button" href="/docs">[ READ THE DOCS &gt; ]</a></div>'))
