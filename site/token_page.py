"""Pre-launch token surface. No mint or trading destination is configured."""
from pathlib import Path
import html
import json
import re
from urllib.parse import urlsplit

CONFIG = json.loads((Path(__file__).parent / 'token-config.json').read_text())
TWITTER = CONFIG['twitter']
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
    return f'''<section class="panel token-launch" aria-label="BATTERY token launch status">
<div class="token-launch-title"><span class="serial">TOKEN / SOLANA / PRE-LAUNCH</span><h2>$BATTERY</h2><p>Agents shouldn't die when the hype does.</p></div>
<div class="token-launch-info"><dl class="token-facts"><div><dt>CA / CONTRACT ADDRESS</dt><dd>NOT ANNOUNCED</dd></div></dl>
<p class="fine">The official address and purchase links will appear here after launch.</p>
<div class="actions"><button class="text-button token-pending" type="button" disabled title="Purchase links are not available before launch">[ BUY $BATTERY / NOT LIVE ]</button>{details}{social_link()}</div></div>
</section>'''


def build_token(shell, head, panel):
    shell('token', 'Token / $BATTERY on Solana',
          head('TOKEN / $BATTERY / SOLANA', 'HYPE FADES.<br>KEEP THE SIGNAL.',
               'The upcoming community token for BATTERY.<br>Agent reserve and recovery infrastructure.')
          + launch_block()
          + '<section class="product-grid">'
          + panel('01 / THE PROJECT', '<p>BATTERY is building reserve and recovery infrastructure for AI agents on Solana: bounded spending, saved progress, and recovery after failure.</p><a class="text-button" href="/evidence">[ INSPECT THE WORK &gt; ]</a>')
          + panel('02 / THE TOKEN', '<p>$BATTERY is the project\'s upcoming community token. Its mint, launch terms and distribution have not been announced. No holder benefits are active.</p>')
          + panel('03 / THE RESERVE', '<p>Agent reserves use USDC. Provider expenses and network fees remain separate from the project token. The free SDK is available without buying a token.</p><a class="text-button" href="/pricing">[ PRODUCT + COSTS &gt; ]</a>')
          + '</section>'
          + panel('FOLLOW THE SIGNAL', '<p>Launch updates and the official contract address will be published here. Purchase links stay inactive until the official mint is announced.</p><div class="actions">' + social_link() + '<a class="text-button" href="/docs">[ READ THE DOCS &gt; ]</a></div>'))
