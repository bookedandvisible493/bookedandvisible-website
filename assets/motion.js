(function(){
var d=document,h=d.documentElement,RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
var S=function(k,v){try{return v===undefined?localStorage.getItem(k):localStorage.setItem(k,v)}catch(e){}};
var off=function(){return RM||h.dataset.motion==='off'};
/* reveals, fail-safe at 2.5s */
var rv=[].slice.call(d.querySelectorAll('.rv,.stepper,.cmp')),show=function(e){e.classList.add('in')};
if(!('IntersectionObserver' in window))rv.forEach(show);
else{var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){show(e.target);io.unobserve(e.target)}})},{threshold:.15});
rv.forEach(function(e){e.style.setProperty('--i',[].indexOf.call(e.parentNode.children,e)%4);io.observe(e)})}
setTimeout(function(){rv.forEach(show)},2500);
/* climb: DOM holds the final order (you 1st); "before" = transforms */
var pk=d.getElementById('pack');
if(pk){var R={};[].forEach.call(pk.children,function(r){R[r.dataset.k]=r});
var rank=d.getElementById('rank'),baB=d.getElementById('ba-before'),baA=d.getElementById('ba-after'),st='after',tm=[];
var T=function(s){var p=R.a.offsetTop-R.me.offsetTop;return s==='before'?{me:'translateY('+2*p+'px)',a:'translateY('+-p+'px)',b:'translateY('+-p+'px)'}:{me:'none',a:'none',b:'none'}};
var go=function(s,an){var t=T(s),mv=an&&!off();st=s;
Object.keys(R).forEach(function(k){var r=R[k],f=getComputedStyle(r).transform;r.style.transform=t[k];if(mv)r.animate([{transform:f},{transform:t[k]}],{duration:700,easing:'cubic-bezier(.65,0,.35,1)'})});
rank.textContent=s==='after'?'1st':'3rd';if(s==='after'&&mv)rank.animate([{transform:'scale(.8)'},{transform:'none'}],{duration:400,delay:500,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'});
if(s==='after'){baA.setAttribute('aria-current','true');baB.removeAttribute('aria-current')}else{baB.setAttribute('aria-current','true');baA.removeAttribute('aria-current')}};
var clr=function(){tm.forEach(clearTimeout);tm=[]};
var play=function(){clr();if(off()){go('after');return}go('before');tm.push(setTimeout(function(){go('after',1)},1000))};
/* industry rotation: the search is retyped for a new trade, rival names swap, you climb again */
var IND=[{q:'plumber near me',a:'Sample Plumbing Co.',b:'Example Heating &amp; Drains'},{q:'HVAC repair near me',a:'Sample HVAC Co.',b:'Example Heating &amp; Air'},{q:'dentist near me',a:'Sample Dental Clinic',b:'Example Family Dentistry'},{q:'house cleaner near me',a:'Sample Cleaning Co.',b:'Example Maid Service'},{q:'hair salon near me',a:'Sample Hair Studio',b:'Example Beauty Bar'}];
var qt=d.querySelector('.q-text'),nA=R.a.querySelector('b'),nB=R.b.querySelector('b'),ix=0,tok=0,inView=false,caret=d.createElement('span');caret.className='caret';caret.setAttribute('aria-hidden','true');
var sl=function(ms){return new Promise(function(r){setTimeout(r,ms)})};
var setInd=function(i){var o=IND[i];qt.textContent=o.q;nA.innerHTML=o.a;nB.innerHTML=o.b};
var fade=function(n){n.animate([{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:350,easing:'ease-out'})};
var stop=function(){if(!tok&&!qt)return;tok++;caret.remove();setInd(ix)};
var loop=async function(t){await sl(2800);
while(t===tok&&!off()&&inView&&!d.hidden){ix=(ix+1)%IND.length;var o=IND[ix],s=qt.textContent;if(!caret.isConnected)qt.after(caret);
while(s.length&&t===tok){s=s.slice(0,-1);qt.textContent=s;await sl(14)}
if(t!==tok)return;await sl(80);nA.innerHTML=o.a;nB.innerHTML=o.b;fade(nA);fade(nB);go('before');
for(var c=1;c<=o.q.length&&t===tok;c++){qt.textContent=o.q.slice(0,c);await sl(26)}
if(t!==tok)return;await sl(150);go('after',1);await sl(2900)}
if(t===tok)caret.remove()};
var arm=function(){tok++;if(!off()&&inView)loop(tok)};
var halt=function(){stop();if(st!=='after')go('after')};
d.getElementById('replay').onclick=function(){tok++;caret.remove();setInd(ix);play();arm()};
new IntersectionObserver(function(es){inView=es[0].isIntersecting;inView?arm():halt()},{threshold:.35}).observe(pk);
d.addEventListener('visibilitychange',function(){d.hidden?halt():arm()});
if(!off())go('before');
var vis=new IntersectionObserver(function(es){if(es[0].isIntersecting){vis.disconnect();play()}},{threshold:.5});vis.observe(pk);
setTimeout(function(){if(!clr.done&&st==='before'&&!tm.length)go('after',1)},7000);
var rs;addEventListener('resize',function(){clearTimeout(rs);rs=setTimeout(function(){go(st)},120)})}
/* pause toggle (all [data-pause] buttons) */
var pb=[].slice.call(d.querySelectorAll('[data-pause]'));
var setP=function(v){if(v)h.dataset.motion='off';else delete h.dataset.motion;S('bv-motion',v?'off':'on');
pb.forEach(function(b){b.setAttribute('aria-pressed',v);var l=v?'Resume animations':'Pause animations';b.setAttribute('aria-label',l);b.title=l});if(v&&pk){clr();halt()}else if(pk)arm()};
pb.forEach(function(b){b.onclick=function(){setP(h.dataset.motion!=='off')}});setP(S('bv-motion')==='off');
/* fix-it pills: jump to the offer, tag it "Fits you" (text + outline) */
var pills=[].slice.call(d.querySelectorAll('.pill'));
pills.forEach(function(p){p.addEventListener('click',function(){var t=d.getElementById(p.dataset.fit);
pills.forEach(function(x){x.removeAttribute('aria-current')});p.setAttribute('aria-current','true');
d.querySelectorAll('.is-fit').forEach(function(x){x.classList.remove('is-fit')});if(t)t.classList.add('is-fit')})});
/* Services menu closes on outside click / Esc */
var sv=d.querySelector('.svc');if(sv){d.addEventListener('click',function(e){if(!sv.contains(e.target))sv.open=false});d.addEventListener('keydown',function(e){if(e.key==='Escape')sv.open=false})}
/* Before peek: tap toggles on touch; tap outside / Esc closes (hover and focus are pure CSS) */
[].slice.call(d.querySelectorAll('.work-before')).forEach(function(f){var b=f.querySelector('.bp-btn');if(!b)return;
var big=f.querySelector('.bp img[data-src]'),load=function(){if(big){big.src=big.dataset.src;big.removeAttribute('data-src');big=null}};['mouseenter','focusin','touchstart'].forEach(function(t){f.addEventListener(t,load,{passive:true,once:true})});
var set=function(v){f.classList.toggle('open',v);b.setAttribute('aria-expanded',v)};
b.addEventListener('click',function(){set(!f.classList.contains('open'))});
d.addEventListener('click',function(e){if(!f.contains(e.target))set(false)});
d.addEventListener('keydown',function(e){if(e.key==='Escape'){set(false);if(f.contains(d.activeElement))d.activeElement.blur()}})});
})();
