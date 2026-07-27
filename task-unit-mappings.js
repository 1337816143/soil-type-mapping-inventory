(function () {
  'use strict';

  if (window.__soilTaskUnitMappingsInstalled) return;
  window.__soilTaskUnitMappingsInstalled = true;

  function clone(value) {
    return JSON.parse(JSON.stringify(value || []));
  }

  function city(name, items) {
    return {city: name, items: items};
  }

  function item(unit, contact, phone, districts) {
    return {unit: unit, contact: contact || '', phone: phone || '', districts: districts};
  }

  function install() {
    if (!Array.isArray(window.masterList) || typeof window.calculateDashboardStats !== 'function' ||
        typeof window.renderMissingBanner !== 'function') return;

    // 其他成果以当前代码中的清单为底稿，保留此前已经加入的特殊任务单元和匹配修正。
    var otherMasterList = clone(window.masterList);

    // 清单2核对：雄安新区第二标段单位名称应为单个“科技”。
    otherMasterList.forEach(function (entry) {
      if (entry.city !== '雄安新区') return;
      entry.items.forEach(function (work) {
        if (work.unit === '北京世纪国源科技科技股份有限公司' &&
            work.districts.some(function (district) { return district === '雄县' || district === '安新县'; })) {
          work.unit = '北京世纪国源科技股份有限公司';
        }
      });
    });

    // 按用户要求，先复制现有清单，再将土壤类型图的对应关系调整为清单1。
    var soilTypeMasterList = clone(otherMasterList);
    var soilTypeCities = [
      city('石家庄市', [
        item('中地科勘察设计有限公司', '武润林', '18032058823', ['平山县','灵寿县','行唐县','新乐市']),
        item('河北盛图地理信息有限公司', '李辉辉', '13931101730', ['井陉县','井陉矿区','元氏县','赞皇县','高邑县']),
        item('河北图宇科技有限公司', '齐发民', '13933162125', ['无极县','深泽县','晋州市','藁城区']),
        item('河北高翔地理信息技术服务有限公司', '张耀宅', '18034119938', ['合并区','正定县','栾城区','赵县'])
      ]),
      city('秦皇岛市', [
        item('河北省科沃生态科技有限公司 / 河北省地质矿产勘查开发局第四地质大队（河北省海洋地质资源调查中心）', '门杰', '15732202690', ['合并区','抚宁区','昌黎县','卢龙县','青龙县'])
      ]),
      city('保定市', [
        item('河北蓝拓环保科技有限公司', '任月', '17732811257', ['望都县','曲阳县','阜平县','清苑区']),
        item('河北百淼环境科技有限公司', '刘姗姗', '15931875263', ['易县','涿州市','高碑店市','涞水县']),
        item('河北木本水源环保科技有限', '孙焕茹', '17367956046', ['顺平县','唐县','涞源县']),
        item('河北雍荣信息技术服务有限公司', '贾云柱', '15831932013', ['高阳县','蠡县','博野县','安国市']),
        item('河北玛恩农业科技有限公司', '郑涛', '15131288062', ['定兴县','满城区','徐水区','合并区','市级汇总'])
      ]),
      city('承德市', [
        item('河北华勘资环勘测有限公司', '樊彦超', '13931418863', ['承德市','合并区','丰宁县','滦平县']),
        item('河北省地质矿产勘查开发局第四地质大队（河北省水源涵养研究中心）', '布凡', '15231427063', ['隆化县']),
        item('河北平普数政科技有限公司', '韩婷婷', '15032847635', ['宽城县']),
        item('承德神工工程技术服务有限公司', '王维良', '18631432580', ['平泉市','承德县']),
        item('河北云图数字科技有限公司', '杜雨润', '17732254581', ['兴隆县'])
      ]),
      city('邢台市', [
        item('河北普华环境技术服务有限公司', '张士亮', '13513119874', ['临城县','柏乡县','隆尧县']),
        item('天津华勘检验测试有限公司', '何兴晨', '15900302625', ['内丘县','合并区','任泽区','邢台市']),
        item('河北云图数字科技有限公司', '马旭颖', '19861907802', ['信都区','沙河市','南和区']),
        item('河北平普数政科技有限公司', '邱志鹏', '18131153987', ['宁晋县','新河县','南宫市']),
        item('河北雍荣信息技术服务有限公司', '金矿', '15081150799', ['巨鹿县','平乡县','广宗县']),
        item('河北蓝拓环保科技有限公司', '薛玉晨', '15932027817', ['威县','清河县','临西县'])
      ]),
      city('沧州市', [
        item('河北百淼环境科技有限公司', '刘姗姗', '15512257888', ['海兴县','黄骅市']),
        item('河北司南测绘服务有限公司', '吴忠平', '13831706595', ['东光县','吴桥县']),
        item('河北诚秀科技有限公司', '张松', '18332361017', ['泊头市','献县']),
        item('易景科技（天津）股份有限公司', '吴欣甜', '15620520755', ['孟村县','盐山县']),
        item('河北图宇科技有限公司', '李欢欢', '15373417822', ['河间市','任丘市','肃宁县']),
        item('沧州华江工程勘察设计有限公司', '邢俊杰', '13833974144', ['沧州市','合并区','沧县','青县'])
      ]),
      city('定州市', [
        item('河北农业大学', '王红', '13933269201', ['定州市'])
      ]),
      city('雄安新区', [
        item('北京世纪国源科技股份有限公司', '', '', ['雄安新区'])
      ]),
      city('唐山市', [
        item('河北地矿勘测设计有限公司（牵头人） / 河北平普数政科技有限公司', '徐振 / 张蜇', '18131160095 / 13673215867', ['丰润区','遵化市','迁西县','迁安市','玉田县']),
        item('农业农村部环境保护科研监测所（牵头人） / 山东省物化探勘查院', '刘增玮 / 孙东旭', '18622130710 / 15666080733', ['合并区','滦南县','乐亭县','丰南区','曹妃甸区','唐山市'])
      ]),
      city('廊坊市', [
        item('河北聚浩测绘技术服务有限公司', '巩美莲', '15076653400', ['廊坊市','广阳区','安次区']),
        item('河北省坤正地质勘查技术服务有限公司', '陈桦楠', '13273615425', ['三河市','大厂县','香河县']),
        item('河北云图数字科技有限公司', '高继光', '17732166795', ['固安县','霸州市']),
        item('河北平普数政科技有限公司', '代景顺', '17610972180', ['文安县','大城县'])
      ]),
      city('衡水市', [
        item('爬山虎科技股份有限公司', '雷庆洋', '17638767714', ['桃城区','冀州区']),
        item('河北惠之纳农业科技有限公司', '冯旭', '15831570151', ['衡水市','武邑县']),
        item('河北万山信息技术有限公司', '王建奎', '15531897008', ['安平县','饶阳县']),
        item('北京世纪国源科技股份有限公司', '王晨', '15176962685', ['深州市','武强县']),
        item('河北冠卓检测科技股份有限公司', '张敬轩', '13780319792', ['阜城县','景县']),
        item('河北鸿源润泽土地规划设计有限公司', '冯万忠', '15127260310', ['枣强县','故城县'])
      ]),
      city('邯郸市', [
        item('河北向力规划设计有限公司', '赵存维', '13785036135', ['邯郸市','邯山区','肥乡区']),
        item('河北冠卓检测科技股份有限公司', '张敬轩', '13780319792', ['大名县','馆陶县','邱县']),
        item('河北鑫发地理信息工程有限公司', '杨晓磊', '18931001863', ['魏县','成安县','广平县']),
        item('河北九华勘查测绘有限责任公司', '张东', '15176926292', ['涉县','磁县','临漳县']),
        item('中国煤炭地质总局物测队', '徐红利', '13831993117', ['武安市','鸡泽县','曲周县'])
      ]),
      city('张家口市', [
        item('河北蓝拓环保科技有限公司', '陈娟', '13103290365', ['张家口市','合并区','阳原县','沽源县','尚义县']),
        item('北京创时空科技发展有限公司', '李仕漪', '18611622944', ['涿鹿县','怀来县']),
        item('河北科创土地规划技术服务有限公司', '张克红', '18617782365', ['万全区','张北县']),
        item('河北卓远地理信息系统工程服务有限公司', '刑利红', '0313-4111266', ['宣化区','蔚县','怀安县']),
        item('河北堃成测绘服务有限公司', '王翠', '18032880850', ['赤城县','崇礼区','康保县'])
      ]),
      city('辛集市', [
        item('石家庄师兄弟土地环境技术服务有限公司', '王蕾', '15931671221', ['辛集市'])
      ])
    ];

    var byCity = {};
    soilTypeCities.forEach(function (entry) { byCity[entry.city] = entry; });
    soilTypeMasterList = soilTypeMasterList.map(function (entry) {
      return byCity[entry.city] ? clone(byCity[entry.city]) : entry;
    });
    soilTypeCities.forEach(function (entry) {
      if (!soilTypeMasterList.some(function (current) { return current.city === entry.city; })) {
        soilTypeMasterList.push(clone(entry));
      }
    });

    window.SoilTaskUnitLists = {
      soilType: soilTypeMasterList,
      other: otherMasterList
    };

    function listFor(dataKey) {
      return dataKey === 'soilType' ? soilTypeMasterList : otherMasterList;
    }

    function withList(dataKey, callback, context, args) {
      var previous = window.masterList;
      window.masterList = listFor(dataKey);
      try {
        return callback.apply(context, args || []);
      } finally {
        window.masterList = previous;
      }
    }

    var originalCalculateDashboardStats = window.calculateDashboardStats;
    window.calculateDashboardStats = function (dataKey) {
      return withList(dataKey, originalCalculateDashboardStats, this, arguments);
    };

    var originalRenderMissingBanner = window.renderMissingBanner;
    window.renderMissingBanner = function (dataKey) {
      return withList(dataKey, originalRenderMissingBanner, this, arguments);
    };

    // 页面其他位置继续默认使用清单2；土壤类型图仅在统计和缺失比对时切换清单1。
    window.masterList = otherMasterList;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
