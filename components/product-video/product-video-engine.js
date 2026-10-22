/* ══════════════════════════════════════════════════════════════════════
   Eastel Product Video — Canvas Renderer (vanilla JS, no React/Babel)
   Renders the 28-second animated product showcase to a <canvas>.
   ══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var W = 1080, H = 1080;

  /* ── Colors ── */
  var C = {
    cyan: '#5be4ff', cyan2: '#22b6ff', violet: '#a778ff', violetD: '#7b4ee8',
    magenta: '#e36bff', gold: '#ffd66b', goldD: '#ff9d6b',
    ink: '#ffffff', inkDim: '#cfcadf', inkMute: '#8a85a8', bg: '#05030d'
  };

  var FONT_DISPLAY = '700 {sz}px "Space Grotesk", system-ui, sans-serif';
  var FONT_MONO    = '400 {sz}px "JetBrains Mono", ui-monospace, monospace';
  var FONT_BODY    = '{w} {sz}px "Inter", system-ui, sans-serif';

  /* ── Plan data ── */
  var PLANS = [
    { id:'EZ15', eyebrow:'STARTER PLAN', data:'30', price:'15', duration:'15 DAYS', badge:null,
      accent:C.cyan, accent2:C.cyan2,
      features:[['High Speed Data','30 GB'],['Voice Calls','Unlimited'],['Hotspot Tethering','Full'],['Messaging','5 SMS']] },
    { id:'EZ35', eyebrow:'MOST POPULAR', data:'200', price:'35', duration:'30 DAYS', badge:'BEST VALUE',
      accent:C.violet, accent2:C.cyan,
      features:[['High Speed Data','200 GB'],['Unused Data','Carry Forward'],['Hotspot','100 GB'],['Calls','Unlimited']] },
    { id:'EZ50', eyebrow:'TRAVEL PLAN', data:'500', price:'50', duration:'30 DAYS', badge:'+ ROAMING',
      accent:C.violet, accent2:C.magenta,
      features:[['High Speed Data · Hotspot','500 GB'],['Unused Data','Carry Forward'],['Roaming · SG/ID/TH','3 GB'],['Calls','Unlimited']] },
    { id:'EZ68', eyebrow:'POWER USER', data:'700', price:'68', duration:'30 DAYS', badge:'HEAVY DATA',
      accent:C.magenta, accent2:C.violet,
      features:[['High Speed Data · Hotspot','700 GB'],['Unused Data','Carry Forward'],['Roaming · SG/ID/TH','5 GB'],['Calls','Unlimited']] },
    { id:'EZ98', eyebrow:'PREMIUM TIER', data:'999', price:'98', duration:'30 DAYS', badge:'TOP TIER',
      accent:C.gold, accent2:C.goldD,
      features:[['High Speed Data · Hotspot','999 GB'],['Unused Data','Carry Forward'],['Roaming · SG/ID/TH','10 GB'],['Calls','Unlimited']] }
  ];

  var TIMING = { intro:[0,3], plans:[3,24], outro:[24,28], total:28 };
  var PLAN_DUR = 4.2;

  function planRange(i) {
    var s = TIMING.plans[0] + i * PLAN_DUR;
    return [s, s + PLAN_DUR];
  }

  /* ── Easing ── */
  var E = {
    linear: function(t){return t},
    easeOutCubic: function(t){return(--t)*t*t+1},
    easeInCubic: function(t){return t*t*t},
    easeInOutCubic: function(t){return t<.5?4*t*t*t:(t-1)*(2*t-2)*(2*t-2)+1},
    easeOutBack: function(t){var c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2)},
    easeOutQuad: function(t){return t*(2-t)},
    easeInQuad: function(t){return t*t}
  };

  function clamp(v,mn,mx){return Math.max(mn,Math.min(mx,v))}

  function anim(o){
    return function(t){
      if(t<=o.start)return o.from;
      if(t>=o.end)return o.to;
      var local=(t-o.start)/(o.end-o.start);
      return o.from+(o.to-o.from)*(o.ease||E.easeInOutCubic)(local);
    };
  }

  /* ── Canvas helpers ── */
  function rgba(hex,a){
    var h=hex.replace('#','');
    return 'rgba('+parseInt(h.slice(0,2),16)+','+parseInt(h.slice(2,4),16)+','+parseInt(h.slice(4,6),16)+','+a+')';
  }

  function drawRoundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
    ctx.closePath();
  }

  function font(str,sz,w){
    return str.replace('{sz}',sz).replace('{w}',w||'600');
  }

  function wrapText(ctx,text,x,y,maxW,lineH){
    var words=text.split(' '),line='';
    for(var i=0;i<words.length;i++){
      var test=line+words[i]+' ';
      if(ctx.measureText(test).width>maxW&&line!==''){
        ctx.fillText(line.trim(),x,y);line=words[i]+' ';y+=lineH;
      } else line=test;
    }
    ctx.fillText(line.trim(),x,y);
  }

  /* ── Particles ── */
  var particles=[
    [.12,.18,4,C.cyan,1.7],[.78,.10,3,C.violet,2.3],[.88,.42,3,C.cyan,1.4],
    [.06,.66,5,C.magenta,1.9],[.48,.82,4,C.cyan,2.1],[.32,.34,3,C.violet,1.6],
    [.62,.58,4,C.cyan,2.4],[.20,.92,3,C.violet,1.5]
  ];

  function drawParticles(ctx,t){
    for(var i=0;i<particles.length;i++){
      var p=particles[i],phase=i*1.3;
      var flicker=.5+.5*Math.sin(t*p[4]+phase);
      var drift=Math.sin(t*.4+phase)*12;
      ctx.save();
      ctx.globalAlpha=.4+flicker*.6;
      ctx.shadowColor=p[3];ctx.shadowBlur=6+flicker*8;
      ctx.fillStyle=p[3];
      ctx.beginPath();
      ctx.arc(p[0]*W+drift,p[1]*H-drift,p[2],0,Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ── Images ── */
  var simImg=new Image(),logoImg=new Image();
  simImg.crossOrigin='anonymous';logoImg.crossOrigin='anonymous';
  var simLoaded=false,logoLoaded=false;
  simImg.onload=function(){simLoaded=true};
  logoImg.onload=function(){logoLoaded=true};
  simImg.src='/images/eastel-simcard.webp';
  logoImg.src='/images/eastel-white.svg';

  /* ══════════════════════════════════════════════════════
     SCENE RENDERERS
     ══════════════════════════════════════════════════════ */

  function drawBackdrop(ctx,t){
    var accent=C.cyan,accent2=C.violet;
    if(t>=TIMING.plans[0]&&t<TIMING.plans[1]){
      var idx=Math.min(4,Math.floor((t-TIMING.plans[0])/PLAN_DUR));
      accent=PLANS[idx].accent;accent2=PLANS[idx].accent2;
    }else if(t>=TIMING.outro[0]){accent=C.cyan;accent2=C.violet;}

    // Base gradient
    var grd=ctx.createLinearGradient(0,0,0,H);
    grd.addColorStop(0,'#05030d');grd.addColorStop(.45,'#0a0626');grd.addColorStop(1,'#06031a');
    ctx.fillStyle=grd;ctx.fillRect(0,0,W,H);

    // Radial glows
    ctx.save();
    var breath=1+.04*Math.sin(t*.6);
    ctx.translate(W/2,H/2);ctx.scale(breath,breath);ctx.translate(-W/2,-H/2);
    ctx.globalAlpha=.6;
    var r1=ctx.createRadialGradient(W*.75,H*.3,0,W*.75,H*.3,W*.45);
    r1.addColorStop(0,rgba(accent,.45));r1.addColorStop(1,'transparent');
    ctx.fillStyle=r1;ctx.fillRect(-W*.1,-H*.1,W*1.2,H*1.2);
    var r2=ctx.createRadialGradient(W*.25,H*.75,0,W*.25,H*.75,W*.45);
    r2.addColorStop(0,rgba(accent2,.45));r2.addColorStop(1,'transparent');
    ctx.fillStyle=r2;ctx.fillRect(-W*.1,-H*.1,W*1.2,H*1.2);
    ctx.restore();

    // Dot grid
    ctx.save();ctx.globalAlpha=.55;
    for(var gx=13;gx<W;gx+=26){
      for(var gy=13;gy<H;gy+=26){
        ctx.fillStyle='rgba(255,255,255,.08)';
        ctx.beginPath();ctx.arc(gx,gy,1.2,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.restore();

    // Particles
    drawParticles(ctx,t);

    // Vignette
    var vg=ctx.createRadialGradient(W/2,H/2,W*.25,W/2,H/2,W*.7);
    vg.addColorStop(0,'transparent');vg.addColorStop(1,'rgba(0,0,0,.55)');
    ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
  }

  function drawBrandHeader(ctx,t,accent){
    if(!logoLoaded)return;
    ctx.save();ctx.globalAlpha=1;
    // Logo
    ctx.drawImage(logoImg,50,44,100,36);
    // Divider
    ctx.strokeStyle='rgba(255,255,255,.3)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(164,44);ctx.lineTo(164,80);ctx.stroke();
    // Tagline
    ctx.font=font(FONT_MONO,13);ctx.fillStyle=C.inkDim;ctx.textBaseline='middle';
    ctx.letterSpacing='0.24em';ctx.fillText('PREPAID · MALAYSIA',178,62);
    // 5G pill
    var px=W-170,py=48,pw=130,ph=32;
    ctx.fillStyle=rgba(accent,.18);ctx.strokeStyle=rgba(accent,.4);ctx.lineWidth=1;
    drawRoundRect(ctx,px,py,pw,ph,999);ctx.fill();ctx.stroke();
    // Dot
    ctx.fillStyle=accent;ctx.shadowColor=accent;ctx.shadowBlur=8;
    ctx.beginPath();ctx.arc(px+16,py+ph/2,4.5,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;
    // Text
    ctx.font=font(FONT_DISPLAY,14);ctx.fillStyle=C.ink;ctx.textBaseline='middle';
    ctx.fillText('5G Ready',px+28,py+ph/2+1);
    ctx.restore();
  }

  function drawSimCard(ctx,x,y,size,opacity,rotate,glow){
    if(!simLoaded)return;
    ctx.save();ctx.globalAlpha=opacity;
    ctx.translate(x,y);ctx.rotate(rotate*Math.PI/180);
    // Aura
    var ag=ctx.createRadialGradient(0,0,size*.1,0,0,size*.6);
    ag.addColorStop(0,rgba(glow,.45));ag.addColorStop(1,'transparent');
    ctx.fillStyle=ag;ctx.fillRect(-size*.6,-size*.6,size*1.2,size*1.2);
    // Image
    ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=40;ctx.shadowOffsetY=24;
    ctx.drawImage(simImg,-size/2,-size/2,size,size);
    ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    ctx.restore();
  }

  /* ── INTRO (0..3s) ── */
  function drawIntro(ctx,localTime,dur){
    var simScale=anim({from:.35,to:1,start:0,end:.9,ease:E.easeOutBack})(localTime);
    var simRot=anim({from:-14,to:0,start:0,end:1,ease:E.easeOutCubic})(localTime);
    var simOp=anim({from:0,to:1,start:0,end:.5,ease:E.easeOutCubic})(localTime);
    var exitT=clamp((localTime-(dur-.7))/.7,0,1);
    var exitE=E.easeInOutCubic(exitT);
    var simY=540+(-180)*exitE;
    var simExitScale=1-.35*exitE;
    var simOpOut=1-.5*exitE;
    var titleP=anim({from:0,to:1,start:.8,end:1.6,ease:E.easeOutCubic})(localTime);
    var tagP=anim({from:0,to:1,start:1.4,end:2.1,ease:E.easeOutCubic})(localTime);
    var titleOut=1-exitE;

    drawBrandHeader(ctx,localTime,C.cyan);
    drawSimCard(ctx,540,simY+60,480*simScale*simExitScale,simOp*simOpOut,simRot,C.violet);

    // Eyebrow
    ctx.save();ctx.globalAlpha=titleP*titleOut;
    ctx.font=font(FONT_MONO,16);ctx.fillStyle=C.inkMute;ctx.textAlign='center';ctx.textBaseline='top';
    ctx.fillText('EASTEL NEXT · 5G PREMIUM',W/2,150);
    // Headline
    ctx.font=font(FONT_DISPLAY,74);ctx.textBaseline='top';
    var grd=ctx.createLinearGradient(W/2-200,0,W/2+200,0);
    grd.addColorStop(0,C.cyan);grd.addColorStop(.6,C.violet);grd.addColorStop(1,C.magenta);
    ctx.fillStyle=grd;
    ctx.fillText('5G High Speed',W/2,190);
    ctx.fillStyle=C.ink;
    ctx.fillText('Internet',W/2,265);
    // Tagline
    ctx.globalAlpha=tagP*titleOut;ctx.font=font(FONT_BODY,26,'500');ctx.fillStyle=C.inkDim;
    ctx.fillText('Stay Connected, No Strings Attached.',W/2,H-70);
    ctx.fillStyle=C.ink;ctx.font=font(FONT_BODY,26,'600');
    ctx.fillText('No Strings Attached.',W/2+ctx.measureText('Stay Connected, ').width,H-70);
    ctx.restore();
  }

  /* ── PLAN SCENE ── */
  function drawPlan(ctx,plan,idx,localTime,dur){
    var T=localTime;
    var enter=anim({from:0,to:1,start:0,end:.6,ease:E.easeOutCubic})(T);
    var exitT=clamp((T-(dur-.55))/.55,0,1);
    var exitE=E.easeInCubic(exitT);var exitOp=1-exitE;
    var _op=function(p){return p*exitOp};

    var bob=Math.sin(T*1.8)*5;
    var simES=anim({from:.75,to:1,start:0,end:.7,ease:E.easeOutBack})(T);
    var simX=810+anim({from:80,to:0,start:0,end:.7,ease:E.easeOutCubic})(T);
    var simSize=440*simES*(1-exitE*.25);
    var simOp=enter*exitOp;

    var eyP=anim({from:0,to:1,start:.10,end:.55,ease:E.easeOutCubic})(T);
    var pkgP=anim({from:0,to:1,start:.20,end:.70,ease:E.easeOutBack})(T);
    var dataP=anim({from:0,to:1,start:.35,end:1.10,ease:E.easeOutBack})(T);
    var priceP=anim({from:0,to:1,start:.55,end:1.20,ease:E.easeOutBack})(T);
    var featP=anim({from:0,to:1,start:.80,end:1.40,ease:E.easeOutCubic})(T);
    var countT=anim({from:0,to:1,start:.35,end:1.30,ease:E.easeOutCubic})(T);
    var counted=Math.round(parseInt(plan.data)*countT);

    drawBrandHeader(ctx,T,plan.accent);
    drawSimCard(ctx,simX,490+bob,simSize,simOp,-3,plan.accent);

    // Eyebrow
    ctx.save();ctx.globalAlpha=_op(eyP);ctx.textBaseline='top';
    ctx.font=font(FONT_MONO,15);ctx.fillStyle=plan.accent;
    ctx.shadowColor=rgba(plan.accent,.5);ctx.shadowBlur=12;
    ctx.textAlign='left';ctx.fillText(plan.eyebrow,60,170);
    ctx.shadowBlur=0;

    // Package ID
    ctx.globalAlpha=_op(pkgP);
    ctx.font=font(FONT_DISPLAY,78);ctx.fillStyle=C.ink;
    ctx.textAlign='left';ctx.fillText(plan.id,60,218);
    if(plan.badge){
      var bw=ctx.measureText(plan.id).width+20;
      ctx.font=font(FONT_DISPLAY,13);
      var badgeW=ctx.measureText(plan.badge).width+24;
      ctx.fillStyle=rgba(plan.accent,.10);ctx.strokeStyle=rgba(plan.accent,.45);ctx.lineWidth=1;
      drawRoundRect(ctx,60+bw,230,badgeW,28,999);ctx.fill();ctx.stroke();
      ctx.fillStyle=plan.accent;ctx.textBaseline='middle';
      ctx.fillText(plan.badge,60+bw+12,244);
    }

    // Big number
    ctx.globalAlpha=_op(dataP);
    var numStr=counted.toLocaleString('en-US');
    ctx.font=font(FONT_DISPLAY,220);ctx.textBaseline='top';ctx.textAlign='left';
    var numGrd=ctx.createLinearGradient(60,322,60,542);
    numGrd.addColorStop(0,'#ffffff');numGrd.addColorStop(1,plan.accent);
    ctx.fillStyle=numGrd;
    ctx.shadowColor=rgba(plan.accent,.4);ctx.shadowBlur=24;
    ctx.fillText(numStr,60,322);ctx.shadowBlur=0;
    var nw=ctx.measureText(numStr).width;
    ctx.font=font(FONT_DISPLAY,70);ctx.fillStyle=C.inkDim;
    ctx.fillText('GB',60+nw+12,390);

    // Caption
    ctx.globalAlpha=_op(dataP);
    ctx.font=font(FONT_MONO,14);ctx.fillStyle=C.inkMute;ctx.textAlign='left';
    ctx.fillText('HIGH SPEED 5G · '+plan.duration,64,538);

    // Price
    ctx.globalAlpha=_op(priceP);
    ctx.font=font(FONT_MONO,13);ctx.fillStyle=C.inkMute;ctx.textAlign='left';
    ctx.fillText('ONLY',60,600);
    // Price box
    ctx.fillStyle='rgba(255,255,255,.04)';ctx.strokeStyle=rgba(plan.accent,.35);ctx.lineWidth=1;
    drawRoundRect(ctx,60,624,280,80,18);ctx.fill();ctx.stroke();
    ctx.font=font(FONT_DISPLAY,34);ctx.fillStyle=C.inkDim;ctx.textBaseline='alphabetic';
    ctx.fillText('RM',80,680);
    ctx.font=font(FONT_DISPLAY,124);
    var pGrd=ctx.createLinearGradient(140,624,140,704);
    pGrd.addColorStop(0,'#ffffff');pGrd.addColorStop(1,plan.accent);
    ctx.fillStyle=pGrd;ctx.fillText(plan.price,140,700);

    // Features
    ctx.textAlign='left';ctx.textBaseline='top';
    for(var i=0;i<plan.features.length;i++){
      var fp=anim({from:0,to:1,start:.85+i*.10,end:1.30+i*.10,ease:E.easeOutCubic})(T);
      var fi=plan.features[i];var hi=i===0;
      var fx=i%2===0?60:W/2+10;var fy=H-170+Math.floor(i/2)*72;
      ctx.save();ctx.globalAlpha=_op(fp);
      // Card
      if(hi){
        var cg=ctx.createLinearGradient(fx,fy,fx+440,fy+60);
        cg.addColorStop(0,rgba(plan.accent,.18));cg.addColorStop(1,rgba(plan.accent2,.10));
        ctx.fillStyle=cg;ctx.strokeStyle=rgba(plan.accent,.45);
      }else{
        ctx.fillStyle='rgba(255,255,255,.04)';ctx.strokeStyle='rgba(255,255,255,.07)';
      }
      ctx.lineWidth=1;drawRoundRect(ctx,fx,fy,440,60,12);ctx.fill();ctx.stroke();
      // Icon box
      ctx.fillStyle=rgba(plan.accent,.22);ctx.strokeStyle=rgba(plan.accent,.3);
      drawRoundRect(ctx,fx+12,fy+11,38,38,9);ctx.fill();ctx.stroke();
      // Text
      ctx.font=font(FONT_MONO,10.5);ctx.fillStyle=C.inkMute;
      ctx.fillText(fi[0],fx+60,fy+12);
      ctx.font=font(FONT_DISPLAY,18);ctx.fillStyle=C.ink;
      ctx.fillText(fi[1],fx+60,fy+30);
      ctx.restore();
    }

    // Counter
    ctx.save();ctx.globalAlpha=_op(featP)*.7;ctx.textAlign='right';ctx.textBaseline='bottom';
    ctx.font=font(FONT_MONO,11);ctx.fillStyle=C.inkMute;
    ctx.fillText(String(idx+1).padStart(2,'0')+' / 05 · EASTEL.SITE',W-60,H-20);
    ctx.restore();
    ctx.restore();
  }

  /* ── OUTRO (24..28s) ── */
  function drawOutro(ctx,localTime,dur){
    var T=localTime;
    var enterP=anim({from:0,to:1,start:0,end:.8,ease:E.easeOutCubic})(T);
    var ctaP=anim({from:0,to:1,start:.5,end:1.2,ease:E.easeOutBack})(T);
    var urlP=anim({from:0,to:1,start:1,end:1.6,ease:E.easeOutCubic})(T);
    var exitT=clamp((T-(dur-.4))/.4,0,1);var exitE=E.easeInCubic(exitT);var outOp=1-exitE;
    var simY=580-anim({from:0,to:80,start:0,end:.9,ease:E.easeOutCubic})(T);
    var simScale=anim({from:.55,to:.95,start:0,end:.9,ease:E.easeOutBack})(T);

    drawBrandHeader(ctx,T,C.cyan);
    drawSimCard(ctx,540,simY-60,360*simScale*(1-exitE*.1),enterP*outOp,4,C.violet);

    // Eyebrow
    ctx.save();ctx.globalAlpha=enterP*outOp;ctx.textAlign='center';ctx.textBaseline='top';
    ctx.font=font(FONT_MONO,16);ctx.fillStyle=C.inkMute;
    ctx.fillText('FIVE PLANS · ONE NETWORK',W/2,150);
    // Headline
    ctx.font=font(FONT_DISPLAY,80);
    var grd=ctx.createLinearGradient(W/2-200,0,W/2+200,0);
    grd.addColorStop(0,C.cyan);grd.addColorStop(.6,C.violet);grd.addColorStop(1,C.magenta);
    ctx.fillStyle=grd;ctx.fillText('Choose Your',W/2,190);
    ctx.fillStyle=C.ink;ctx.fillText('Plan',W/2,270);

    // Tags
    ctx.globalAlpha=ctaP*outOp;
    var tags=[['Keep Old Number'],['Fast Activation'],['No Contract']];
    var tagX=W/2-250;
    for(var i=0;i<tags.length;i++){
      var tw=ctx.measureText(tags[i][0]).width+40;
      ctx.fillStyle='rgba(255,255,255,.04)';ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=1;
      drawRoundRect(ctx,tagX,770,tw,40,999);ctx.fill();ctx.stroke();
      ctx.font=font(FONT_BODY,16,'500');ctx.fillStyle=C.ink;ctx.textBaseline='middle';
      ctx.fillText(tags[i][0],tagX+20,790);
      tagX+=tw+12;
    }

    // CTA button
    ctx.globalAlpha=urlP*outOp;
    var cg=ctx.createLinearGradient(W/2-160,860,W/2+160,860);
    cg.addColorStop(0,C.cyan);cg.addColorStop(1,C.violet);
    ctx.fillStyle=cg;ctx.shadowColor=rgba(C.violet,.5);ctx.shadowBlur=36;
    drawRoundRect(ctx,W/2-160,860,320,60,999);ctx.fill();
    ctx.shadowColor=rgba(C.cyan,.3);ctx.shadowBlur=60;
    drawRoundRect(ctx,W/2-160,860,320,60,999);ctx.fill();ctx.shadowBlur=0;
    ctx.font=font(FONT_DISPLAY,26);ctx.fillStyle='#0a0712';ctx.textBaseline='middle';
    ctx.textAlign='center';ctx.fillText('ORDER YOURS TODAY',W/2,890);
    // URL
    ctx.font=font(FONT_MONO,17);ctx.fillStyle=C.inkDim;ctx.textBaseline='top';
    ctx.fillText('EASTEL.SITE',W/2,940);
    ctx.restore();
  }

  /* ══════════════════════════════════════════════════════
     MAIN RENDER FUNCTION
     ══════════════════════════════════════════════════════ */
  function renderFrame(ctx, t) {
    ctx.clearRect(0, 0, W, H);
    drawBackdrop(ctx, t);

    if (t < TIMING.intro[1]) {
      drawIntro(ctx, t, TIMING.intro[1] - TIMING.intro[0]);
    } else if (t < TIMING.plans[1]) {
      var idx = Math.min(4, Math.floor((t - TIMING.plans[0]) / PLAN_DUR));
      var lt = t - TIMING.plans[0] - idx * PLAN_DUR;
      drawPlan(ctx, PLANS[idx], idx, lt, PLAN_DUR);
    } else {
      drawOutro(ctx, t - TIMING.outro[0], TIMING.outro[1] - TIMING.outro[0]);
    }
  }

  /* ══════════════════════════════════════════════════════
     EXPORTED API
     ══════════════════════════════════════════════════════ */
  window.EastelVideo = {
    W: W, H: H, TIMING: TIMING, PLANS: PLANS,
    renderFrame: renderFrame,
    setImages: function (simSrc, logoSrc) {
      if (simSrc) { simImg.src = simSrc; }
      if (logoSrc) { logoImg.src = logoSrc; }
    }
  };
})();
