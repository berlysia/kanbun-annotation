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
      <skam:kun yomi="まな" okuri="ビテ">學</skam:kun>而
      <skam:kun okuri="ニ">時</skam:kun>
      <skam:kun okuri="フ">習</skam:kun>
      <skam:kun soe="ヲ">之</skam:kun><skam:kaeri kind="re"/><skam:kutoten value="。" kind="ku"/>
    </skam:block>
  </skam:body>
  <skam:readings>
    <skam:reading kind="kakikudashi">学びて時に之を習ふ。</skam:reading>
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
      <skam:kun yomi="まな" okuri="ビテ">學</skam:kun>而
      <skam:kun okuri="ニ">時</skam:kun>
      <skam:kun okuri="フ">習</skam:kun>
      <skam:kun soe="ヲ">之</skam:kun><skam:kaeri kind="re"/><skam:kutoten value="。" kind="ku"/>
    </skam:block>
    <skam:block>
      不亦<skam:kun yomi="よろこ" okuri="バ">説</skam:kun>乎<skam:kutoten value="。" kind="ku"/>
    </skam:block>
    <skam:block>
      有朋自遠方來<skam:kutoten value="、" kind="ten"/>
      不亦<skam:kun yomi="たの" okuri="シ">樂</skam:kun>乎<skam:kutoten value="。" kind="ku"/>
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
        <skam:kunform n="1" yomi="まさ" okuri="ニ"/>
        <skam:kunform n="2" okuri="ス"/>
      </skam:saidoku>
      <skam:kun yomi="し" okuri="ナント">死</skam:kun>
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
      <skam:kun okuri="ス">以</skam:kun><skam:kaeri kind="ge"/>
      <skam:kun okuri="ヲ">子</skam:kun><skam:kaeri kind="ichi"/>
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
    name: '添え仮名（を）',
    description: '添え仮名（テニヲハ）を含む例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      學而
      <skam:kun okuri="ニ">時</skam:kun>
      <skam:kun okuri="フ">習</skam:kun>
      <skam:kun soe="ヲ">之</skam:kun><skam:kaeri kind="re"/><skam:kutoten value="。" kind="ku"/>
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
      <skam:kun okuri="ニ">之</skam:kun><skam:kaeri kind="re"/>
      <skam:kun okuri="フ">習</skam:kun><skam:kutoten value="。" kind="ku"/>
    </skam:block>
  </skam:body>
  <skam:notes>
    <skam:note id="n1">「學」は目的を持って学ぶの意。</skam:note>
  </skam:notes>
</skam:doc>`,
  },
  {
    name: '傍線（試験問題形式）',
    description: '傍線部とラベルを組み合わせた試験問題形式の例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:underline group="a"><skam:kun yomi="まな" okuri="ビテ">學</skam:kun>而<skam:label value="a" format="alpha-upper" group="a"/></skam:underline>
      <skam:kun okuri="ニ">時</skam:kun>
      <skam:kun okuri="フ">習</skam:kun>
      <skam:underline group="b"><skam:kun soe="ヲ">之</skam:kun><skam:kaeri kind="re"/><skam:label value="b" format="alpha-upper" group="b"/></skam:underline><skam:kutoten value="。" kind="ku"/>
    </skam:block>
  </skam:body>
  <skam:readings>
    <skam:reading kind="kakikudashi">学びて時に之を習ふ。</skam:reading>
  </skam:readings>
</skam:doc>`,
  },
  {
    name: '傍線（スタイル一覧）',
    description: '傍線の各スタイル（実線・波線・二重線・点線・破線）の例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:underline style="solid">實線</skam:underline>
      <skam:underline style="wavy">波線</skam:underline>
      <skam:underline style="double">二重線</skam:underline>
      <skam:underline style="dotted">點線</skam:underline>
      <skam:underline style="dashed">破線</skam:underline>
    </skam:block>
  </skam:body>
</skam:doc>`,
  },
  {
    name: '傍線＋ラベル（全スタイル）',
    description: '傍線の全スタイルとラベルの組み合わせ例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:underline style="solid" group="a">實線<skam:label value="a" format="alpha-upper" group="a"/></skam:underline>
      <skam:underline style="wavy" group="b">波線<skam:label value="b" format="alpha-upper" group="b"/></skam:underline>
      <skam:underline style="double" group="c">二重線<skam:label value="c" format="alpha-upper" group="c"/></skam:underline>
      <skam:underline style="dotted" group="d">點線<skam:label value="d" format="alpha-upper" group="d"/></skam:underline>
      <skam:underline style="dashed" group="e">破線<skam:label value="e" format="alpha-upper" group="e"/></skam:underline>
    </skam:block>
  </skam:body>
</skam:doc>`,
  },
  {
    name: 'ラベル（フォーマット一覧）',
    description: 'ラベルの各フォーマット（大文字・小文字・数字・丸数字・イロハ・五十音・漢数字）の例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:underline group="1">大文字<skam:label value="1" format="alpha-upper" group="1"/></skam:underline>
      <skam:underline group="2">小文字<skam:label value="2" format="alpha-lower" group="2"/></skam:underline>
      <skam:underline group="3">數字<skam:label value="3" format="numeric" group="3"/></skam:underline>
      <skam:underline group="4">丸數字<skam:label value="4" format="circled" group="4"/></skam:underline>
      <skam:underline group="5">イロハ<skam:label value="5" format="iroha" group="5"/></skam:underline>
      <skam:underline group="6">いろは<skam:label value="6" format="iroha-hiragana" group="6"/></skam:underline>
      <skam:underline group="7">アイウ<skam:label value="7" format="gojuon" group="7"/></skam:underline>
      <skam:underline group="8">あいう<skam:label value="8" format="gojuon-hiragana" group="8"/></skam:underline>
      <skam:underline group="9">漢數字<skam:label value="9" format="kanji-numeric" group="9"/></skam:underline>
    </skam:block>
  </skam:body>
</skam:doc>`,
  },
  {
    name: '春曉（五言絶句）',
    description: '孟浩然の五言絶句「春曉」の訓読例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      春眠不<skam:kaeri kind="re"/><skam:kun yomi="おぼ" okuri="エ">覺</skam:kun><skam:kun soe="ヲ" yomi="あかつき">曉</skam:kun>
    </skam:block>
    <skam:block>
      處處<skam:kun yomi="き" okuri="ク">聞</skam:kun><skam:kun yomi="ていてう" soe="ヲ">啼鳥</skam:kun><skam:kaeri kind="re"/>
    </skam:block>
    <skam:block>
      夜來<skam:kun soe="ノ">風雨</skam:kun>聲
    </skam:block>
    <skam:block>
      花<skam:kun yomi="お" okuri="ツルコト">落</skam:kun><skam:kun yomi="し" okuri="ル">知</skam:kun><skam:kaeri kind="re"/><skam:kun soe="ゾ">多少</skam:kun>
    </skam:block>
  </skam:body>
  <skam:readings>
    <skam:reading kind="kakikudashi">春眠暁を覚えず、処処啼鳥を聞く。夜来風雨の声、花落つること知る多少ぞ。</skam:reading>
  </skam:readings>
</skam:doc>`,
  },
];
