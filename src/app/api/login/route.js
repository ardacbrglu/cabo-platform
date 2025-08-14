export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /api/login
 * Manuel (Credentials) giriş → NextAuth session kurulumunu server-side proxy ile tamamlar.
 * DEBUG: DEBUG_AUTH=1 ise hata anında 'x-debug-reason' header'ına adım yazılır.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { validateCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/ratelimit";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_COUNT = 6;
const MAX_FAILED_ATTEMPTS = 5;
const ACCOUNT_LOCK_DURATION_MS = 15 * 60 * 1000;

const DEBUG = process.env.DEBUG_AUTH === "1";
const MESSAGES = {
  en: { fill:"Please enter your email and password.", invalid:"Incorrect email or password.", merchant:"Merchants cannot log in here.", google:"You signed up with Google. Please use Google login.", inactive:"Your account has not been activated yet.", locked:"Too many failed attempts. Please try again later.", success:"Login successful!", fail:"Login failed. Please try again.", ratelimit:"Too many requests. Please wait.", csrf:"Invalid CSRF token." },
  tr: { fill:"Lütfen e-posta ve şifrenizi girin.", invalid:"E-posta veya şifre yanlış.", merchant:"Satıcı hesapları buradan giriş yapamaz.", google:"Google ile kayıt oldunuz. Lütfen Google ile giriş yapın.", inactive:"Hesabınız henüz aktifleştirilmedi.", locked:"Çok fazla hatalı deneme. Lütfen daha sonra tekrar deneyin.", success:"Giriş başarılı!", fail:"Giriş başarısız. Lütfen tekrar deneyin.", ratelimit:"Çok fazla istek. Lütfen bekleyin.", csrf:"Geçersiz CSRF anahtarı." },
};

function pickLocale(req){const raw=req.headers.get("accept-language")?.split(",")[0]||"en";return raw.toLowerCase().startsWith("tr")?"tr":"en";}
function getClientIp(req){const xf=req.headers.get("x-forwarded-for");return xf?xf.split(",")[0].trim():(req.headers.get("x-real-ip")||"unknown");}
function withDebug(res, reason){ if(DEBUG&&reason) res.headers.set("x-debug-reason", reason); return res; }

/** Set-Cookie parçala (expires virgüllerini bozmaz) */
function splitSetCookies(headerVal){ return headerVal?headerVal.split(/,(?=[^,; ]+=)/g):[]; }
/** NextAuth çerezlerini cookie header’ına topla */
function collectNextAuthCookies(setCookieHeader){
  const wanted=new Set([
    "next-auth.csrf-token",
    "__secure-next-auth.csrf-token",
    "__host-next-auth.csrf-token",
  ]);
  const pairs=[];
  for(const c of splitSetCookies(setCookieHeader||"")){
    const pair=c.split(";")[0].trim();
    const eq=pair.indexOf("="); if(eq>0){
      const nameLower=pair.slice(0,eq).trim().toLowerCase();
      if(wanted.has(nameLower)) pairs.push(pair);
    }
  }
  return pairs.join("; ");
}
/** Set-Cookie içinden belli cookie’nin değerini al */
function getCookieValueFromSetCookie(setCookieHeader, names){
  const list=Array.isArray(names)?names:[names]; const targets=list.map(n=>n.toLowerCase());
  for(const c of splitSetCookies(setCookieHeader||"")){
    const [name,...rest]=c.split(";")[0].split("="); if(targets.includes(name.trim().toLowerCase())) return rest.join("=").trim();
  }
  return null;
}
/** "token|hash" biçiminden token’ı çıkar */
function extractTokenFromNextAuthCookie(val){ if(!val) return null; let s=val; try{s=decodeURIComponent(val);}catch{} const i=s.indexOf("|"); return i>0?s.slice(0,i):null; }

/** NextAuth CSRF al (önce /api/auth/csrf; olmazsa /api/auth/signin – 200/302 fark etmez) */
async function getNextAuthCsrf(origin){
  // 1) /api/auth/csrf
  try{
    const r=await fetch(`${origin}/api/auth/csrf`,{method:"GET",headers:{accept:"application/json","cache-control":"no-cache"},cache:"no-store",redirect:"manual"});
    if(r.ok){
      const j=await r.json().catch(()=>({}));
      const token=j?.csrfToken;
      const jar=collectNextAuthCookies(r.headers.get("set-cookie")||"");
      if(token&&jar) return {token:token, cookieJar:jar, via:"csrf"};
    }
  }catch{/* geç */}

  // 2) /api/auth/signin (status 200 ya da 302 olabilir; önemli olan Set-Cookie)
  const s=await fetch(`${origin}/api/auth/signin?callbackUrl=${encodeURIComponent(origin)}`,{method:"GET",headers:{accept:"text/html","cache-control":"no-cache"},cache:"no-store",redirect:"manual"});
  const setCookie=s.headers.get("set-cookie")||"";
  const jar=collectNextAuthCookies(setCookie);
  const raw=getCookieValueFromSetCookie(setCookie,["next-auth.csrf-token","__Secure-next-auth.csrf-token","__Host-next-auth.csrf-token"]);
  const token=extractTokenFromNextAuthCookie(raw);
  if(!token||!jar) throw new Error("csrf_parse_failed");
  return {token, cookieJar:jar, via:"signin"};
}

export async function POST(req){
  const locale=pickLocale(req); const msg=MESSAGES[locale]; const ip=getClientIp(req);

  try{
    // 1) CSRF (platform)
    try{ validateCsrfToken(req); } catch{ return NextResponse.json({success:false,message:msg.csrf},{status:403}); }

    // 2) Rate limit
    const {ok}=await checkRateLimit({key:`login:ip:${ip}`,limit:RATE_LIMIT_COUNT,windowMs:RATE_LIMIT_WINDOW_MS});
    if(!ok) return NextResponse.json({success:false,message:msg.ratelimit},{status:429});

    // 3) Body
    let body; try{ body=await req.json(); }catch{ body=null; }
    const email=String(body?.email||"").trim().toLowerCase();
    const password=String(body?.password||"");
    if(!email||!password) return NextResponse.json({success:false,message:msg.fill},{status:400});

    // 4) Kullanıcı kapıları
    const user=await prisma.user.findUnique({ where:{ email } });
    if(!user) return NextResponse.json({success:false,message:msg.invalid},{status:401});
    if(user.role==="merchant") return NextResponse.json({success:false,message:msg.merchant},{status:403});
    if(user.lockUntil && new Date(user.lockUntil)>new Date()) return NextResponse.json({success:false,message:msg.locked},{status:403});
    if(!user.passwordHash) return NextResponse.json({success:false,message:msg.google},{status:401});
    if(user.status!=="active") return NextResponse.json({success:false,message:msg.inactive},{status:403});

    // 5) Parola
    const okPass=await bcrypt.compare(password,user.passwordHash);
    if(!okPass){
      const nextFailed=(user.failedAttempts||0)+1;
      await prisma.user.update({ where:{id:user.id}, data:{ failedAttempts:nextFailed, lockUntil: nextFailed>=MAX_FAILED_ATTEMPTS ? new Date(Date.now()+ACCOUNT_LOCK_DURATION_MS) : user.lockUntil }});
      return NextResponse.json({success:false,message:msg.invalid},{status:401});
    }
    await prisma.user.update({ where:{id:user.id}, data:{ failedAttempts:0, lockUntil:null }});

    // 6) NextAuth CSRF + cookieJar
    const scheme=req.headers.get("x-forwarded-proto")||"https";
    const host=req.headers.get("host");
    const origin=req.nextUrl?.origin || `${scheme}://${host}`;

    let token,cookieJar,via;
    try{
      const r=await getNextAuthCsrf(origin);
      token=r.token; cookieJar=r.cookieJar; via=r.via;
    }catch(e){
      return withDebug(NextResponse.json({success:false,message:msg.fail},{status:500}), `csrf_fetch_failed:${e?.message||"unknown"}`);
    }

    // 7) Credentials callback
    const form=new URLSearchParams();
    form.set("csrfToken",token);
    form.set("email",email);
    form.set("password",password);
    form.set("redirect","false");
    form.set("callbackUrl",origin);

    const cbRes=await fetch(`${origin}/api/auth/callback/credentials?json=true&redirect=false`,{
      method:"POST",
      headers:{
        "content-type":"application/x-www-form-urlencoded",
        accept:"application/json",
        ...(cookieJar?{cookie:cookieJar}:{ }),
        origin,
        referer:`${origin}/login`,
      },
      body:form.toString(),
      redirect:"manual",
    });

    let cbJson={}; try{ cbJson=await cbRes.json(); }catch{}
    if(!cbRes.ok || cbJson?.error){
      return withDebug(NextResponse.json({success:false,message:msg.fail},{status:401}), `cb_fail:${cbRes.status}:${cbJson?.error||"unknown"}:via_${via}`);
    }

    // 8) Session çerezlerini forward et
    const res=withDebug(NextResponse.json({success:true,message:msg.success},{status:200}), `ok_via_${via}`);
    const setCookieHeader=cbRes.headers.get("set-cookie");
    if(setCookieHeader){ for(const c of splitSetCookies(setCookieHeader)) res.headers.append("set-cookie",c); }
    res.headers.set("cache-control","no-store");
    res.headers.set("vary","cookie");
    return res;

  }catch(e){
    return withDebug(NextResponse.json({success:false,message:MESSAGES[locale].fail},{status:500}), `outer_catch:${e?.message||"err"}`);
  }
}
