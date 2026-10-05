import {network} from '../lib/network.mjs';
export default async function handler(req,res){
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');res.setHeader('Cache-Control','no-store');return res.status(405).json({error:'METHOD_NOT_ALLOWED',message:'Use GET. This endpoint is read-only.'});}
 if(new URL(req.url,'https://usebattery.xyz').search){res.setHeader('Cache-Control','no-store');return res.status(400).json({error:'PARAMETERS_NOT_ALLOWED',message:'Fixed Solana mainnet observation; no user parameters.'});}
 try{const data=await network('mainnet');res.setHeader('Cache-Control','public, max-age=0, s-maxage=30');return res.status(200).json(data);}
 catch{res.setHeader('Cache-Control','no-store');res.setHeader('Retry-After','10');return res.status(502).json({error:'MAINNET_UNAVAILABLE',message:'The public mainnet RPC did not return a valid sample. Try again later.'});}
}
