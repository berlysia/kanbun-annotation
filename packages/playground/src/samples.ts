/**
 * Playgroundで使用するサンプルXML
 */

export interface Sample {
  name: string;
  description: string;
  xml: string;
}

export const SAMPLES: Sample[] = [
  {
    name: '學而時習之（基本）',
    description: '送り仮名・読み仮名・返り点の基本例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:kun reading="まな" okuri="びて">學</skam:kun>而時
      <skam:kun okuri="に">之</skam:kun><skam:kaeri kind="re"/>
      <skam:kun okuri="ふ">習</skam:kun><skam:kutoten value="。" kind="ku"/>
    </skam:block>
  </skam:body>
  <skam:readings>
    <skam:reading kind="kakikudashi">学びて時にこれを習ふ。</skam:reading>
  </skam:readings>
</skam:doc>`,
  },
  {
    name: '論語（複数ブロック）',
    description: '複数のブロックを含む例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:kun reading="まな" okuri="びて">學</skam:kun>而時
      <skam:kun okuri="に">之</skam:kun><skam:kaeri kind="re"/>
      <skam:kun okuri="ふ">習</skam:kun><skam:kutoten value="。" kind="ku"/>
    </skam:block>
    <skam:block>
      不亦<skam:kun reading="よろこ" okuri="ば">説</skam:kun>乎<skam:kutoten value="。" kind="ku"/>
    </skam:block>
    <skam:block>
      有朋自遠方來<skam:kutoten value="、" kind="ten"/>
      不亦<skam:kun reading="たの" okuri="し">樂</skam:kun>乎<skam:kutoten value="。" kind="ku"/>
    </skam:block>
  </skam:body>
  <skam:readings>
    <skam:reading kind="kakikudashi">学びて時にこれを習ふ。亦説ばしからずや。朋有り遠方より来たる、亦楽しからずや。</skam:reading>
  </skam:readings>
</skam:doc>`,
  },
  {
    name: '再読文字（將死）',
    description: '再読文字「將」を含む例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:saidoku>
        <skam:base>將</skam:base>
        <skam:kunform n="1" reading="まさ" okuri="に"/>
        <skam:kunform n="2" okuri="す"/>
      </skam:saidoku>
      <skam:kun reading="し" okuri="なんと">死</skam:kun>
    </skam:block>
  </skam:body>
  <skam:readings>
    <skam:reading kind="yomiage">まさに しなんとす</skam:reading>
  </skam:readings>
</skam:doc>`,
  },
  {
    name: '返り点（一二点・上下点）',
    description: '複数種類の返り点を含む例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      我<skam:kaeri kind="ni"/>
      <skam:kun okuri="す">以</skam:kun><skam:kaeri kind="ge"/>
      <skam:kun okuri="を">子</skam:kun><skam:kaeri kind="ichi"/>
      爲<skam:kaeri kind="jo"/>師<skam:kutoten value="。" kind="ku"/>
    </skam:block>
  </skam:body>
  <skam:readings>
    <skam:reading kind="kakikudashi">我は子を以て師と為す。</skam:reading>
  </skam:readings>
</skam:doc>`,
  },
  {
    name: 'たて点（熟語）',
    description: '熟語境界を示すたて点の例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:tateten>國家</skam:tateten>之大事<skam:kutoten value="。" kind="ku"/>
    </skam:block>
  </skam:body>
  <skam:readings>
    <skam:reading kind="kakikudashi">国家の大事。</skam:reading>
  </skam:readings>
</skam:doc>`,
  },
  {
    name: '助字（ヲ）',
    description: '助字を含む例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      學而時
      <skam:kun okuri="に">之</skam:kun><skam:kaeri kind="re"/>
      <skam:okiji>を</skam:okiji>
      <skam:kun okuri="ふ">習</skam:kun><skam:kutoten value="。" kind="ku"/>
    </skam:block>
  </skam:body>
</skam:doc>`,
  },
  {
    name: 'ヲコト点',
    description: 'ヲコト点（グリッド座標）の例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:okototen grid="5x5" x="4" y="4" shape="dot" sound="り">國</skam:okototen>
      <skam:okototen grid="5x5" x="0" y="0" shape="dot" sound="は" color="red">家</skam:okototen>
    </skam:block>
  </skam:body>
</skam:doc>`,
  },
  {
    name: '傍点（強調）',
    description: '傍点による強調の例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      此乃<skam:span type="emphasis" kind="dot">天命</skam:span>也<skam:kutoten value="。" kind="ku"/>
    </skam:block>
  </skam:body>
  <skam:readings>
    <skam:reading kind="kakikudashi">此れ乃ち天命なり。</skam:reading>
  </skam:readings>
</skam:doc>`,
  },
  {
    name: '注釈',
    description: '注釈を含む例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      學<skam:ref target="n1"/>而時
      <skam:kun okuri="に">之</skam:kun><skam:kaeri kind="re"/>
      <skam:kun okuri="ふ">習</skam:kun><skam:kutoten value="。" kind="ku"/>
    </skam:block>
  </skam:body>
  <skam:notes>
    <skam:note id="n1">「學」は目的を持って学ぶの意。</skam:note>
  </skam:notes>
</skam:doc>`,
  },
];
