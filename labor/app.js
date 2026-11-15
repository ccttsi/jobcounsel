/*
 * 노동시장 산책 · 렌더링 엔진
 * 데이터: ./data/concepts.json(개념·사례), ./data/news.json(지표·표현 함정·연습 기사·최근 수치)
 * 외부 API 없이 이 파일의 규칙만으로 동작한다. 입력한 문장은 메모리에만 두고 저장·전송하지 않는다.
 * 주소: #concepts(개념 첫 화면) · #c-<id>(개념) · #news(뉴스 읽기) · #news-<지표id>(지표 바로 보기) · #about
 */
(function(){
'use strict';
var d=document,$=function(id){return d.getElementById(id);};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function fx(n,k){return (Math.round(n*Math.pow(10,k))/Math.pow(10,k)).toFixed(k);}
function sgn(n,k,u){var v=fx(n,k);if(Number(v)===0)return '±0'+u;return (n>0?'+':'')+v+u;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
var DEEP_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17.5l9 5 9-5" opacity=".55"/></svg>';
var DEEP_TEXT='조금 묵직한 개념이니 천천히 훑어보셔도 충분합니다.';

/* ───────── 테마: 공통 설정을 따른다 ───────── */
function applyTheme(){var m='auto';try{m=localStorage.getItem('jc-theme')||'auto';}catch(e){}
  var h=new Date().getHours(),t=(m==='light'||m==='dark')?m:(h>=7&&h<19?'light':'dark');
  d.documentElement.setAttribute('data-theme',t);var mt=$('metaTheme');if(mt)mt.setAttribute('content',t==='dark'?'#08090c':'#faf6ef');}
applyTheme();setInterval(applyTheme,60000);
window.addEventListener('storage',function(e){if(e.key==='jc-theme')applyTheme();});

/* ───────── 이용 안내 접기·펼치기 ───────── */
$('pvT').addEventListener('click',function(){var o=!$('pv').classList.contains('open');$('pv').classList.toggle('open',o);
  this.setAttribute('aria-expanded',String(o));$('pvL').textContent=o?'접기':'펼치기';if(o)$('pvB').removeAttribute('inert');else $('pvB').setAttribute('inert','');});
var toastT=0;function toast(m){var t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove('on');},2200);}

/* ───────── 데이터 불러오기 ───────── */
var C=null,N=null,BYC={},BYI={},GROUP={},ORDER=[];
var newsText='',checked={};/* 메모리에만 둔다 */
function load(u){return fetch(u,{cache:'no-cache'}).then(function(r){if(!r.ok)throw new Error(u+' '+r.status);return r.json();});}
Promise.all([load('./data/concepts.json'),load('./data/news.json')]).then(function(a){
  C=a[0];N=a[1];
  C.groups.forEach(function(g){GROUP[g.id]=g;});
  C.groups.forEach(function(g){C.concepts.forEach(function(c){if(c.group===g.id)ORDER.push(c);});});
  ORDER.forEach(function(c){BYC[c.id]=c;});
  N.indicators.forEach(function(x){BYI[x.id]=x;});
  N.indicators.forEach(function(x){x.rx=new RegExp(x.re);});
  N.patterns.forEach(function(x){x.rx=new RegExp(x.re);});
  $('nC').textContent=ORDER.length;$('nN').textContent=N.indicators.length;
  route();window.addEventListener('hashchange',route);
}).catch(function(e){
  $('main').innerHTML='<p class="loading">자료 파일을 불러오지 못했습니다. 인터넷 연결을 확인하고 새로 고침해 주세요.<br><small>('+esc(e.message)+')</small></p>';
});

/* ───────── 주소에 따라 화면 고르기 ───────── */
var lastView='';
function route(){
  var h=decodeURIComponent((location.hash||'').slice(1)),view,arg='';
  if(h.indexOf('c-')===0&&BYC[h.slice(2)]){view='concept';arg=h.slice(2);}
  else if(h==='news'||h.indexOf('news-')===0){view='news';arg=h.slice(5);}
  else if(h==='about')view='about';
  else view='concepts';
  var tab=view==='concept'?'concepts':view;
  Array.prototype.forEach.call(d.querySelectorAll('.tab'),function(t){if(t.getAttribute('data-tab')===tab)t.setAttribute('aria-current','page');else t.removeAttribute('aria-current');});
  var key=view+':'+arg;
  $('main').onclick=null;$('main').onchange=null;
  if(view==='concept')renderConcept(arg);
  else if(view==='news')renderNews(arg);
  else if(view==='about')renderAbout();
  else renderOverview();
  if(key!==lastView){
    var tabs=d.querySelector('.tabs'),top=tabs.getBoundingClientRect().top+window.pageYOffset-4;
    if(lastView&&!(view==='news'&&arg))window.scrollTo(0,Math.min(window.pageYOffset,top));
  }
  lastView=key;
  d.title=(view==='concept'?BYC[arg].title+' · ':view==='news'?'뉴스 읽기 · ':view==='about'?'안내·출처 · ':'')+'노동시장 산책';
}

/* ───────── 개념: 차례 ───────── */
function toc(cur){
  return '<nav class="toc" aria-label="개념 차례">'+C.groups.map(function(g){
    return '<h4>'+esc(g.name)+'</h4>'+ORDER.filter(function(c){return c.group===g.id;}).map(function(c){
      return '<a href="#c-'+c.id+'"'+(c.id===cur?' aria-current="true"':'')+'><span>'+esc(c.title)+'</span>'+(c.deep?'<span class="dtag">깊이</span>':'')+'</a>';}).join('');
  }).join('')+'</nav>';
}
function renderOverview(){
  var deepN=ORDER.filter(function(c){return c.deep;}).length;
  var html='<div class="cv">'+toc('')+'<div>'+
    '<div class="ov-intro">'+
      '<div><b>그림으로 먼저</b>수요·공급, 베버리지 곡선 같은 그래프를 막대로 직접 움직이며 원리를 봅니다.</div>'+
      '<div><b>우리 주변 이야기로</b>개념마다 한국 고용시장에서 볼 수 있는 예와 뉴스 속 모습을 붙였습니다.</div>'+
      '<div><b>깊이는 골라서</b>대학원 수준 개념 '+deepN+'개에는 <span class="dtag">깊이</span> 표시가 있습니다. 건너뛰어도 흐름은 이어집니다.</div>'+
    '</div>'+
    C.groups.map(function(g){
      return '<section class="ov-g"><h3>'+esc(g.name)+'</h3><p>'+esc(g.lead)+'</p><ul class="ov-l">'+
        ORDER.filter(function(c){return c.group===g.id;}).map(function(c){
          return '<li><a href="#c-'+c.id+'"><b>'+esc(c.title)+'</b> '+(c.deep?'<span class="dtag">깊이</span>':'')+'<span>'+esc(c.one)+'</span></a></li>';}).join('')+
        '</ul></section>';
    }).join('')+
  '</div></div>';
  $('main').innerHTML=html;
}

/* ───────── 개념: 본문 ───────── */
function renderConcept(id){
  var c=BYC[id],i=ORDER.indexOf(c),pv=ORDER[i-1],nx=ORDER[i+1],g=GROUP[c.group];
  var html='<div class="cv">'+toc(id)+'<article>'+
    '<a class="mtoc" href="#concepts">‹ 개념 차례</a>'+
    '<div class="kick">'+esc(g.name)+'<i>'+esc(c.en)+'</i></div>'+
    '<h2 class="tt">'+esc(c.title)+'</h2>'+
    (c.deep?'<p class="deep">'+DEEP_ICON+'<span><b>깊이 보기</b>'+DEEP_TEXT+'</span></p>':'')+
    '<p class="lead">'+esc(c.one)+'</p>'+
    (c.widget?'<div class="paper" id="wg"></div>':'')+
    '<h3 class="st">쉽게 풀면</h3><div class="prose">'+c.easy.map(function(p){return '<p>'+esc(p)+'</p>';}).join('')+'</div>'+
    '<h3 class="st">우리 주변에서</h3><ul class="ex">'+c.kr.map(function(p){return '<li>'+esc(p)+'</li>';}).join('')+'</ul>'+
    '<div class="notes"><div class="clipping"><b>뉴스에서는</b>'+esc(c.news)+'</div><div class="postit"><b>상담에서는</b>'+esc(c.counsel)+'</div></div>'+
    (c.related&&c.related.length?'<h3 class="st">이어서 보기</h3><div class="rel">'+c.related.filter(function(r){return BYC[r];}).map(function(r){return '<a href="#c-'+r+'">'+esc(BYC[r].title)+(BYC[r].deep?' <span class="dtag">깊이</span>':'')+'</a>';}).join('')+'<a href="#news">뉴스 읽기로 가기 ›</a></div>':'')+
    '<nav class="pn" aria-label="앞뒤 개념">'+(pv?'<a href="#c-'+pv.id+'"><small>‹ 앞</small><b>'+esc(pv.title)+'</b></a>':'<span style="flex:1"></span>')+
      (nx?'<a class="nx" href="#c-'+nx.id+'"><small>다음 ›</small><b>'+esc(nx.title)+'</b></a>':'<a class="nx" href="#news"><small>다음 ›</small><b>뉴스 읽기</b></a>')+'</nav>'+
  '</article></div>';
  $('main').innerHTML=html;
  if(c.widget&&W[c.widget])W[c.widget]($('wg'));
}

/* ───────── 그래프 도구 ───────── */
function plot(w,h,l,r,t,b,xmax,ymax,xmin,ymin){
  xmin=xmin||0;ymin=ymin||0;
  return {w:w,h:h,X:function(v){return l+(v-xmin)/(xmax-xmin)*(w-l-r);},Y:function(v){return h-b-(v-ymin)/(ymax-ymin)*(h-t-b);},l:l,r:r,t:t,b:b};
}
function axes(P,xl,yl){
  return '<path d="M'+P.l+' '+P.t+' V'+(P.h-P.b)+' H'+(P.w-P.r)+'" fill="none" stroke="var(--muted)" stroke-width="1.6" stroke-linecap="round"/>'+
    '<path d="M'+(P.l-4)+' '+(P.t+6)+' L'+P.l+' '+P.t+' L'+(P.l+4)+' '+(P.t+6)+'M'+(P.w-P.r-6)+' '+(P.h-P.b-4)+' L'+(P.w-P.r)+' '+(P.h-P.b)+' L'+(P.w-P.r-6)+' '+(P.h-P.b+4)+'" fill="none" stroke="var(--muted)" stroke-width="1.6"/>'+
    '<text x="'+(P.w-P.r)+'" y="'+(P.h-P.b+20)+'" text-anchor="end" font-size="12" font-weight="700" fill="var(--muted)">'+esc(xl)+'</text>'+
    '<text x="'+(P.l+8)+'" y="'+(P.t+4)+'" font-size="12" font-weight="700" fill="var(--muted)">'+esc(yl)+'</text>';
}
function line(P,x1,y1,x2,y2,col,wd,dash){return '<line x1="'+P.X(x1).toFixed(1)+'" y1="'+P.Y(y1).toFixed(1)+'" x2="'+P.X(x2).toFixed(1)+'" y2="'+P.Y(y2).toFixed(1)+'" stroke="'+col+'" stroke-width="'+(wd||3)+'" stroke-linecap="round"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>';}
function label(x,y,txt,col,anchor,sz){return '<text x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" font-size="'+(sz||12.5)+'" font-weight="750" fill="'+col+'" text-anchor="'+(anchor||'start')+'" paint-order="stroke" stroke="var(--paper)" stroke-width="4" stroke-linejoin="round">'+esc(txt)+'</text>';}
/* 직선 a*x+b 를 그림판(0..xmax, 0..ymax) 안으로 잘라 두 끝점을 돌려준다 */
function clipLine(a,b,xmax,ymax){
  var pts=[],xs=[0,xmax],ys=[0,ymax];
  xs.forEach(function(x){var y=a*x+b;if(y>=0&&y<=ymax)pts.push([x,y]);});
  if(a!==0)ys.forEach(function(y){var x=(y-b)/a;if(x>0&&x<xmax)pts.push([x,y]);});
  pts.sort(function(p,q){return p[0]-q[0];});
  return pts.length>=2?[pts[0],pts[pts.length-1]]:null;
}
function seg(P,a,b,xmax,ymax,col,wd,dash){var s=clipLine(a,b,xmax,ymax);return s?line(P,s[0][0],s[0][1],s[1][0],s[1][1],col,wd,dash):'';}
function slider(id,lab,min,max,step,val,note){
  return '<div class="sl"><label for="'+id+'">'+esc(lab)+' <output id="'+id+'o"></output></label><input type="range" id="'+id+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+val+'">'+(note?'<small>'+esc(note)+'</small>':'')+'</div>';
}
function fill(el){var p=(el.value-el.min)/(el.max-el.min)*100;el.style.setProperty('--p',p+'%');}
function bindAll(host,fn){Array.prototype.forEach.call(host.querySelectorAll('input'),function(i){i.addEventListener('input',function(){if(i.type==='range')fill(i);fn();});if(i.type==='range')fill(i);});}
function setv(host,id,v){var e=host.querySelector('#'+id);if(!e)return;if(e.type==='checkbox')e.checked=!!v;else{e.value=v;fill(e);}}
function num(host,id){var e=host.querySelector('#'+id);return e.type==='checkbox'?e.checked:Number(e.value);}
function out(host,id,t){var e=host.querySelector('#'+id+'o');if(e)e.textContent=t;}

var W={};

/* ① 사람을 나누는 세 칸: 실제 2026년 10월 수치(만 명)에서 출발해 사람을 칸 사이로 옮긴다 */
W.census=function(host){
  var B={E:2917.9,U:60.2,N:1629.9};
  host.innerHTML='<span class="clip">직접 옮겨 보기</span><h4>사람을 칸 사이로 옮기면 세 지표는 어떻게 움직일까</h4>'+
    '<p class="hint">출발점은 2026년 10월 실제 수치입니다(국가데이터처). 막대를 움직여 만 명 단위로 사람을 옮겨 보세요.</p>'+
    '<div class="two"><svg class="g" id="cs" viewBox="0 0 360 236" role="img" aria-label="취업자·실업자·비경제활동인구 사이 이동 그림"></svg>'+
    '<div><div class="pre"><button type="button" data-p="0,0,20,0">구직을 멈추는 사람이 늘면</button><button type="button" data-p="30,0,0,0">쉬던 사람이 구직에 나서면</button><button type="button" data-p="10,20,0,0">진짜 고용 회복</button><button type="button" data-p="0,0,0,0">2026년 10월 그대로</button></div>'+
    '<div class="ctrl">'+slider('ca','쉬던 사람이 구직 시작',0,60,1,0,'비경제활동인구 → 실업자')+slider('cb','구직자가 취업',0,30,1,0,'실업자 → 취업자')+slider('cc','구직을 멈춤',0,30,1,0,'실업자 → 비경제활동인구')+slider('cd','일을 그만두고 쉼',0,60,1,0,'취업자 → 비경제활동인구')+'</div></div></div>'+
    '<div class="read" id="crd"></div><p class="say" id="csay"></p>';
  function upd(){
    var a=num(host,'ca'),b=num(host,'cb'),c=num(host,'cc'),dd=num(host,'cd');
    out(host,'ca',a+'만 명');out(host,'cb',b+'만 명');out(host,'cc',c+'만 명');out(host,'cd',dd+'만 명');
    var E=B.E+b-dd,U=Math.max(0,B.U+a-b-c),Nn=B.N-a+c+dd,P=E+U+Nn;
    var ur=U/(E+U)*100,er=E/P*100,pr=(E+U)/P*100,ur0=B.U/(B.E+B.U)*100,er0=B.E/(B.E+B.U+B.N)*100,pr0=(B.E+B.U)/(B.E+B.U+B.N)*100;
    var rE=Math.sqrt(E)*1.05,rU=Math.max(4,Math.sqrt(U)*1.05),rN=Math.sqrt(Nn)*1.05;
    var pE=[86,112],pU=[270,62],pN=[270,172];
    function arrow(p,q,v,lab,off){
      var w=1.4+Math.min(v,60)/7,col=v>0?'var(--acc)':'var(--line-2)';
      var mx=(p[0]+q[0])/2+(off||0),my=(p[1]+q[1])/2;
      return '<path d="M'+p[0]+' '+p[1]+' Q'+mx+' '+my+' '+q[0]+' '+q[1]+'" fill="none" stroke="'+col+'" stroke-width="'+w.toFixed(1)+'" stroke-linecap="round" opacity="'+(v>0?.9:.6)+'" marker-end="url(#ah'+(v>0?'1':'0')+')"/>'+
        (v>0?label(mx,my-4,lab+' '+v,'var(--acc)','middle',11.5):'');
    }
    var s='<defs><marker id="ah1" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--acc)"/></marker><marker id="ah0" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--line-2)"/></marker></defs>';
    s+=arrow([pN[0]-6,pN[1]-rN+6],[pU[0]-4,pU[1]+rU+6],a,'',-26);
    s+=arrow([pU[0]-rU-6,pU[1]+2],[pE[0]+rE*.72,pE[1]-rE*.55],b,'',0);
    s+=arrow([pU[0]+4,pU[1]+rU+6],[pN[0]+6,pN[1]-rN+6],c,'',26);
    s+=arrow([pE[0]+rE*.8,pE[1]+rE*.5],[pN[0]-rN-4,pN[1]+4],dd,'',0);
    s+='<circle cx="'+pE[0]+'" cy="'+pE[1]+'" r="'+rE.toFixed(1)+'" fill="var(--sup)" opacity=".2" stroke="var(--sup)" stroke-width="2"/>'+
       '<circle cx="'+pU[0]+'" cy="'+pU[1]+'" r="'+rU.toFixed(1)+'" fill="var(--pen)" opacity=".28" stroke="var(--pen)" stroke-width="2"/>'+
       '<circle cx="'+pN[0]+'" cy="'+pN[1]+'" r="'+rN.toFixed(1)+'" fill="var(--dem)" opacity=".18" stroke="var(--dem)" stroke-width="2"/>';
    s+=label(pE[0],pE[1]-4,'취업자','var(--ink)','middle',14)+label(pE[0],pE[1]+14,fx(E,1)+'만','var(--muted)','middle',12);
    s+=label(pU[0]+rU+8,pU[1]-2,'실업자','var(--ink)','start',14)+label(pU[0]+rU+8,pU[1]+14,fx(U,1)+'만','var(--muted)','start',12);
    s+=label(pN[0],pN[1]-4,'비경제활동','var(--ink)','middle',13.5)+label(pN[0],pN[1]+14,fx(Nn,1)+'만','var(--muted)','middle',12);
    s+='<path d="M20 228 H200" stroke="var(--line-2)" stroke-width="1"/>'+label(20,222,'경제활동인구 = 취업자 + 실업자','var(--dim)','start',11);
    host.querySelector('#cs').innerHTML=s;
    function cell(k,v,v0){var dv=v-v0,cl=Math.abs(dv)<0.005?'eq':dv>0?'up':'dn';return '<div><small>'+k+'</small><b>'+fx(v,1)+'%</b><em class="'+cl+'">'+sgn(dv,2,'%p')+'</em></div>';}
    host.querySelector('#crd').innerHTML=cell('실업률',ur,ur0)+cell('고용률',er,er0)+cell('경제활동참가율',pr,pr0);
    var dU=ur-ur0,dE=er-er0,dP=pr-pr0,msg,warn=false;
    if(a+b+c+dd===0)msg='지금은 2026년 10월 실제 수치입니다. 실업률 2.0%는 경제활동인구(약 2,978만 명) 가운데 실업자 비율이고, 고용률 63.3%는 15세 이상 인구(약 4,608만 명) 가운데 취업자 비율입니다. 분모가 다릅니다.';
    else if(dU<-0.01&&dE<=0.001){msg='실업률은 내려갔지만 고용률은 그대로이거나 내려갔습니다. 일하는 사람이 늘어서가 아니라 구직을 멈춘 사람이 늘어 생긴 \'좋아 보이는\' 숫자일 수 있습니다.';warn=true;}
    else if(dU>0.01&&dP>0.01&&dE>=-0.001)msg='실업률은 올랐지만 참가율도 올랐습니다. 쉬던 사람이 다시 일을 찾아 나섰다는 뜻일 수 있어 나쁜 신호로만 볼 수 없습니다.';
    else if(dE>0.01&&dU<=0)msg='고용률이 오르고 실업률은 내려갔습니다. 실제로 일하는 사람이 늘어난, 비교적 분명한 개선입니다.';
    else if(dE<-0.01){msg='고용률이 내려갔습니다. 실업률이 크게 움직이지 않더라도 일하는 사람 자체가 줄었다는 점에 주목합니다.';warn=true;}
    else msg='여러 흐름이 겹쳤습니다. 세 지표를 함께 놓고, 어느 칸의 사람이 어디로 옮겼는지부터 떠올려 보세요.';
    var sy=host.querySelector('#csay');sy.textContent=msg;sy.className='say'+(warn?' warn':'');
  }
  host.querySelector('.pre').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;var v=b.getAttribute('data-p').split(',');['ca','cb','cc','cd'].forEach(function(k,i){setv(host,k,v[i]);});upd();});
  bindAll(host,upd);upd();
};

/* ② 수요와 공급: 경기·일할 사람·최저임금·임금 경직 */
W.market=function(host){
  host.innerHTML='<span class="clip">직접 움직여 보기</span><h4>경기와 인구가 바뀌면 임금과 일자리는</h4>'+
    '<p class="hint">숫자는 원리를 보여 주는 지수(0~100)이며 실제 통계가 아닙니다.</p>'+
    '<div class="two"><svg class="g" id="ms" viewBox="0 0 360 300" role="img" aria-label="노동수요와 노동공급 그래프"></svg>'+
    '<div><div class="pre"><button type="button" data-p="25,0,0,0,0">호황</button><button type="button" data-p="0,-25,0,0,1">일할 사람 감소 + 임금 경직</button><button type="button" data-p="-25,0,0,0,1">불황 + 임금 경직</button><button type="button" data-p="0,0,1,72,0">최저임금 높게</button><button type="button" data-p="0,0,0,60,0">처음으로</button></div>'+
    '<div class="ctrl">'+slider('ms1','경기(노동수요)',-30,30,1,0,'오른쪽일수록 물건이 잘 팔려 기업이 사람을 더 찾습니다')+slider('ms2','일할 사람(노동공급)',-30,30,1,0,'왼쪽일수록 일할 나이 인구가 줄어듭니다')+
    '<label class="tgl"><input type="checkbox" id="ms4"> 임금이 바로 못 따라가면(임금 경직)</label>'+
    '<label class="tgl"><input type="checkbox" id="ms3"> 최저임금 적용</label>'+slider('ms5','최저임금 수준',30,90,1,60,'')+'</div></div></div>'+
    '<div class="read" id="mrd"></div><p class="say" id="msay"></p>';
  var w0=115/1.9;
  function upd(){
    var s=num(host,'ms1'),p=num(host,'ms2'),mwOn=num(host,'ms3'),mw=num(host,'ms5'),st=num(host,'ms4');
    out(host,'ms1',sgn(s,0,''));out(host,'ms2',sgn(p,0,''));out(host,'ms5',mwOn?mw:'적용 안 함');
    host.querySelector('#ms5').disabled=!mwOn;
    var we=(115+s-p)/1.9,Le=110+s-we,wa=st?w0:we;if(mwOn&&mw>wa)wa=mw;
    var Ld=clamp(110+s-wa,0,100),Ls=clamp(.9*wa-5+p,0,100),L=Math.min(Ld,Ls),gap=Ls-Ld;
    var P=plot(360,300,36,14,22,30,100,100),g='';
    for(var i=20;i<=80;i+=20){g+='<text x="'+(P.X(i))+'" y="'+(P.h-P.b+14)+'" font-size="10" fill="var(--dim)" text-anchor="middle">'+i+'</text><text x="'+(P.l-6)+'" y="'+(P.Y(i)+3)+'" font-size="10" fill="var(--dim)" text-anchor="end">'+i+'</text>';}
    g+=axes(P,'일자리 수 →','임금 ↑');
    if(s!==0)g+=seg(P,-1,110,100,100,'var(--dem)',2,'4 5');
    if(p!==0)g+=seg(P,1/.9,(5)/.9,100,100,'var(--sup)',2,'4 5');
    g+=seg(P,-1,110+s,100,100,'var(--dem)',3.4)+seg(P,1/.9,(5-p)/.9,100,100,'var(--sup)',3.4);
    var dl=clipLine(-1,110+s,100,100),sl=clipLine(1/.9,(5-p)/.9,100,100);
    if(dl)g+=label(P.X(Math.min(dl[1][0],92))-2,P.Y(110+s-Math.min(dl[1][0],92))-8,'노동수요','var(--dem)','end');
    if(sl)g+=label(P.X(Math.min(sl[1][0],92))-4,P.Y((Math.min(sl[1][0],92)+5-p)/.9)+16,'노동공급','var(--sup)','end');
    if(Math.abs(wa-we)>.3){
      g+=line(P,0,wa,100,wa,'var(--muted)',1.4,'2 4');
      g+=line(P,Math.min(Ld,Ls),wa,Math.max(Ld,Ls),wa,gap>0?'var(--pen)':'var(--acc)',7);
      g+=label(P.X((Ld+Ls)/2),P.Y(wa)-10,gap>0?'일자리를 못 찾은 사람':'채우지 못한 자리',gap>0?'var(--pen)':'var(--acc)','middle',12);
      g+='<circle cx="'+P.X(we)+'" cy="'+P.Y(we)+'" r="5" fill="var(--paper)" stroke="var(--muted)" stroke-width="2"/>';
    }
    g+='<circle cx="'+P.X(L).toFixed(1)+'" cy="'+P.Y(wa).toFixed(1)+'" r="7" fill="var(--acc)" stroke="var(--paper)" stroke-width="2.5"/>';
    host.querySelector('#ms').innerHTML=g;
    var base=110-w0;
    host.querySelector('#mrd').innerHTML='<div><small>실제 임금</small><b>'+fx(wa,0)+'</b><em class="'+(wa-w0>.5?'up':wa-w0<-.5?'dn':'eq')+'">'+sgn(wa-w0,0,'')+'</em></div>'+
      '<div><small>실제 일자리</small><b>'+fx(L,0)+'</b><em class="'+(L-base>.5?'dn':L-base<-.5?'up':'eq')+'">'+sgn(L-base,0,'')+'</em></div>'+
      '<div><small>'+(gap>.5?'일자리를 못 찾은 사람':gap<-.5?'채우지 못한 자리':'남는 사람·자리')+'</small><b>'+fx(Math.abs(gap),0)+'</b><em class="eq">균형 '+fx(we,0)+' · '+fx(Le,0)+'</em></div>';
    var m;
    if(mwOn&&mw>(st?w0:we)+.3)m='최저임금이 시장에서 정해질 임금보다 높습니다. 경쟁시장 그림에서는 일하려는 사람이 늘고 기업이 쓰려는 사람은 줄어, 그 차이만큼 일자리를 못 찾는 사람이 생깁니다. 다만 고용주가 임금을 정하는 힘이 큰 시장이라면 결과가 다를 수 있습니다(수요독점).';
    else if(gap>.5)m='임금이 균형보다 높게 묶여 일하려는 사람이 남습니다. 불황인데 임금이 바로 내려가지 않으면 이렇게 경기적 실업이 생깁니다.';
    else if(gap<-.5)m='임금이 바로 오르지 못해 채우지 못한 자리가 생깁니다. 뉴스에서 말하는 구인난입니다. 시간이 지나 임금이 오르면 이 틈은 줄어듭니다.';
    else if(s>0&&p===0)m='경기가 좋아져 수요선이 오른쪽으로 옮겼습니다. 임금도 일자리도 함께 늘어납니다.';
    else if(p<0)m='일할 사람이 줄어 공급선이 왼쪽으로 옮겼습니다. 임금은 오르지만 일자리 수는 줄어듭니다. 고령화가 진행되는 지역에서 볼 수 있는 모습입니다.';
    else if(s<0)m='경기가 나빠져 수요선이 왼쪽으로 옮겼습니다. 임금이 자유롭게 내려가면 남는 사람은 없지만 임금과 일자리가 함께 줄어듭니다.';
    else m='두 선이 만나는 점이 균형입니다. 위의 단추나 막대로 한 가지씩 바꿔 보세요.';
    var sy=host.querySelector('#msay');sy.textContent=m;sy.className='say'+(gap>.5?' warn':'');
  }
  host.querySelector('.pre').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;var v=b.getAttribute('data-p').split(',');setv(host,'ms1',v[0]);setv(host,'ms2',v[1]);setv(host,'ms3',v[2]==='1');setv(host,'ms5',v[3]);setv(host,'ms4',v[4]==='1');upd();});
  bindAll(host,upd);upd();
};

/* ③ 수요독점: 공급 w=10+0.8L, 한계노동비용 w=10+1.6L, 노동의 가치 w=90-0.8L */
W.monopsony=function(host){
  host.innerHTML='<span class="clip">직접 움직여 보기</span><h4>고용주가 임금을 정할 수 있는 시장에서 최저임금을 올리면</h4>'+
    '<p class="hint">숫자는 원리를 보여 주는 지수입니다. 처음 상태는 최저임금이 없는 수요독점입니다.</p>'+
    '<div class="two"><svg class="g" id="mo" viewBox="0 0 360 300" role="img" aria-label="수요독점 그래프"></svg>'+
    '<div><div class="ctrl">'+slider('mo1','최저임금',30,80,1,30,'30이면 사실상 적용 안 함')+'</div>'+
    '<p class="fine" style="font-size:13.5px"><b style="color:var(--sup)">공급선</b>은 사람을 모으는 데 필요한 임금, <b style="color:var(--pen)">한계노동비용</b>은 한 사람을 더 쓸 때 늘어나는 총비용(기존 직원 임금 인상분 포함), <b style="color:var(--dem)">노동의 가치</b>는 한 사람이 더 만들어 내는 가치입니다.</p></div></div>'+
    '<div class="read" id="mord"></div><p class="say" id="mosay"></p>';
  function upd(){
    var m=num(host,'mo1');out(host,'mo1',m<=36?'적용 안 함 수준':m);
    var L,w,mode;
    if(m>36.67&&m<=50){L=(m-10)/.8;w=m;mode='up';}
    else if(m>50){L=(90-m)/.8;w=m;mode='down';}
    else{L=100/3;w=10+.8*L;mode='mono';}
    var P=plot(360,300,36,14,22,30,100,100),g='';
    for(var i=20;i<=80;i+=20){g+='<text x="'+P.X(i)+'" y="'+(P.h-P.b+14)+'" font-size="10" fill="var(--dim)" text-anchor="middle">'+i+'</text><text x="'+(P.l-6)+'" y="'+(P.Y(i)+3)+'" font-size="10" fill="var(--dim)" text-anchor="end">'+i+'</text>';}
    g+=axes(P,'고용 →','임금 ↑');
    g+=seg(P,.8,10,100,100,'var(--sup)',3.4)+seg(P,1.6,10,100,100,'var(--pen)',2.4,'6 5')+seg(P,-.8,90,100,100,'var(--dem)',3.4);
    g+=label(P.X(86),P.Y(10+.8*86)+16,'공급','var(--sup)','end')+label(P.X(52),P.Y(10+1.6*52)-6,'한계노동비용','var(--pen)','start')+label(P.X(98),P.Y(90-.8*98)-8,'노동의 가치','var(--dem)','end');
    g+='<circle cx="'+P.X(50)+'" cy="'+P.Y(50)+'" r="5" fill="var(--paper)" stroke="var(--muted)" stroke-width="2"/>'+label(P.X(50)+8,P.Y(50)-8,'경쟁시장','var(--muted)','start',11.5);
    g+=line(P,100/3,10+1.6*100/3,100/3,10+.8*100/3,'var(--muted)',1.4,'2 4')+'<circle cx="'+P.X(100/3)+'" cy="'+P.Y(36.67)+'" r="5" fill="var(--paper)" stroke="var(--muted)" stroke-width="2"/>'+label(P.X(100/3)-8,P.Y(36.67)+18,'수요독점','var(--muted)','end',11.5);
    if(mode!=='mono')g+=line(P,0,m,100,m,'var(--acc)',1.8,'3 4')+label(P.X(2),P.Y(m)-6,'최저임금','var(--acc)','start',11.5);
    g+='<circle cx="'+P.X(L).toFixed(1)+'" cy="'+P.Y(w).toFixed(1)+'" r="7" fill="var(--acc)" stroke="var(--paper)" stroke-width="2.5"/>';
    host.querySelector('#mo').innerHTML=g;
    var L0=100/3,w0=10+.8*L0;
    host.querySelector('#mord').innerHTML='<div><small>임금</small><b>'+fx(w,0)+'</b><em class="'+(w-w0>.5?'up':'eq')+'">'+sgn(w-w0,0,'')+'</em></div><div><small>고용</small><b>'+fx(L,0)+'</b><em class="'+(L-L0>.5?'dn':L-L0<-.5?'up':'eq')+'">'+sgn(L-L0,0,'')+'</em></div><div><small>경쟁시장과 비교</small><b>'+fx(L-50,0)+'</b><em class="eq">고용 차이</em></div>';
    var t=mode==='mono'?'고용주는 사람을 덜 뽑고 임금을 낮게 유지하는 쪽을 고릅니다. 경쟁시장(임금 50, 고용 50)보다 임금도 고용도 적습니다.':
      mode==='up'?'최저임금이 수요독점 임금과 경쟁시장 임금 사이에 있으면, 임금과 고용이 함께 늘어납니다. 한 사람을 더 써도 기존 직원 임금을 올릴 필요가 없어지기 때문입니다.':
      '최저임금이 경쟁시장 임금보다 높아지면 이제는 고용이 줄어들기 시작합니다. 같은 제도라도 수준에 따라 효과의 방향이 바뀝니다.';
    var sy=host.querySelector('#mosay');sy.textContent=t;sy.className='say'+(mode==='down'?' warn':'');
  }
  bindAll(host,upd);upd();
};

/* ④ 뒤로 휘는 노동공급곡선 */
W.backbend=function(host){
  function H(w){return 52*Math.sin(Math.PI*w/150);}
  host.innerHTML='<span class="clip">직접 움직여 보기</span><h4>시급이 오를 때 일하고 싶은 시간</h4>'+
    '<p class="hint">한 사람의 마음을 단순하게 그린 그림입니다. 사람마다 휘는 지점이 다릅니다.</p>'+
    '<div class="two"><svg class="g" id="bb" viewBox="0 0 360 300" role="img" aria-label="후방굴절 노동공급곡선"></svg>'+
    '<div class="ctrl">'+slider('bb1','시급(지수)',5,100,1,30,'')+'</div></div>'+
    '<div class="read" id="bbrd"></div><p class="say" id="bbsay"></p>';
  function upd(){
    var w=num(host,'bb1');out(host,'bb1',w);
    var P=plot(360,300,36,14,22,30,60,100),pth='';
    for(var v=2;v<=100;v+=2){pth+=(v===2?'M':'L')+P.X(H(v)).toFixed(1)+' '+P.Y(v).toFixed(1);}
    var g=axes(P,'일하고 싶은 시간(주) →','시급 ↑');
    for(var i=20;i<=60;i+=20)g+='<text x="'+P.X(i)+'" y="'+(P.h-P.b+14)+'" font-size="10" fill="var(--dim)" text-anchor="middle">'+i+'</text>';
    g+=line(P,0,75,60,75,'var(--line-2)',1.2,'3 5')+label(P.X(1),P.Y(75)-6,'이 위로는 소득효과가 더 큼','var(--dim)','start',11);
    g+='<path d="'+pth+'" fill="none" stroke="var(--sup)" stroke-width="3.4" stroke-linecap="round"/>';
    g+=line(P,0,w,H(w),w,'var(--acc)',1.4,'2 4')+line(P,H(w),0,H(w),w,'var(--acc)',1.4,'2 4');
    g+='<circle cx="'+P.X(H(w)).toFixed(1)+'" cy="'+P.Y(w).toFixed(1)+'" r="7" fill="var(--acc)" stroke="var(--paper)" stroke-width="2.5"/>';
    host.querySelector('#bb').innerHTML=g;
    var dH=H(w+1)-H(w-1);
    host.querySelector('#bbrd').innerHTML='<div><small>시급</small><b>'+w+'</b></div><div><small>일하고 싶은 시간</small><b>'+fx(H(w),0)+'시간</b></div><div><small>더 센 힘</small><b style="font-size:17px">'+(dH>0.05?'대체효과':dH<-0.05?'소득효과':'맞섬')+'</b></div>';
    host.querySelector('#bbsay').textContent=dH>0.05?'시급이 오르면 쉬는 한 시간의 값이 비싸져 더 일하고 싶어집니다. 지금은 이 힘(대체효과)이 더 큽니다.':dH<-0.05?'벌이가 충분해지면서 남는 시간을 쉼과 가족에 쓰고 싶은 마음(소득효과)이 더 커졌습니다. 시급이 올라도 일하고 싶은 시간이 줄어듭니다.':'두 힘이 맞서 일하고 싶은 시간이 가장 긴 지점입니다.';
  }
  bindAll(host,upd);upd();
};

/* ⑤ 베버리지 곡선: v = K/u, K = 9/매칭효율 */
W.beveridge=function(host){
  host.innerHTML='<span class="clip">직접 움직여 보기</span><h4>경기는 점을, 매칭 효율은 곡선을 움직입니다</h4>'+
    '<p class="hint">숫자는 원리를 보여 주는 지수입니다. 점선은 처음 곡선입니다.</p>'+
    '<div class="two"><svg class="g" id="bv" viewBox="0 0 360 300" role="img" aria-label="베버리지 곡선"></svg>'+
    '<div><div class="pre"><button type="button" data-p="0.8,1">호황</button><button type="button" data-p="-0.8,1">불황</button><button type="button" data-p="0.2,0.65">미스매치 심화</button><button type="button" data-p="0,1">처음으로</button></div>'+
    '<div class="ctrl">'+slider('bv1','경기',-1,1,.05,0,'오른쪽일수록 좋음')+slider('bv2','매칭 효율',.6,1.4,.05,1,'왼쪽일수록 사람과 자리가 서로를 잘 못 찾음')+'</div></div></div>'+
    '<div class="read" id="bvrd"></div><p class="say" id="bvsay"></p>';
  function upd(){
    var gg=num(host,'bv1'),e=num(host,'bv2');out(host,'bv1',gg>.15?'좋음':gg<-.15?'나쁨':'보통');out(host,'bv2',fx(e,2)+'배');
    var K=9/e,u=4.5-2.2*gg,v=K/u,P=plot(360,300,36,14,22,30,9,6);
    function curve(k,col,wd,dash){var s='';for(var x=1.3;x<=9;x+=.1){var y=k/x;if(y>6)continue;s+=(s?'L':'M')+P.X(x).toFixed(1)+' '+P.Y(y).toFixed(1);}return '<path d="'+s+'" fill="none" stroke="'+col+'" stroke-width="'+wd+'"'+(dash?' stroke-dasharray="'+dash+'"':'')+' stroke-linecap="round"/>';}
    var g=axes(P,'실업률 →','빈일자리율 ↑');
    if(Math.abs(e-1)>.01)g+=curve(9,'var(--muted)',2,'4 5');
    g+=curve(K,'var(--acc)',3.4);
    g+=label(P.X(1.6),P.Y(5.4),'경기 좋음','var(--good)','start',11.5)+label(P.X(8.8),P.Y(.35),'경기 나쁨','var(--pen)','end',11.5);
    if(e<.95)g+='<path d="M'+P.X(3.2)+' '+P.Y(9/3.2)+' L'+P.X(3.2+.9)+' '+P.Y(9/3.2+.8)+'" stroke="var(--pen)" stroke-width="2" marker-end="url(#bva)"/><defs><marker id="bva" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--pen)"/></marker></defs>'+label(P.X(4.3),P.Y(9/3.2+.9),'곡선이 바깥으로','var(--pen)','start',11.5);
    g+='<circle cx="'+P.X(u).toFixed(1)+'" cy="'+P.Y(Math.min(v,6)).toFixed(1)+'" r="7" fill="var(--acc)" stroke="var(--paper)" stroke-width="2.5"/>';
    host.querySelector('#bv').innerHTML=g;
    host.querySelector('#bvrd').innerHTML='<div><small>실업(지수)</small><b>'+fx(u,1)+'</b></div><div><small>빈 일자리(지수)</small><b>'+fx(v,1)+'</b></div><div><small>곡선 위치</small><b style="font-size:17px">'+(e<.95?'바깥으로':e>1.05?'안쪽으로':'그대로')+'</b></div>';
    var t=e<.95?'곡선이 바깥으로 밀렸습니다. 같은 경기에서도 빈 일자리와 실업이 함께 많습니다. 지역·직무·기술이 어긋난 미스매치이며, 경기 부양보다 훈련·정보·이동 지원이 처방이 됩니다.':
      e>1.05?'매칭이 좋아져 곡선이 안쪽으로 당겨졌습니다. 같은 경기에서 실업도 빈 일자리도 줄어듭니다. 고용서비스와 정보 공유가 잘 작동하는 모습입니다.':
      gg>.15?'경기가 좋아 점이 곡선을 따라 왼쪽 위로 올라갔습니다. 실업은 줄고 빈 일자리는 늘어납니다.':gg<-.15?'경기가 나빠 점이 곡선을 따라 오른쪽 아래로 내려갔습니다. 실업은 늘고 빈 일자리는 줄어듭니다.':'경기 막대는 점을 곡선 위로, 매칭 효율 막대는 곡선 자체를 옮깁니다.';
    var sy=host.querySelector('#bvsay');sy.textContent=t;sy.className='say'+(e<.95?' warn':'');
  }
  host.querySelector('.pre').addEventListener('click',function(ev){var b=ev.target.closest('button');if(!b)return;var v=b.getAttribute('data-p').split(',');setv(host,'bv1',v[0]);setv(host,'bv2',v[1]);upd();});
  bindAll(host,upd);upd();
};

/* ⑥ 명목·실질임금 */
W.real=function(host,pref){
  pref=pref||'rw';
  host.innerHTML='<span class="clip">어림셈</span><h4>월급은 올랐는데 장바구니는</h4>'+
    '<p class="hint">작년 월급으로 산 장바구니를 100개라고 놓고 올해 몇 개를 살 수 있는지 봅니다.</p>'+
    '<div class="ctrl">'+
      '<div class="sl"><label for="'+pref+'0">작년 월급(만 원) <output id="'+pref+'0o"></output></label><input type="range" id="'+pref+'0" min="150" max="800" step="10" value="300"></div>'+
      slider(pref+'1','월급 인상률',-2,10,.1,3,'명목임금 상승률')+slider(pref+'2','물가 상승률',-1,8,.1,4,'소비자물가 상승률')+
    '</div><svg class="g" id="'+pref+'s" viewBox="0 0 360 120" role="img" aria-label="장바구니 비교"></svg>'+
    '<div class="read" id="'+pref+'r"></div><p class="say" id="'+pref+'y"></p>';
  function upd(){
    var m=num(host,pref+'0'),n=num(host,pref+'1')/100,p=num(host,pref+'2')/100;
    out(host,pref+'0',m+'만 원');out(host,pref+'1',fx(n*100,1)+'%');out(host,pref+'2',fx(p*100,1)+'%');
    var r=(1+n)/(1+p)-1,bk=100*(1+r),nm=m*(1+n);
    var mx=120,X=function(v){return 70+v/mx*270;};
    var g='<text x="62" y="40" text-anchor="end" font-size="12.5" font-weight="750" fill="var(--muted)">작년</text><rect x="70" y="26" width="'+(X(100)-70)+'" height="20" rx="5" fill="var(--line-2)"/>'+
      '<text x="62" y="84" text-anchor="end" font-size="12.5" font-weight="750" fill="var(--muted)">올해</text><rect x="70" y="70" width="'+(X(bk)-70).toFixed(1)+'" height="20" rx="5" fill="'+(r<0?'var(--pen)':'var(--acc)')+'"/>'+
      '<line x1="'+X(100)+'" y1="16" x2="'+X(100)+'" y2="100" stroke="var(--muted)" stroke-dasharray="3 4"/>'+
      label(X(100)+4,20,'100개','var(--muted)','start',11.5)+label(Math.min(X(bk)+6,330),84,fx(bk,1)+'개',r<0?'var(--pen)':'var(--acc)',X(bk)+6>330?'end':'start',12.5);
    host.querySelector('#'+pref+'s').innerHTML=g;
    host.querySelector('#'+pref+'r').innerHTML='<div><small>올해 월급(명목)</small><b>'+fx(nm,0)+'만</b><em class="eq">'+sgn(n*100,1,'%')+'</em></div><div><small>작년 돈 가치로</small><b>'+fx(m*(1+r),0)+'만</b><em class="'+(r<0?'up':'dn')+'">'+sgn(r*100,2,'%')+'</em></div><div><small>어림셈(뺄셈)</small><b>'+sgn((n-p)*100,1,'%')+'</b><em class="eq">정확한 값과 비교</em></div>';
    var sy=host.querySelector('#'+pref+'y');
    sy.textContent=r<-0.0005?'월급 이름표는 '+fx(n*100,1)+'% 올랐지만 실제로 살 수 있는 양은 '+fx(-r*100,2)+'% 줄었습니다. 명목임금은 올랐고 실질임금은 내려간 상태입니다.':r>0.0005?'물가보다 월급이 더 올라 실제로 살 수 있는 양이 늘었습니다. 실질임금이 오른 상태입니다.':'월급 인상과 물가 상승이 비슷해 실제로 살 수 있는 양은 그대로입니다.';
    sy.className='say'+(r<-0.0005?' warn':'');
  }
  bindAll(host,upd);upd();
};

/* ⑦ 실업의 세 갈래: 사례 나누기 */
W.unemp=function(host){
  var L={f:'마찰적',s:'구조적',c:'경기적'},ans={};
  function draw(){
    var ok=0,done=0;C.unempCases.forEach(function(x,i){if(ans[i]){done++;if(ans[i]===x.a)ok++;}});
    host.innerHTML='<span class="clip">나눠 보기</span><h4>이 사례는 어느 갈래에 가까울까</h4><p class="hint">현실의 실업은 여러 갈래가 섞여 있습니다. 가장 가까운 쪽을 골라 보세요. <b class="num">'+done+'/'+C.unempCases.length+'</b> 고름 · 맞음 <b class="num">'+ok+'</b></p><div class="cases">'+
      C.unempCases.map(function(x,i){var a=ans[i];
        return '<div class="case"><p>'+esc(x.t)+'</p><div class="bt">'+['f','s','c'].map(function(k){var cl=a?(k===x.a?' class="ok"':(k===a?' class="no"':'')):'';return '<button type="button" data-i="'+i+'" data-k="'+k+'"'+cl+(a?' aria-pressed="'+(k===a)+'"':'')+'>'+L[k]+'</button>';}).join('')+'</div>'+
        (a?'<p class="why">'+(a===x.a?'맞습니다. ':'가장 가까운 갈래는 '+L[x.a]+' 실업입니다. ')+esc(x.why)+'</p>':'')+'</div>';}).join('')+
      '</div>'+(done?'<div class="pre"><button type="button" data-reset="1">다시 해 보기</button></div>':'');
  }
  host.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;if(b.getAttribute('data-reset')){ans={};draw();return;}var i=b.getAttribute('data-i');if(i==null)return;ans[i]=b.getAttribute('data-k');draw();});
  draw();
};

/* ⑧ 이중구조: 두 층과 끊긴 사다리 */
W.dual=function(host){
  host.innerHTML='<span class="clip">그림으로 보기</span><h4>두 층 사이를 잇는 사다리</h4><p class="hint">수치 없이 구조만 그린 그림입니다. 스위치를 켜면 두 층을 잇는 장치가 나타납니다.</p>'+
    '<svg class="g" id="du" viewBox="0 0 360 250" role="img" aria-label="1차·2차 노동시장 구조 그림"></svg><label class="tgl"><input type="checkbox" id="du1"> 사다리 잇기(경력·숙련 인정, 직무 중심 평가, 훈련)</label><p class="say" id="dusay"></p>';
  function upd(){
    var on=num(host,'du1'),g='';
    g+='<rect x="14" y="16" width="332" height="86" rx="14" fill="var(--acc-soft)" stroke="var(--acc)" stroke-width="1.6"/>';
    g+=label(28,40,'1차 시장','var(--acc)','start',14)+label(28,60,'임금·고용 안정성·교육 기회가 큼','var(--muted)','start',11.5)+label(28,78,'안쪽에 승진 사다리(내부노동시장)','var(--muted)','start',11.5);
    for(var i=0;i<4;i++){g+='<rect x="'+(240+i*22)+'" y="'+(84-i*16)+'" width="18" height="'+(10+i*16)+'" rx="3" fill="var(--acc)" opacity="'+(.35+i*.15)+'"/>';}
    g+='<rect x="14" y="150" width="332" height="86" rx="14" fill="var(--pen-soft)" stroke="var(--pen)" stroke-width="1.6" stroke-dasharray="5 4"/>';
    g+=label(28,174,'2차 시장','var(--pen)','start',14)+label(28,194,'이직이 잦고 경력이 잘 쌓이지 않음','var(--muted)','start',11.5)+label(28,212,'첫 일자리가 여기서 시작되는 경우가 많음','var(--muted)','start',11.5);
    var lx=200;
    if(on){g+='<g>';for(var k=0;k<5;k++){g+='<line x1="'+(lx)+'" y1="'+(144-k*9)+'" x2="'+(lx+34)+'" y2="'+(144-k*9)+'" stroke="var(--good)" stroke-width="3" stroke-linecap="round"/>';}
      g+='<line x1="'+lx+'" y1="150" x2="'+lx+'" y2="102" stroke="var(--good)" stroke-width="3"/><line x1="'+(lx+34)+'" y1="150" x2="'+(lx+34)+'" y2="102" stroke="var(--good)" stroke-width="3"/></g>'+label(lx+42,132,'이어진 사다리','var(--good)','start',12);}
    else{g+='<line x1="'+lx+'" y1="150" x2="'+lx+'" y2="132" stroke="var(--muted)" stroke-width="3"/><line x1="'+(lx+34)+'" y1="150" x2="'+(lx+34)+'" y2="132" stroke="var(--muted)" stroke-width="3"/><line x1="'+lx+'" y1="141" x2="'+(lx+34)+'" y2="141" stroke="var(--muted)" stroke-width="3"/>'+
      '<line x1="'+lx+'" y1="120" x2="'+lx+'" y2="102" stroke="var(--muted)" stroke-width="3" opacity=".5"/><line x1="'+(lx+34)+'" y1="120" x2="'+(lx+34)+'" y2="102" stroke="var(--muted)" stroke-width="3" opacity=".5"/>'+label(lx+42,132,'끊긴 사다리','var(--muted)','start',12);}
    g+='<path d="M70 246 V238" stroke="var(--dim)" stroke-width="2"/>';
    host.querySelector('#du').innerHTML=g;
    host.querySelector('#dusay').textContent=on?'두 층 사이 사다리가 이어지면 첫 일자리가 평생 경로를 덜 좌우하게 됩니다. 경력·숙련을 인정하는 평가, 직무 중심 채용, 훈련과 일경험이 사다리의 가로대 역할을 합니다.':'사다리가 끊겨 있으면 2차 시장에서 시작한 사람이 위로 옮겨 가기 어렵습니다. 그래서 첫 일자리를 신중하게 고르려고 취업 준비가 길어지기도 합니다.';
  }
  bindAll(host,upd);upd();
};

/* ───────── 뉴스 읽기 ───────── */
function analyze(text){
  var spans=[];
  function scan(list,kind){list.forEach(function(x){var rg=new RegExp(x.re,'g'),m,guard=0;while((m=rg.exec(text))&&guard++<200){if(!m[0]){rg.lastIndex++;continue;}spans.push({s:m.index,e:m.index+m[0].length,k:kind,id:x.id});}});}
  scan(N.indicators,'i');scan(N.patterns,'p');
  spans.sort(function(a,b){return a.s-b.s||(b.e-b.s)-(a.e-a.s);});
  var kept=[],end=-1;spans.forEach(function(sp){if(sp.s>=end){kept.push(sp);end=sp.e;}});
  var order=[],num={};
  /* 지표가 먼저, 표현 함정은 그다음 (같은 갈래 안에서는 처음 나온 순서) */
  spans.forEach(function(sp){var key=sp.k+':'+sp.id;if(num[key]==null&&sp.k==='i'){num[key]=order.length+1;order.push(sp);}});
  spans.forEach(function(sp){var key=sp.k+':'+sp.id;if(num[key]==null&&sp.k==='p'){num[key]=order.length+1;order.push(sp);}});
  var html='',pos=0;
  kept.forEach(function(sp){html+=esc(text.slice(pos,sp.s));var key=sp.k+':'+sp.id;html+='<mark class="'+(sp.k==='p'?'pt':'')+'" data-go="'+key+'">'+esc(text.slice(sp.s,sp.e))+'<sup>'+num[key]+'</sup></mark>';pos=sp.e;});
  html+=esc(text.slice(pos));
  return {html:html.replace(/\n/g,'<br>'),order:order,num:num};
}
function latestFor(id){return N.latest.items.filter(function(x){return x.see===id;});}
function indCard(x,n){
  var lt=latestFor(x.id);
  return '<article class="ic" id="k-i-'+x.id+'"><div class="ic-h">'+(n?'<span class="n">'+n+'</span>':'')+'<h4>'+esc(x.name)+'</h4></div>'+
    '<p>'+esc(x.def)+'</p><span class="fx">'+esc(x.formula)+'</span>'+
    '<div class="trap"><b>흔한 함정</b>'+esc(x.trap)+'</div>'+
    '<ul class="ck">'+x.checks.map(function(c,i){var k=x.id+':'+i;return '<li><label><input type="checkbox" data-ck="'+esc(k)+'"'+(checked[k]?' checked':'')+'><span>'+esc(c)+'</span></label></li>';}).join('')+'</ul>'+
    (lt.length?'<div class="lt">'+lt.map(function(l){return '<span>'+esc(l.k)+' <b>'+esc(l.v)+'</b> <span class="muted">('+esc(l.d)+')</span></span>';}).join('')+'<span class="muted">· 2026년 10월 기준</span></div>':'')+
    (x.see&&BYC[x.see]?'<a class="go" href="#c-'+x.see+'">개념으로 이해하기: '+esc(BYC[x.see].title)+' ›</a>':'')+'</article>';
}
function patNote(x,n){return '<div class="pnote" id="k-p-'+x.id+'"><b>'+n+'. '+esc(x.title)+'</b>'+esc(x.note)+'</div>';}
function renderNews(arg){
  var L=N.latest;
  var html='<section class="board"><div class="board-h"><h3>'+esc(L.title)+'</h3><small>'+esc(L.asOf)+'</small></div>'+
    '<div class="figs">'+L.items.map(function(x){return '<button type="button" class="fig" data-ind="'+x.see+'"><small>'+esc(x.k)+'</small><b>'+esc(x.v)+'</b><em class="eq">'+(/^\+/.test(x.d)?'▲ ':/^-/.test(x.d)?'▼ ':'')+esc(x.d.replace(/^[+-]/,''))+'</em></button>';}).join('')+'</div>'+
    '<p class="say">'+esc(L.reading)+' 화살표는 오르내림만 나타내며 좋고 나쁨을 뜻하지 않습니다.</p><p class="fine">'+esc(L.note)+' 출처: '+Object.keys(N.srcs).map(function(k){return '<a href="'+esc(N.srcs[k].url)+'" target="_blank" rel="noopener">'+esc(N.srcs[k].name)+'</a>';}).join(' · ')+'</p></section>'+
    '<div class="desk"><div>'+
      '<div class="clip-in"><label for="nt">기사 문장이나 지표 낱말을 넣어 보세요</label><textarea id="nt" placeholder="예) 지난달 실업률이 역대 최저를 기록했지만 청년 고용률은 1.5%p 떨어졌다.">'+esc(newsText)+'</textarea>'+
      '<div class="act"><button class="btn pri" type="button" id="nGo"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/><path d="M14 6l3 3"/></svg>빨간 펜으로 읽기</button><button class="btn sec" type="button" id="nClr">지우기</button></div></div>'+
      '<p class="lab">연습용 가상 기사 고르기</p><ul class="samples">'+N.samples.map(function(s){return '<li><button type="button" data-s="'+s.id+'"><span>가상</span>'+esc(s.title)+'</button></li>';}).join('')+'</ul>'+
      '<p class="lab">지표 낱말로 바로 보기</p><div class="chips">'+N.indicators.filter(function(x){return x.chip;}).map(function(x){return '<button type="button" class="chip" data-ind="'+x.id+'" aria-pressed="'+(arg===x.id)+'">'+esc(x.name)+'</button>';}).join('')+'</div>'+
      '<h3 class="st">기사를 읽을 때 다섯 가지 질문</h3><ol class="fiveq">'+N.fiveQ.map(function(q){return '<li><b>'+esc(q.q)+'</b><span>'+esc(q.a)+'</span></li>';}).join('')+'</ol>'+
    '</div><div id="nOut" aria-live="polite"></div></div>'+
    '<div class="paper" id="nReal" style="margin-top:32px"></div>'+
    '<h3 class="st">공식 숫자는 여기서 확인합니다</h3><ul class="where">'+N.where.map(function(w){return '<li><a href="'+esc(w.url)+'" target="_blank" rel="noopener"><b>'+esc(w.name)+'</b><span>'+esc(w.what)+'</span></a></li>';}).join('')+'</ul>';
  $('main').innerHTML=html;
  W.real($('nReal'),'nr');
  var ta=$('nt');
  ta.addEventListener('input',function(){newsText=ta.value;});
  $('nGo').addEventListener('click',function(){newsText=ta.value;showResult(true);});
  $('nClr').addEventListener('click',function(){newsText='';ta.value='';showResult(false);ta.focus();});
  $('main').onclick=onNewsClick;
  $('main').onchange=(function(e){var c=e.target.closest('[data-ck]');if(c)checked[c.getAttribute('data-ck')]=c.checked;});
  if(arg&&BYI[arg])showOne(arg,false);else showResult(false);
}
function showResult(scroll){
  var o=$('nOut');if(!o)return;
  var t=(newsText||'').trim();
  if(!t){o.innerHTML='<div class="out-h"><h3>빨간 펜 메모</h3></div><p class="empty">왼쪽에 기사 문장을 붙여 넣거나 가상 기사를 고르면, 지표에는 밑줄과 번호를, 오해하기 쉬운 표현에는 점선 밑줄을 긋고 여기에 짚을 점을 정리합니다.</p>';return;}
  var r=analyze(t);
  var iN=r.order.filter(function(x){return x.k==='i';}).length,pN=r.order.length-iN;
  o.innerHTML='<div class="out-h"><h3>빨간 펜 메모</h3><small>지표 '+iN+'개 · 표현 '+pN+'개</small></div><div class="marked">'+r.html+'</div>'+
    (r.order.length?'<div style="margin-top:16px">'+r.order.map(function(sp){var n=r.num[sp.k+':'+sp.id];return sp.k==='i'?indCard(BYI[sp.id],n):patNote(N.patterns.filter(function(p){return p.id===sp.id;})[0],n);}).join('')+'</div>':
      '<p class="empty">짚을 지표를 찾지 못했습니다. 실업률·고용률·쉬었음·실질임금·구인배수 같은 낱말이 들어 있는지 확인하거나, 왼쪽 지표 낱말을 눌러 보세요.</p>');
  if(scroll&&window.matchMedia('(max-width:999px)').matches)o.scrollIntoView({behavior:'smooth',block:'start'});
}
function showOne(id,scroll){
  var o=$('nOut');if(!o||!BYI[id])return;
  Array.prototype.forEach.call(d.querySelectorAll('.chip[data-ind]'),function(c){c.setAttribute('aria-pressed',String(c.getAttribute('data-ind')===id));});
  o.innerHTML='<div class="out-h"><h3>지표 바로 보기</h3><small><a href="#news" class="go" style="font-size:13px">메모로 돌아가기</a></small></div>'+indCard(BYI[id],0);
  if(scroll)o.scrollIntoView({behavior:'smooth',block:'start'});
}
function onNewsClick(e){
  var s=e.target.closest('[data-s]');
  if(s){var smp=N.samples.filter(function(x){return x.id===s.getAttribute('data-s');})[0];newsText=smp.text;$('nt').value=smp.text;showResult(true);toast('가상 기사 「'+smp.title+'」를 넣었습니다.');return;}
  var ind=e.target.closest('[data-ind]');
  if(ind){var id=ind.getAttribute('data-ind');if(BYI[id]){history.replaceState(null,'','#news-'+id);lastView='news:'+id;showOne(id,true);}return;}
  var mk=e.target.closest('mark[data-go]');
  if(mk){var k=mk.getAttribute('data-go').replace(':','-'),el=$('k-'+k);if(el){el.scrollIntoView({behavior:'smooth',block:'start'});el.animate&&el.animate([{boxShadow:'0 0 0 3px var(--pen)'},{boxShadow:'0 0 0 0 transparent'}],{duration:1200});}}
}

/* ───────── 안내·출처 ───────── */
function renderAbout(){
  var deep=ORDER.filter(function(c){return c.deep;});
  $('main').innerHTML='<div class="about" style="max-width:780px">'+
    '<h3 class="st">이 꼭지는 이런 곳입니다</h3><div class="prose">'+
    '<p>노동시장 산책은 직업상담 실무자와 경제학을 따로 공부하지 않은 분들이 고용 뉴스와 노동시장의 기본 원리를 편하게 이해하도록 돕는 상식·참고 도구입니다. 시험 문제의 정답을 외우는 곳이 아니며, 경제학 안에서도 해석이 갈리는 대목은 갈린다고 적었습니다.</p>'+
    '<p>설명 수준은 경제학 학부 과정의 핵심 원리에 맞췄고, 뉴스를 제대로 읽는 데 꼭 필요한 대학원 수준 개념 '+deep.length+'개('+deep.map(function(c){return c.title;}).join(', ')+')에는 「깊이 보기」 표시를 달았습니다.</p>'+
    '<p>뉴스 읽기 도우미는 외부 AI나 서버를 쓰지 않습니다. 이 화면에 들어 있는 지표 사전과 표현 규칙만으로 붙여 넣은 문장을 바로 살펴보며, 문장은 저장하거나 보내지 않습니다. 규칙으로 찾는 방식이라 문맥을 완전히 이해하지는 못하므로, 짚어 준 점은 스스로 확인할 출발점으로 써 주세요.</p></div>'+
    '<h3 class="st">숫자의 출처</h3><ul>'+Object.keys(N.srcs).map(function(k){return '<li><a href="'+esc(N.srcs[k].url)+'" target="_blank" rel="noopener">'+esc(N.srcs[k].name)+'</a></li>';}).join('')+
      '<li>2026년 최저임금 시간당 10,320원: 최저임금위원회 결정, 고용노동부 고시</li></ul>'+
    '<p class="muted" style="font-size:15px">최근 수치는 '+esc(N.checked)+'에 확인했습니다. 통계청은 2025년 10월부터 국가데이터처로 이름이 바뀌었습니다. 수치는 사실만 옮겨 적었고 보도자료 문장은 싣지 않았습니다.</p>'+
    '<h3 class="st">바탕 이론</h3><ul>'+C.sources.map(function(s){return '<li>'+esc(s.name)+' <span class="muted">— '+esc(s.use)+'</span></li>';}).join('')+'</ul>'+
    '<p class="muted" style="font-size:15px">이론은 이름과 요지만 소개했고, 설명·예시·연습용 가상 기사는 모두 이 자료실에서 새로 쓴 문장입니다. 그래프는 원리를 보이기 위해 단순한 식으로 새로 그렸으며 실제 추정치가 아닙니다.</p>'+
    '<h3 class="st">함께 보면 좋은 자료실 꼭지</h3><div class="rel"><a href="../library/">국회 미래고용 디지털 서재</a><a href="../transit/">환승노선도</a><a href="../hud/">국취 실무 상담 HUD</a><a href="../theory/">직업상담 이론 위키</a></div>'+
  '</div>';
}
})();
