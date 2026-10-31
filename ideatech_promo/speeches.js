// 宣伝の台詞。ずんだもん口調（〜なのだ）。
// key    : 音声ファイル名（assets/<key>.wav）。事前生成方式ではこの名前で再生する。
// text   : VOICEVOXで読み上げる文。generate-speech の入力にもなる（下の speeches）。
// balloon: 画面の吹き出し表示。内蔵フォントに無い漢字は豆腐になるので、できるだけ平易に。
// emotion: 話している間の表情。NEUTRAL=0 ANGRY=1 SAD=2 HAPPY=3 SLEEPY=4 DOUBTFUL=5
// after  : 話し終わった直後の表情（省略可）
// gesture: 話している間の首の動き。mod.js の GESTURES の名前（省略時は talk）
// hand   : 話している間の手のアニメーション。'clap' 'rock-paper-scissors' 'thinking'（省略可）
// wink   : true なら話し終わりにウインク（省略可）
//
// 台詞（text）を変えたら、README の手順で assets/*.wav を再生成してから書き込むのだ。
// 動き・表情・手の変更だけなら、MOD の書き込みだけで済む。
// 日時・場所・料金は未確定なので台詞には入れていない。

export const greeting = [
  { key: 'greet1', text: 'そこのキミ、ちょっと待つのだ！', balloon: 'ちょっと待つのだ！', emotion: 3, gesture: 'excited' },
  {
    key: 'greet2',
    text: 'ぼくはずんだもん、アイデアテックの案内ロボなのだ。',
    balloon: 'アイデアテック案内',
    emotion: 3,
    gesture: 'nod',
    wink: true,
  },
]

export const promos = [
  {
    key: 'keyboard',
    lines: [
      {
        key: 'kb1',
        text: 'まずは、キーボード制作体験なのだ！',
        balloon: 'キーボード制作体験',
        emotion: 3,
        gesture: 'excited',
        hand: 'clap',
      },
      { key: 'kb2', text: '自分だけのキーボードを、その場で組み立てられるのだ。', balloon: '自分だけの一台を作ろう', emotion: 3, gesture: 'talk' },
      {
        key: 'kb3',
        text: 'はんだ付けが初めてでも、先輩が教えてくれるから安心なのだ。',
        balloon: '初心者OK！',
        emotion: 3,
        gesture: 'nod',
        wink: true,
      },
    ],
  },
  {
    key: 'gacha',
    lines: [
      {
        key: 'gacha1',
        text: '次は、キーボードアクセサリーのガチャガチャなのだ！',
        balloon: 'アクセサリーガチャ',
        emotion: 3,
        gesture: 'excited',
        hand: 'rock-paper-scissors',
      },
      {
        key: 'gacha2',
        text: 'キーキャップとか、何が出るかはお楽しみなのだ。',
        balloon: '何が出るかな？',
        emotion: 5,
        after: 3,
        gesture: 'think',
        hand: 'thinking',
      },
      { key: 'gacha3', text: 'ぼくはレアなやつが欲しいのだ。', balloon: 'レア出ろ〜！', emotion: 3, gesture: 'hope', wink: true },
    ],
  },
  {
    key: 'game',
    lines: [
      { key: 'game1', text: 'そしてゲーム体験もあるのだ！', balloon: 'ゲーム体験', emotion: 3, gesture: 'excited', hand: 'clap' },
      {
        key: 'game2',
        text: 'みんなで遊べるゲームを用意してるのだ。',
        balloon: 'みんなで遊ぼう',
        emotion: 3,
        gesture: 'talk',
        hand: 'rock-paper-scissors',
      },
      { key: 'game3', text: 'ぼくに勝てたらすごいのだ！', balloon: '勝負なのだ！', emotion: 1, after: 3, gesture: 'proud' },
    ],
  },
]

export const closing = [
  { key: 'close1', text: '三つとも、ぜひ遊びに来てほしいのだ！', balloon: '遊びに来てね！', emotion: 3, gesture: 'nod', hand: 'clap' },
  { key: 'close2', text: 'アイデアテックで待ってるのだ！', balloon: '待ってるのだ！', emotion: 3, gesture: 'excited', wink: true },
]

export const idleMurmurs = [
  { key: 'murmur1', text: '誰か来ないかなぁ、なのだ。', balloon: '…', emotion: 4, gesture: 'glance' },
  { key: 'murmur2', text: 'キーボード、作りたい人いないかなぁ。', balloon: '…', emotion: 5, gesture: 'think', hand: 'thinking' },
]

export const volumePreview = { key: 'volume', text: 'このくらいの音量なのだ。', balloon: 'このくらい？', emotion: 3, gesture: 'nod' }

// key -> text。generate-speech-voicevox が読み込む（これを書き換える必要は無い）
const all = [].concat(greeting, closing, idleMurmurs, [volumePreview])
for (const promo of promos) all.push(...promo.lines)
export const speeches = {}
for (const line of all) speeches[line.key] = line.text
