  // A different company is not necessarily an error. Repair only reviewed
  // typo pairs or unknown names, with a unique result/city/task directory row.
  function unknownUnit(value) {
    return /^(?:|[-—–/?？]+|未(?:标明|注明|明确|知|明|分类|识别)(?:公司|单位|作业单位)?|(?:公司|单位)(?:未明|不详)|不详|未知公司|未知单位|暂无)$/.test(normalize(value).replace(/[\s（）()]/g,''));
  }
  function oneEdit(a,b) {
    if(a===b || Math.abs(a.length-b.length)>1)return false;
    var i=0,j=0,n=0;
    while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++n>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}
    return n+(a.length-i)+(b.length-j)===1;
  }
  function unitEvidence(key,city,district,value) {
    var check=directoryStatus(key,city,value,district),listed=check.listedUnits;
    var result={action:'keep',unit:value||'',originalUnit:value||'',reason:check.message,listedUnits:listed};
    if(listed.length!==1)return result;
    var target=listed[0],old=companyForm(value),full=companyForm(target);
    if(unknownUnit(value)){result.action='fill';result.unit=target;result.reason='该成果、该市及任务单元在原通讯录中唯一对应；补齐未明单位。';return result;}
    if(unitMatches(target,value)){result.reason='与该类成果通讯录一致。';return result;}
    var known=unique([].concat.apply([],companyNames().map(unitForms)));
    if(old.length<10 || full.length<10 || /[\/＋+]/.test(target) || known.includes(old) || !/(?:公司|研究所|研究院|大学|中心|大队)$/.test(target) || !oneEdit(old,full))return result;
    var reviewedTypoPairs={'中地科动察设计有限公司':'中地科勘察设计有限公司'};
    if(companyForm(reviewedTypoPairs[normalize(value)]||'')!==full)return result;
    var near=known.filter(function(n){return oneEdit(old,n);});
    if(near.length!==1 || near[0]!==full)return result;
    result.action='typo';result.unit=target;result.reason='已核实的单位错字对，且原通讯录按成果及地区唯一对应；不以字符串相似度替换其他真实单位。';return result;
  }

