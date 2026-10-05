import {validWallet,walletPower} from '../lib/wallet.mjs';
export default async function handler(req,res){
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'METHOD_NOT_ALLOWED',message:'This check is read-only. Use GET.'});}
 const query=new URL(req.url,'https://usebattery.xyz').searchParams;
 if([...query.keys()].length!==1||query.getAll('wallet').length!==1||!validWallet(query.get('wallet')))return res.status(400).json({error:'INVALID_WALLET',message:'Paste one complete Solana public wallet address.'});
 try{return res.status(200).json(await walletPower(query.get('wallet')));}
 catch{return res.status(502).json({error:'RPC_UNAVAILABLE',message:'Solana public RPC is unavailable or returned an invalid observation. No balance was substituted. Try again shortly.'});}
}
