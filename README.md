# IdeaxTech 宣伝スタックチャン（ずんだもん）

stack-chan（ししかわ版, CoreS3）の MOD として、人が近づくと次の3つを呼び込みます。

1. キーボード制作体験
2. キーボードアクセサリーのガチャガチャ
3. ゲーム体験

- `ideatech_promo/` … 宣伝 MOD 本体（`mod.js`、台詞は `speeches.js`、生成済みの音声は `assets/`）
- `host/manifest_ideatech.json` … 音声をホストに同梱するための manifest（本家の `firmware/host/app/` に置く）
- `upstream/` … 本家 stack-chan。このリポジトリには含めない（下の手順でクローンする）

## 動作

- カメラ（160x120）の差分で「人が来た」を検知 → あいさつ → 3つを順に紹介 → 最後にまとめ
- 来た人には、あいさつから制作体験・ガチャ・ゲーム・まとめまでを通しで案内し、終わったらすぐ最初から喋り続ける。案内の合間に `ABSENT_MS`（8秒）ずっと動きが無ければ立ち去ったとみなして静かになる
- 無人のときは `MURMUR_MS` ごとにひとりごと
- ボタン A / B / C のコードは残っていますが、CoreS3 にはこのボタンが無いため動きません
- 検知は顔認識ではなく**動き検知**です。自分の首振りで誤検知しないよう、発話後 `SETTLE_MS` は検知を止めています

## 準備（事前生成方式）

ずんだもんの声は、PCのVOICEVOXで**事前にWAVを作り、ホストファームに同梱**します。本番でWi-FiもPCも要りません。

### 0. 本家 stack-chan を用意

```sh
git clone --depth 1 https://github.com/stack-chan/stack-chan.git upstream
cp host/manifest_ideatech.json upstream/firmware/host/app/
cd upstream/firmware && npm install && npm run setup -- --device=esp32
```

動作確認は stack-chan v2.0.1 / Moddable SDK 10.0.2 / ESP-IDF 6.1 で行いました。

### 1. VOICEVOX エンジン（PC・音声を作るときだけ）

```sh
~/.local/share/voicevox_engine/engine/macos-arm64/run --port 50021
```

### 2. 音声（WAV）の生成

台詞は `ideatech_promo/speeches.js`。話者はずんだもん あまあま（`--speaker 1`。ノーマルは 3、ツンツンは 7）、サンプルレートは 11025。

```sh
cd upstream/firmware
npm run generate-speech-voicevox -- --input ../../ideatech_promo/speeches.js --output ../../ideatech_promo/assets --speaker 1 --sample 11025
```

### 3. 書き込み

音声は 1MB を超えて MOD 領域（256KB）に入らないため、ホスト側に同梱します（`host/app/manifest_ideatech.json` が `ideatech_promo/assets/` を取り込みます）。

```sh
cd upstream/firmware
source ~/.local/share/xs-dev-export.sh
export PATH="$HOME/.espressif/python_env/idf6.1_py3.15_env/bin:$PATH" UPLOAD_PORT=/dev/cu.usbmodem1101

npm run build:m5stackchan_cores3 -- --manifest host/app/manifest_ideatech.json
npm run deploy:m5stackchan_cores3 -- --manifest host/app/manifest_ideatech.json
npm run mod:m5stackchan_cores3 -- ../../ideatech_promo/manifest.json
```

- 台詞を変えたら 2 → 3 をやり直します（ホストの再書き込みが必要）
- ホストの TTS 設定は既定の `local` のままにします（`voicevox` などにすると、WAVではなく文章をリアルタイム合成します）
- 本家 `upstream/` への変更は `firmware/host/app/manifest_ideatech.json` の追加のみです

## 台詞の編集

`ideatech_promo/speeches.js` を編集し、上の手順 2 → 3 で作り直します。日時・場所・料金は未確定のため台詞には入れていません。

## クレジット

VOICEVOX のキャラクターを使うため、展示・配信などでは **「VOICEVOX:ずんだもん」** のクレジット表記が必要です。会場の掲示などに入れてください。
