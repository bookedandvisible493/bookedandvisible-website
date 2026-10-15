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
var rank=d.getElementById('rank'),cap=d.getElementById('cap'),bB=d.getElementById('bBefore'),bA=d.getElementById('bAfter'),st='after',tm=[];
var T=function(s){var p=R.a.offsetTop-R.me.offsetTop;return s==='before'?{me:'translateY('+2*p+'px)',a:'translateY('+-p+'px)',b:'translateY('+-p+'px)'}:{me:'none',a:'none',b:'none'}};
var go=function(s,an){var t=T(s),mv=an&&!off();st=s;
Object.keys(R).forEach(function(k){var r=R[k],f=getComputedStyle(r).transform;r.style.transform=t[k];if(mv)r.animate([{transform:f},{transform:t[k]}],{duration:700,easing:'cubic-bezier(.65,0,.35,1)'})});
rank.textContent=s==='after'?'1st':'3rd';if(s==='after'&&mv)rank.animate([{transform:'scale(.8)'},{transform:'none'}],{duration:400,delay:500,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'});
bB.setAttribute('aria-pressed',s==='before');bA.setAttribute('aria-pressed',s==='after');
cap.textContent=s==='after'?'Illustration: your business moves from 3rd to 1st.':'Illustration: your business sits in 3rd place.'};
var clr=function(){tm.forEach(clearTimeout);tm=[]};
var play=function(){clr();if(off()){go('after');return}go('before');tm.push(setTimeout(function(){go('after',1)},1000))};
bB.onclick=function(){clr();go('before',1)};bA.onclick=function(){clr();go('after',1)};d.getElementById('replay').onclick=play;
if(!off())go('before');
var vis=new IntersectionObserver(function(es){if(es[0].isIntersecting){vis.disconnect();play()}},{threshold:.5});vis.observe(pk);
setTimeout(function(){if(!clr.done&&st==='before'&&!tm.length)go('after',1)},7000);
var rs;addEventListener('resize',function(){clearTimeout(rs);rs=setTimeout(function(){go(st)},120)})}
/* pause toggle (all [data-pause] buttons) */
var pb=[].slice.call(d.querySelectorAll('[data-pause]'));
var setP=function(v){if(v)h.dataset.motion='off';else delete h.dataset.motion;S('bv-motion',v?'off':'on');
pb.forEach(function(b){b.setAttribute('aria-pressed',v);b.textContent=v?'Resume animations':'Pause animations'});if(v&&pk){clr();go('after')}};
pb.forEach(function(b){b.onclick=function(){setP(h.dataset.motion!=='off')}});setP(S('bv-motion')==='off');
/* fix-it pills: jump to the offer, tag it "Fits you" (text + outline) */
var pills=[].slice.call(d.querySelectorAll('.pill'));
pills.forEach(function(p){p.addEventListener('click',function(){var t=d.getElementById(p.dataset.fit);
pills.forEach(function(x){x.removeAttribute('aria-current')});p.setAttribute('aria-current','true');
d.querySelectorAll('.is-fit').forEach(function(x){x.classList.remove('is-fit')});if(t)t.classList.add('is-fit')})});
/* Services menu closes on outside click / Esc */
var sv=d.querySelector('.svc');if(sv){d.addEventListener('click',function(e){if(!sv.contains(e.target))sv.open=false});d.addEventListener('keydown',function(e){if(e.key==='Escape')sv.open=false})}
})();
