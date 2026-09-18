(function () {
  'use strict';
  if (window.SoilWorkImageDeck) return;
  function mount(host, images, options) {
    options=options||{};
    var index=0, locked=false, disposed=false, timer=0, delta=0, wheelTimer=0, start=null;
    var reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    host.classList.add('wr-deck'); host.tabIndex=0;
    host.setAttribute('role','region'); host.setAttribute('aria-label','图片附件，使用滚轮、方向键或小键盘方向键切换');
    host.innerHTML='<div class="wr-deck-stage"></div><div class="wr-deck-controls"><button type="button" class="wr-btn" data-deck-step="-1" aria-label="上一张图片">←</button><span class="wr-deck-count" aria-live="polite"></span><button type="button" class="wr-btn" data-deck-step="1" aria-label="下一张图片">→</button></div><div class="wr-deck-hint">滚轮 / 方向键 / 左右滑动切换 · 点击图片查看原图</div>';
    var stage=host.querySelector('.wr-deck-stage'),count=host.querySelector('.wr-deck-count');
    function position(card, depth, animate) {
      card.style.transition=animate&&!reduced ? 'transform 360ms cubic-bezier(.2,.8,.2,1), opacity 300ms ease' : 'none';
      card.style.transform='translate3d(0,'+(depth*16)+'px,0) scale('+(1-depth*.045)+')';
      card.style.opacity=depth<4 ? String(1-depth*.14) : '0';
      card.style.zIndex=String(10-depth);
    }
    function render() {
      if(disposed)return;
      stage.replaceChildren();
      for(var d=0;d<Math.min(4,images.length);d++) {
        var at=(index+d)%images.length, item=images[at], card=document.createElement('button');
        card.type='button'; card.className='wr-deck-card'; card.dataset.index=at;
        card.tabIndex=d===0?0:-1; card.setAttribute('aria-label','查看图片：'+item.name);
        var img=document.createElement('img'); img.alt=item.name; img.src=item.url; img.decoding='async'; img.loading=d===0?'eager':'lazy'; img.draggable=false;
        img.onerror=function(){this.alt='图片暂时未能加载，点击可重试查看';};
        card.appendChild(img); position(card,d,false); stage.appendChild(card);
      }
      count.textContent=(index+1)+' / '+images.length+' · '+images[index].name;
      host.querySelectorAll('[data-deck-step]').forEach(function(b){b.disabled=images.length<2;});
      [1,-1].forEach(function(step){var preload=new Image();preload.src=images[(index+step+images.length)%images.length].url;});
    }
    function move(step) {
      if(disposed||locked||images.length<2)return false;
      locked=true;
      var cards=Array.from(stage.children),top=cards[0];
      if(reduced) { index=(index+step+images.length)%images.length; render(); locked=false; return true; }
      top.style.transition='transform 340ms cubic-bezier(.2,.8,.2,1), opacity 260ms ease';
      top.style.transform='translate3d('+(step>0?'-72%':'72%')+',-12px,0) rotate('+(step>0?-7:7)+'deg)';
      top.style.opacity='0';
      cards.slice(1).forEach(function(card,i){position(card,i,true);});
      timer=setTimeout(function(){index=(index+step+images.length)%images.length;render();locked=false;},350);
      return true;
    }
    function wheel(e) {
      if(images.length<2||e.ctrlKey)return;
      e.preventDefault();
      if(locked)return;
      delta+=Math.abs(e.deltaY)>Math.abs(e.deltaX)?e.deltaY:e.deltaX;
      clearTimeout(wheelTimer);wheelTimer=setTimeout(function(){delta=0;},160);
      if(Math.abs(delta)>=28){var direction=delta>0?1:-1;delta=0;move(direction);}
    }
    function key(e) {
      if(/input|textarea|select/i.test(e.target.tagName))return;
      var next=['ArrowRight','ArrowDown','Numpad6','Numpad2'],prev=['ArrowLeft','ArrowUp','Numpad4','Numpad8'];
      if(next.includes(e.key)||next.includes(e.code)){e.preventDefault();move(1);}
      else if(prev.includes(e.key)||prev.includes(e.code)){e.preventDefault();move(-1);}
    }
    function click(e) {
      if(locked)return;
      var step=e.target.closest('[data-deck-step]');if(step){move(Number(step.dataset.deckStep));return;}
      var card=e.target.closest('.wr-deck-card');
      if(card&&options.onOpen)options.onOpen(images,Number(card.dataset.index));
    }
    function down(e){if(e.isPrimary!==false){start={x:e.clientX,y:e.clientY};host.focus({preventScroll:true});}}
    function up(e){if(!start)return;var dx=e.clientX-start.x;start=null;if(Math.abs(dx)>38)move(dx<0?1:-1);}
    host.addEventListener('wheel',wheel,{passive:false});host.addEventListener('keydown',key);host.addEventListener('click',click);host.addEventListener('pointerdown',down);host.addEventListener('pointerup',up);
    render();
    return {move:move,setIndex:function(i){index=Math.max(0,Math.min(images.length-1,i));render();},getIndex:function(){return index;},destroy:function(){disposed=true;clearTimeout(timer);clearTimeout(wheelTimer);host.removeEventListener('wheel',wheel);host.removeEventListener('keydown',key);host.removeEventListener('click',click);host.removeEventListener('pointerdown',down);host.removeEventListener('pointerup',up);}};
  }
  window.SoilWorkImageDeck={mount:mount};
})();
