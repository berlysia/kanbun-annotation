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
    name: '複合返り点（一レ点）',
    description: '一レ点・レ点を組み合わせた複合返り点の例（不可不學＝学ばざるべからず）',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      不<skam:kaeri kind="ichi-re"/>
      <skam:kun okuri="カラ">可</skam:kun>不<skam:kaeri kind="re"/>
      <skam:kun yomi="まな" okuri="バ">學</skam:kun><skam:kutoten value="。" kind="ku"/>
    </skam:block>
  </skam:body>
  <skam:readings>
    <skam:reading kind="kakikudashi">学ばざるべからず。</skam:reading>
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
      此乃<skam:span type="emphasis" style="sesame">天命</skam:span>也<skam:kutoten value="。" kind="ku"/>
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
      學<skam:ref xml:id="n1" format="numeric-bracket"/>而時
      <skam:kun okuri="ニ">之</skam:kun><skam:kaeri kind="re"/>
      <skam:kun okuri="フ">習</skam:kun><skam:kutoten value="。" kind="ku"/>
    </skam:block>
  </skam:body>
  <skam:notes>
    <skam:note ref="n1">「學」は目的を持って学ぶの意。</skam:note>
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
      <skam:span type="highlight" style="solid" ref="ref-a"><skam:kun yomi="まな" okuri="ビテ">學</skam:kun>而<skam:ref xml:id="ref-a" format="alpha-upper"/></skam:span>
      <skam:kun okuri="ニ">時</skam:kun>
      <skam:kun okuri="フ">習</skam:kun>
      <skam:span type="highlight" style="solid" ref="ref-b"><skam:kun soe="ヲ">之</skam:kun><skam:kaeri kind="re"/><skam:ref xml:id="ref-b" format="alpha-upper"/></skam:span><skam:kutoten value="。" kind="ku"/>
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
      <skam:span type="highlight" style="solid">實線</skam:span>
      <skam:span type="highlight" style="wavy">波線</skam:span>
      <skam:span type="highlight" style="double">二重線</skam:span>
      <skam:span type="highlight" style="dotted">點線</skam:span>
      <skam:span type="highlight" style="dashed">破線</skam:span>
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
      <skam:span type="highlight" style="solid" ref="ref-a">實線<skam:ref xml:id="ref-a" format="alpha-upper"/></skam:span>
      <skam:span type="highlight" style="wavy" ref="ref-b">波線<skam:ref xml:id="ref-b" format="alpha-upper"/></skam:span>
      <skam:span type="highlight" style="double" ref="ref-c">二重線<skam:ref xml:id="ref-c" format="alpha-upper"/></skam:span>
      <skam:span type="highlight" style="dotted" ref="ref-d">點線<skam:ref xml:id="ref-d" format="alpha-upper"/></skam:span>
      <skam:span type="highlight" style="dashed" ref="ref-e">破線<skam:ref xml:id="ref-e" format="alpha-upper"/></skam:span>
    </skam:block>
  </skam:body>
</skam:doc>`,
  },
  {
    name: 'ラベル（フォーマット一覧）',
    description:
      'ラベルの各フォーマット（大文字・小文字・数字・丸数字・イロハ・五十音・漢数字）の例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      <skam:span type="highlight" style="solid" ref="ref-1">大文字<skam:ref xml:id="ref-1" format="alpha-upper"/></skam:span>
      <skam:span type="highlight" style="solid" ref="ref-2">小文字<skam:ref xml:id="ref-2" format="alpha-lower"/></skam:span>
      <skam:span type="highlight" style="solid" ref="ref-3">數字<skam:ref xml:id="ref-3" format="numeric-paren"/></skam:span>
      <skam:span type="highlight" style="solid" ref="ref-4">丸數字<skam:ref xml:id="ref-4" format="numeric-circled"/></skam:span>
      <skam:span type="highlight" style="solid" ref="ref-5">イロハ<skam:ref xml:id="ref-5" format="iroha-katakana"/></skam:span>
      <skam:span type="highlight" style="solid" ref="ref-6">いろは<skam:ref xml:id="ref-6" format="iroha-hiragana"/></skam:span>
      <skam:span type="highlight" style="solid" ref="ref-7">アイウ<skam:ref xml:id="ref-7" format="gojuon-katakana"/></skam:span>
      <skam:span type="highlight" style="solid" ref="ref-8">あいう<skam:ref xml:id="ref-8" format="gojuon-hiragana"/></skam:span>
      <skam:span type="highlight" style="solid" ref="ref-9">漢數字<skam:ref xml:id="ref-9" format="kanji-numeric"/></skam:span>
    </skam:block>
  </skam:body>
</skam:doc>`,
  },
  {
    name: '天無口（使役・レ点と一二点）',
    description: '使役表現「使人言」とレ点・一二点の組み合わせ例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1">
  <skam:meta>
    <skam:tokenize strategy="char"/>
  </skam:meta>
  <skam:body>
    <skam:block><skam:kun okuri="ニ">天</skam:kun><skam:kun okuri="シ">無</skam:kun><skam:kaeri kind="re"/>口、<skam:kun okuri="ム">使</skam:kun><skam:kaeri kind="ni"/><skam:kun okuri="ヲシテ">人</skam:kun><skam:kun okuri="ハ">言</skam:kun><skam:kaeri kind="ichi"/>。</skam:block>
  </skam:body>
  <skam:readings>
    <skam:reading kind="kakikudashi">天に口無し、人をして言はしむ。</skam:reading>
  </skam:readings>
</skam:doc>`,
  },
  {
    name: '春曉（五言絶句）',
    description: '孟浩然の五言絶句「春曉」の訓読例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <skam:block>
      春眠不<skam:kaeri kind="re"/><skam:kun yomi="おぼ" okuri="エ">覺</skam:kun><skam:kaeri kind="re"/><skam:kun soe="ヲ" yomi="あかつき">曉</skam:kun>
    </skam:block>
    <skam:block>
      處處<skam:kun yomi="き" okuri="ク">聞</skam:kun><skam:kaeri kind="ni"/><skam:kun yomi="ていてう" soe="ヲ">啼鳥</skam:kun><skam:kaeri kind="ichi"/>
    </skam:block>
    <skam:block>
      夜來<skam:kun soe="ノ">風雨</skam:kun>聲
    </skam:block>
    <skam:block>
      花<skam:kun yomi="お" okuri="ツルコト">落</skam:kun><skam:kun yomi="し" okuri="ル">知</skam:kun><skam:kun soe="ゾ">多少</skam:kun>
    </skam:block>
  </skam:body>
  <skam:readings>
    <skam:reading kind="kakikudashi">春眠暁を覚えず、処処啼鳥を聞く。夜来風雨の声、花落つること知る多少ぞ。</skam:reading>
  </skam:readings>
</skam:doc>`,
  },
  {
    name: '傍点＋傍線（配置順確認）',
    description: '傍点と傍線の共存パターン全12種。配置順序（外→内: 傍点→傍線→ルビ→本文）の確認用',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:body>
    <!-- 1. solid + bare -->
    <skam:block><skam:span type="highlight" style="solid"><skam:span type="emphasis" style="sesame">天</skam:span></skam:span></skam:block>
    <!-- 2. solid + ruby -->
    <skam:block><skam:span type="highlight" style="solid"><skam:span type="emphasis" style="sesame"><skam:kun yomi="まな">學</skam:kun></skam:span></skam:span></skam:block>
    <!-- 3. solid + okuri -->
    <skam:block><skam:span type="highlight" style="solid"><skam:span type="emphasis" style="sesame"><skam:kun okuri="ビテ">學</skam:kun></skam:span></skam:span></skam:block>
    <!-- 4. solid + ruby + okuri -->
    <skam:block><skam:span type="highlight" style="solid"><skam:span type="emphasis" style="sesame"><skam:kun yomi="まな" okuri="ビテ">學</skam:kun></skam:span></skam:span>而</skam:block>
    <!-- 5. wavy + bare -->
    <skam:block><skam:span type="highlight" style="wavy"><skam:span type="emphasis" style="sesame">地</skam:span></skam:span></skam:block>
    <!-- 6. wavy + ruby -->
    <skam:block><skam:span type="highlight" style="wavy"><skam:span type="emphasis" style="sesame"><skam:kun yomi="まな">學</skam:kun></skam:span></skam:span></skam:block>
    <!-- 7. dotted + bare -->
    <skam:block><skam:span type="highlight" style="dotted"><skam:span type="emphasis" style="sesame">人</skam:span></skam:span></skam:block>
    <!-- 8. dotted + ruby -->
    <skam:block><skam:span type="highlight" style="dotted"><skam:span type="emphasis" style="sesame"><skam:kun yomi="まな">學</skam:kun></skam:span></skam:span></skam:block>
    <!-- 9. dashed + bare -->
    <skam:block><skam:span type="highlight" style="dashed"><skam:span type="emphasis" style="sesame">山</skam:span></skam:span></skam:block>
    <!-- 10. dashed + ruby -->
    <skam:block><skam:span type="highlight" style="dashed"><skam:span type="emphasis" style="sesame"><skam:kun yomi="まな">學</skam:kun></skam:span></skam:span></skam:block>
    <!-- 11. solid + multi-token (ruby + okuri) -->
    <skam:block><skam:span type="highlight" style="solid"><skam:span type="emphasis" style="sesame"><skam:kun yomi="まな" okuri="ビテ">學</skam:kun>而</skam:span></skam:span></skam:block>
    <!-- 12. multi-token emphasis > (highlight + highlight) -->
    <skam:block><skam:span type="emphasis" style="sesame"><skam:span type="highlight" style="solid"><skam:kun yomi="まな" okuri="ビテ">學</skam:kun></skam:span><skam:span type="highlight" style="solid">而</skam:span></skam:span></skam:block>
    <!-- 13. multi-token emphasis > (highlight + bare) -->
    <skam:block><skam:span type="emphasis" style="sesame"><skam:span type="highlight" style="solid"><skam:kun yomi="まな" okuri="ビテ">學</skam:kun></skam:span>而</skam:span></skam:block>
    <!-- 14. solid + multi-token tateten (ruby) -->
    <skam:block><skam:span type="highlight" style="solid"><skam:span type="emphasis" style="sesame"><skam:tateten><skam:kun yomi="まな">學</skam:kun>而</skam:tateten></skam:span></skam:span></skam:block>
  </skam:body>
</skam:doc>`,
  },
  {
    name: '全要素総合（ヲコト点除く）',
    description:
      '再読文字・返り点・送り仮名・読み仮名・添え仮名・置字・助字・句読点・たて点・傍点・傍線・注釈の全要素を含むレイアウト確認用総合例',
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<skam:doc xmlns:skam="urn:skam:1" xml:lang="ja">
  <skam:meta>
    <skam:tokenize strategy="char"/>
  </skam:meta>
  <skam:body>
    <skam:block>
      <skam:saidoku>
        <skam:base>須</skam:base>
        <skam:kunform n="1" yomi="すべから" okuri="ク"/>
        <skam:kunform n="2" okuri="ベシ"/>
      </skam:saidoku>
      <skam:kun okuri="ル">知</skam:kun><skam:kaeri kind="ni"/>
      <skam:span type="emphasis" style="sesame"><skam:tateten><skam:kun yomi="てんか">天下</skam:kun></skam:tateten></skam:span>
      之
      <skam:tateten><skam:kun yomi="だいじ" soe="ヲ">大事</skam:kun></skam:tateten><skam:kaeri kind="ichi"/>
      <skam:kutoten value="。" kind="ku"/>
    </skam:block>
    <skam:block>
      <skam:span type="highlight" style="wavy" ref="ref-a">
        <skam:kun okuri="ビテ">學</skam:kun><skam:okimoji>而</skam:okimoji>
        <skam:ref xml:id="ref-a" format="alpha-upper"/>
      </skam:span>
      <skam:kun okuri="レバ">不</skam:kun><skam:kaeri kind="re"/>
      <skam:kun okuri="ハ">思</skam:kun>
      <skam:kun okuri="チ">則</skam:kun>
      <skam:span type="emphasis" style="sesame">
        <skam:kun yomi="くら" okuri="シ">罔</skam:kun>
      </skam:span>
      <skam:joji>矣</skam:joji>
      <skam:kutoten value="。" kind="ku"/>
    </skam:block>
  </skam:body>
  <skam:readings>
    <skam:reading kind="kakikudashi">須く天下の大事を知るべし。学びて思はざれば則ち罔し。</skam:reading>
  </skam:readings>
</skam:doc>`,
  },
];
