"""Token details withheld at the project owner's request."""
from pathlib import Path
import html,json,re
from urllib.parse import urlsplit
CONFIG=json.loads((Path(__file__).parent/'token-config.json').read_text())
TWITTER=CONFIG['twitter']
if TWITTER:
 p=urlsplit(TWITTER)
 if p.scheme!='https' or p.netloc!='x.com' or not re.fullmatch(r'/[A-Za-z0-9_]{1,15}',p.path) or p.query or p.fragment:raise ValueError('Invalid confirmed project profile')
def social_link():
 return f'<a class="text-button" href="{html.escape(TWITTER,quote=True)}" target="_blank" rel="noopener noreferrer">[ TWITTER / X ]</a>' if TWITTER else ''
def build_token(shell,head,panel):
 shell('token','Token information',head('PROJECT / TOKEN','A NEW CHAPTER.','Token information is being revised.')+panel('TOKEN DETAILS ARE NOT DISPLAYED','<p>The contract address and purchase links have been removed from this website. Follow project updates on Twitter.</p><div class="actions">'+social_link()+'<a class="text-button" href="/">[ BACK TO HOME ]</a></div>'))
