"use client";

import { useEffect, useRef, useState } from "react";

const MODE = (process.env.NEXT_PUBLIC_RECAPTCHA_MODE || "v2").toLowerCase(); // "v2" | "v3"
const SITE_KEY = (process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "").trim();
const V2_TOKEN_TTL_MS = 110 * 1000;

export default function Captcha({ onChange, lang="tr", action="form_submit", resetKey=0 }) {
  const [err, setErr] = useState("");
  const boxRef = useRef(null);
  const widgetIdRef = useRef(null);
  const execRef = useRef(null);
  const renewTimerRef = useRef(null);
  const epochRef = useRef(0);
  const lastGoodTokenRef = useRef("");
  const lastGoodTsRef = useRef(0);
  const expireTimerRef = useRef(null);

  // dış reset
  useEffect(() => {
    try{
      if(MODE==="v2" && widgetIdRef.current!=null && window.grecaptcha?.reset){
        window.grecaptcha.reset(widgetIdRef.current);
        lastGoodTokenRef.current=""; lastGoodTsRef.current=0; onChange?.("");
      }else if(MODE==="v3" && execRef.current){ execRef.current(); }
    }catch{}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    if(!SITE_KEY){ setErr("missing-sitekey"); return; }
    setErr("");
    const epoch = ++epochRef.current;

    if(renewTimerRef.current){ clearInterval(renewTimerRef.current); renewTimerRef.current=null; }
    if(expireTimerRef.current){ clearTimeout(expireTimerRef.current); expireTimerRef.current=null; }

    const SCRIPT_ID="recaptcha-script";
    const src = MODE==="v3"
      ? `https://www.google.com/recaptcha/api.js?hl=${encodeURIComponent(lang)}&render=${encodeURIComponent(SITE_KEY)}`
      : `https://www.google.com/recaptcha/api.js?hl=${encodeURIComponent(lang)}&onload=__caboRecaptchaOnload&render=explicit`;

    const old=document.getElementById(SCRIPT_ID);
    if(old && old.getAttribute("src")!==src){ old.remove(); try{ delete window.grecaptcha; }catch{} }

    function ensureScript(){
      return new Promise((resolve)=>{
        const exists=document.getElementById(SCRIPT_ID);
        if(exists) return resolve();
        const s=document.createElement("script");
        s.id=SCRIPT_ID; s.src=src; s.async=true; s.defer=true;
        s.onerror=()=>setErr("render-failed");
        document.head.appendChild(s); resolve();
      });
    }

    window.__caboRecaptchaOnload=()=>{
      if(epoch!==epochRef.current) return;
      try{
        widgetIdRef.current = window.grecaptcha.render(boxRef.current,{
          sitekey:SITE_KEY,
          theme:"dark",
          callback:(t)=>{
            if(t){
              lastGoodTokenRef.current=t; lastGoodTsRef.current=Date.now(); onChange?.(t);
              if(expireTimerRef.current) clearTimeout(expireTimerRef.current);
              expireTimerRef.current=setTimeout(()=>{ lastGoodTokenRef.current=""; lastGoodTsRef.current=0; onChange?.(""); }, V2_TOKEN_TTL_MS);
            }else{ onChange?.(""); }
          },
          "expired-callback":()=>{ lastGoodTokenRef.current=""; lastGoodTsRef.current=0; onChange?.(""); },
          "error-callback":()=>{ lastGoodTokenRef.current=""; lastGoodTsRef.current=0; onChange?.(""); },
        });
        setErr("");
        if(!(lastGoodTokenRef.current && Date.now()-lastGoodTsRef.current<V2_TOKEN_TTL_MS)){
          lastGoodTokenRef.current=""; lastGoodTsRef.current=0; onChange?.("");
        }
      }catch{ setErr("render-failed"); }
    };

    function initV3(){
      try{
        window.grecaptcha.ready(()=>{
          const exec=()=>window.grecaptcha.execute(SITE_KEY,{action}).then(t=>onChange?.(t||"")).catch(()=>onChange?.(""));
          execRef.current=exec; exec(); renewTimerRef.current=setInterval(exec,90*1000); setErr("");
        });
      }catch{ setErr("render-failed"); }
    }

    ensureScript().then(()=>{
      if(MODE==="v3"){ if(window.grecaptcha?.ready) initV3(); }
      else if(window.grecaptcha?.render){ window.__caboRecaptchaOnload(); }
    });

    return ()=>{
      if(renewTimerRef.current){ clearInterval(renewTimerRef.current); renewTimerRef.current=null; }
      if(expireTimerRef.current){ clearTimeout(expireTimerRef.current); expireTimerRef.current=null; }
      try{ if(MODE==="v2" && widgetIdRef.current!=null && window.grecaptcha?.reset){ window.grecaptcha.reset(widgetIdRef.current); } }catch{}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, action]);

  if(err==="missing-sitekey") return <div className="text-red-400 text-sm">reCAPTCHA misconfigured: missing <code>NEXT_PUBLIC_RECAPTCHA_SITE_KEY</code>.</div>;
  if(err==="render-failed")   return <div className="text-red-400 text-sm">reCAPTCHA failed to render. Check site key type &amp; allowed domains.</div>;

  // v2 için: clip wrapper beyaz kenarı tamamen kırpar
  return MODE==="v3" ? (
    <div className="text-[12px] text-gray-500 -mt-2">Protected by reCAPTCHA.</div>
  ) : (
    <div className="cabo-recaptcha-clip">
      <div className="cabo-recaptcha-box">
        <div ref={boxRef} className="g-recaptcha" />
      </div>
    </div>
  );
}
