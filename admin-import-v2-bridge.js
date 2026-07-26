(function(){
  'use strict';
  var Q=window.SoilAdminImport;
  if(!Q)return;
  var snapshot=[];
  function clone(item){return{path:item.path,sourcePath:item.sourcePath||item.path,batch:item.batch||'',city:item.city||'',unit:item.unit||'',district:item.district||''}}
  document.addEventListener('click',function(event){
    var button=event.target&&event.target.closest&&event.target.closest('#adm-ok');
    if(!button||!Q.state)return;
    if(button.dataset.splitV2==='1'&&snapshot.length){
      var map={};snapshot.forEach(function(item){map[item.path]=item});
      Q.state.files=(Q.state.files||[]).map(function(item){
        var source=map[item.from||item.path]||map[item.path]||{};
        return{
          file:item.file,
          path:item.path,
          sourcePath:source.sourcePath||item.from||item.path,
          batch:source.batch||item.batch||'管理员导入',
          city:source.city||item.city||'',
          unit:source.unit||item.unit||'',
          district:source.district||item.district||'',
          from:item.from||''
        };
      });
      if(typeof Q.renderPreview==='function')Q.renderPreview();
      return;
    }
    snapshot=(Q.state.files||[]).map(clone);
  },true);
})();