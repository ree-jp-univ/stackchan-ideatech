import Timer from 'timer'
import { closing, greeting, idleMurmurs, promos, volumePreview } from 'speeches'

// --- チューニング用の値 ----------------------------------------------------
const SPEAKER_ID = 3 // VOICEVOX: ずんだもん ノーマル（1=あまあま 7=ツンツン）
const FRAME_WIDTH = 160
const FRAME_HEIGHT = 120
const SAMPLE_STEP = 8 // 何ピクセルおきに輝度を拾うか
const POLL_MS = 600 // 人検知の間隔
const PIXEL_DIFF = 18 // この輝度差を超えたら「変化した」とみなす
const TRIGGER_RATIO = 0.06 // 変化した画素がこの割合を超えたら「動きあり」
const SETTLE_MS = 1500 // 発話・首振り後、揺れが収まるまで検知しない時間
const ABSENT_MS = 8000 // 案内が終わってからこの時間ずっと動きが無ければ立ち去ったとみなして静かになる（動きがあれば喋り続ける）
const MURMUR_MS = 45000 // 無人時のひとりごと間隔
// 首振り（人の方を向く）。lookAt は x=前方・y=左・z=上 [m]
const LOOK_X = 0.5 // 注視点までの距離
const TRACK_GAIN_Y = 0.5 // 動きの横位置のズレ(±0.5)に対する首振り量。大きいほど大きく振る
const TRACK_GAIN_Z = 0.4 // 同じく縦方向
const TRACK_FLIP_Y = 1 // 実機で追従方向が左右逆だったら -1
const TRACK_DEADBAND = 0.12 // 画面中央からこの割合以内なら首を動かさない（細かい動きを避ける）
const AIM_SETTLE_MS = 800 // 首を動かした後、画像が落ち着くまで検知しない時間
const AIM_Y_MAX = 0.45
const AIM_Z_MIN = -0.05
const AIM_Z_MAX = 0.25
// 話している間の首の動き。[ヨー(左+) , ピッチ(上+) , 保持ms] のコマを順に繰り返す。値は注視点のずれ[m]（0.1 ≒ 10度）
// M5StackChan の首はヨーとピッチだけ（首をかしげる動きは無い）。ピッチは 5〜85度 の範囲に制限される
const GESTURE_SCALE = 2 // 首の動き全体の大きさの倍率。大きいほど大きく振る（1 が元の大きさ）
const GESTURES = {
  talk: [[0.05, 0.02, 800], [-0.05, 0.02, 800]], // ゆっくり左右に揺れる
  nod: [[0, -0.1, 350], [0, 0.02, 450], [0.04, 0, 400], [-0.04, 0, 400]], // うなずいてから少し揺れる
  excited: [[0.06, 0.08, 300], [-0.06, -0.02, 300], [0.06, 0.08, 300], [-0.06, -0.02, 300]], // 弾むように
  shake: [[0.12, 0, 300], [-0.12, 0, 300]], // いやいや
  think: [[0.12, 0.1, 900], [0.1, 0.12, 600]], // 斜め上を見て考える
  hope: [[0, 0.14, 700], [0.04, 0.12, 400], [-0.04, 0.12, 400]], // 上を見て願う
  proud: [[0, 0.12, 900], [0, -0.06, 500]], // 胸を張ってから前のめり
  glance: [[0.2, 0, 900], [-0.2, 0, 1100], [0, 0.04, 600]], // きょろきょろ
}
const VOLUME_LEVELS = [
  { label: 'ちいさい', value: 0.15 },
  { label: 'やや小', value: 0.3 },
  { label: 'ふつう', value: 0.5 },
  { label: 'やや大', value: 0.75 },
  { label: 'おおきい', value: 1 },
]
// -------------------------------------------------------------------------

const GRID_W = Math.floor(FRAME_WIDTH / SAMPLE_STEP)
const GRID_H = Math.floor(FRAME_HEIGHT / SAMPLE_STEP)
const GRID = GRID_W * GRID_H

/** rgb565le のフレームから間引いた輝度グリッドを作る */
function sampleLuma(frame) {
  const pixels = new Uint16Array(frame.buffer)
  const luma = new Uint8Array(GRID)
  let i = 0
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const v = pixels[gy * SAMPLE_STEP * frame.width + gx * SAMPLE_STEP]
      const r = ((v >> 11) & 31) << 3
      const g = ((v >> 5) & 63) << 2
      const b = (v & 31) << 3
      luma[i++] = (r * 77 + g * 150 + b * 29) >> 8
    }
  }
  return luma
}

/** 画素ごとの輝度差の中央値。人が大きく映っても背景側の全体変化だけを拾える（平均だと人に引っ張られる） */
function medianShift(prev, cur) {
  const hist = new Uint16Array(511)
  for (let i = 0; i < GRID; i++) hist[cur[i] - prev[i] + 255]++
  let acc = 0
  for (let d = 0; d < 511; d++) {
    acc += hist[d]
    if (acc * 2 >= GRID) return d - 255
  }
  return 0
}

/**
 * 前フレームとの差分を解析する。全体の明るさ変化（自動露出）は中央値を引いて打ち消す。
 * ratio: 変化した画素の割合 / cx: 変化の重心の横位置(0=画像左端..1=右端) / top: 変化が現れた最上段(0=上端..1=下端、頭の位置の目安)
 */
function analyzeMotion(prev, cur) {
  const offset = medianShift(prev, cur)
  let changed = 0
  let sumX = 0
  let topRow = -1
  for (let gy = 0; gy < GRID_H; gy++) {
    let rowCount = 0
    for (let gx = 0; gx < GRID_W; gx++) {
      const i = gy * GRID_W + gx
      if (Math.abs(cur[i] - prev[i] - offset) > PIXEL_DIFF) {
        changed++
        rowCount++
        sumX += gx
      }
    }
    if (topRow < 0 && rowCount >= 2) topRow = gy // 1画素だけの孤立ノイズは頭とみなさない
  }
  return {
    ratio: changed / GRID,
    cx: changed > 0 ? (sumX / changed + 0.5) / GRID_W : 0.5,
    top: topRow < 0 ? 0.5 : topRow / GRID_H,
  }
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

function sleep(ms) {
  return new Promise((resolve) => Timer.set(resolve, ms))
}

function onContextCreated(robot) {
  let busy = false // 発話中／検知処理中
  let personHere = false
  let lastMotionAt = 0
  let lastMurmurAt = Date.now()
  let settleUntil = 0
  let prevLuma
  let aimY = 0 // 今向いている注視点（人を追って更新する）
  let aimZ = 0.05

  // 声は manifest の config.tts.type = 'local' で、事前生成したずんだもんの音声(<key>.maud)を再生する。
  // ホスト設定でリモート合成(host を持つ TTS)に変えられた場合だけ、文章を渡して合成させる
  const tts = robot.audio.tts
  const PREGENERATED = !(tts && 'host' in tts)
  if (tts && 'speakerId' in tts) tts.speakerId = SPEAKER_ID

  function look(dy = 0, dz = 0) {
    robot.motion.lookAt([LOOK_X, aimY + dy, aimZ + dz])
  }

  /** 検知後の首振りやしゃべりで画像が揺れるので、比較用の前フレームを捨てて少し検知を止める */
  function resetBaseline(ms) {
    prevLuma = undefined
    settleUntil = Date.now() + ms
  }

  /** ms 待つ。token.active が false になったら途中でも切り上げる */
  async function hold(ms, token) {
    for (let t = 0; t < ms && token.active; t += 100) await sleep(100)
  }

  /** 話している間、gesture のコマを繰り返して人の方を向いたまま首を動かす */
  async function animate(frames, token) {
    for (let i = 0; token.active; i++) {
      const [dy, dz, ms] = frames[i % frames.length]
      look(dy * GESTURE_SCALE, dz * GESTURE_SCALE)
      await hold(ms, token)
    }
  }

  async function wink() {
    robot.face.setEyeOpen('left', 0)
    await sleep(300)
    robot.face.setEyeOpen('left', 1)
  }

  async function say(line) {
    robot.face.setEmotion(line.emotion ?? 0)
    robot.ui.showBalloon(line.balloon ?? line.text)
    if (line.hand) robot.ui.setHandAnimation(line.hand)
    const token = { active: true }
    const moving = animate(GESTURES[line.gesture] ?? GESTURES.talk, token)
    try {
      const result = await robot.audio.say(PREGENERATED ? line.key : line.text)
      if (!result?.success) trace(`[ideatech_promo] say ${line.key} failed: ${JSON.stringify(result)}\n`)
    } catch (e) {
      trace(`[ideatech_promo] say failed: ${e}\n`)
    } finally {
      token.active = false
      await moving
      look()
      if (line.hand) robot.ui.setHandAnimation('none')
      if (line.after !== undefined) robot.face.setEmotion(line.after)
      if (line.wink) await wink()
    }
  }

  /** 動きのあった方へ首を向ける。中央付近なら動かさない。動かしたら true */
  async function trackPerson(m) {
    const offX = m.cx - 0.5
    const offZ = 0.3 - m.top // 頭が画面の上から3割の位置に来るように合わせる
    if (Math.abs(offX) <= TRACK_DEADBAND && Math.abs(offZ) <= TRACK_DEADBAND) return false
    aimY = clamp(aimY - TRACK_FLIP_Y * TRACK_GAIN_Y * offX * 2, -AIM_Y_MAX, AIM_Y_MAX)
    aimZ = clamp(aimZ + TRACK_GAIN_Z * offZ, AIM_Z_MIN, AIM_Z_MAX)
    look()
    await sleep(500) // サーボが向き終わるのを待つ
    resetBaseline(AIM_SETTLE_MS)
    return true
  }

  async function perform(lines) {
    for (const line of lines) {
      await say(line)
      await sleep(250)
    }
    robot.face.setEmotion(0)
    resetBaseline(SETTLE_MS)
  }

  /** 来た人への案内を最後まで通しで行う。じっと聞いている人は動かないので、途中の検知には頼らない */
  async function runVisit() {
    trace('[ideatech_promo] visit start\n')
    personHere = true
    robot.face.setEmotion(3)
    await perform(greeting)
    for (const promo of promos) await perform(promo.lines)
    await perform(closing)
    lastMotionAt = Date.now() // ここから ABSENT_MS の間に動きが無ければ立ち去ったとみなす
    trace('[ideatech_promo] visit done\n')
  }

  async function poll() {
    if (busy) return
    busy = true
    try {
      const now = Date.now()
      if (now < settleUntil) return

      const frame = await robot.camera.capture({
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
        imageType: 'rgb565le',
      })
      if (!frame) return
      let luma
      try {
        luma = sampleLuma(frame)
      } finally {
        frame.close?.() // disposable buffer なので必ず返す
      }

      const prev = prevLuma
      prevLuma = luma
      if (!prev) return

      const m = analyzeMotion(prev, luma)
      if (m.ratio >= TRIGGER_RATIO) {
        lastMotionAt = now
        await trackPerson(m) // 来た人の方へ顔を向けてから話し始める
        // 動きがある間は、案内が終わるたびにすぐ最初から喋り続ける
        trace(`[ideatech_promo] motion ratio=${m.ratio.toFixed(2)} cx=${m.cx.toFixed(2)} -> visit\n`)
        await runVisit()
      } else if (personHere && now - lastMotionAt >= ABSENT_MS) {
        trace('[ideatech_promo] person left\n')
        personHere = false
        aimY = 0
        aimZ = 0.05
        robot.motion.lookAway()
        robot.face.setEmotion(4)
        resetBaseline(AIM_SETTLE_MS)
      } else if (!personHere && now - lastMurmurAt >= MURMUR_MS) {
        lastMurmurAt = now
        // 無人のときはきょろきょろして、通りがかりの人の気を引く
        aimY = (Math.random() - 0.5) * 2 * 0.3
        aimZ = 0.05
        look()
        await perform([idleMurmurs[Math.floor(Math.random() * idleMurmurs.length)]])
      }
    } catch (e) {
      trace(`[ideatech_promo] poll failed: ${e}\n`)
    } finally {
      busy = false
    }
  }

  // ボタン A/B/C で宣伝を指定再生（検知が不調な会場でも使える保険）
  const manual = async (index) => {
    if (busy) return
    busy = true
    try {
      await perform(promos[index].lines)
    } finally {
      busy = false
    }
  }
  ;['a', 'b', 'c'].forEach((key, index) => {
    const button = robot.input.button?.[key]
    if (button) {
      button.onEvent = (event) => {
        if (event.pressed) manual(index)
      }
    }
  })

  // ドロワーの「おんりょう」から音量を変更。ホストが tts.volume として保存するので再起動後も残る
  robot.ui.drawer.addDrawerButton({
    key: 'ideatech:volume',
    label: 'おんりょう',
    kind: 'choice',
    options: VOLUME_LEVELS.map(({ label, value }) => ({ value: String(value), label })),
    callback(_context, value) {
      const volume = Number(value)
      if (!Number.isFinite(volume) || volume < 0 || volume > 1) return
      robot.audio.volume = volume
      // 変えた大きさを聞けるよう試し聞きする（宣伝中は割り込まない）
      if (!busy) {
        busy = true
        say(volumePreview)
          .then(() => {
            robot.face.setEmotion(0)
            prevLuma = undefined
            settleUntil = Date.now() + SETTLE_MS
          })
          .finally(() => {
            busy = false
          })
      }
    },
  })

  robot.face.setEmotion(4)
  Timer.repeat(poll, POLL_MS)
}

export default {
  onContextCreated,
}
