# おえかき立体工房

店頭のタブレットで描いた絵が、自分の番号のカードに立体で現れるワークショップです。GitHub Actions のホスト型CPUで TripoSR を動かし、GitHub Pages で作品を公開します。

[お絵かき画面](https://bpm82.github.io/oekaki-webar/) ・ [100番の見本のアヒル](https://bpm82.github.io/oekaki-webar/v/?id=100&view=3d) ・ [番号付きカードの印刷](https://bpm82.github.io/oekaki-webar/cards/)

作品を管理するときは [番号別の assets フォルダ](https://github.com/bpm82/oekaki-webar/tree/main/assets) を開きます。01〜100番のフォルダがあり、たとえば [01番](https://github.com/bpm82/oekaki-webar/tree/main/assets/01) のファイルは次のようにまとまっています。

| ファイル | 用途 |
| --- | --- |
| `drawing.png` | 立体化する元の絵 |
| `01.glb` | 01番のQRで表示する3Dモデル |
| `marker.svg` | 印刷できるQR付きのマーカー画像 |
| `pattern.patt` | 従来のARマーカー用の認識データ |
| `status.json` | どの絵を変換したかと処理結果 |

受付前のフォルダにはQR画像とマーカーデータが入っています。作品ごとの追加素材も同じ番号に置けます。WebARはその番号と同じ名前のGLBを表示します。

## Unityで色付きモデルを使う

番号フォルダのGLBをダウンロードし、UnityのPackage Managerで **glTFast**（`com.unity.cloud.gltfast`）を追加したプロジェクトの `Assets` に入れます。インポートされたモデルをシーンに置くと、マテリアルに割り当てられた作品の色を使えます。[Unity公式のインポート手順](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Documentation~/ImportEditor.md)

GitHub ActionsがモデルのUVを展開し、頂点カラーを1024×1024のベースカラーテクスチャに焼き込みます。保存前に、完成したGLBからPNGを読み戻し、メッシュの表面で元の色と照合します。PNGとマテリアルはGLBに内蔵されるので、持ち出すファイルはGLBひとつです。

## 店での流れ

1. 開店前に使う番号のカードを印刷し、店頭端末を下記の手順で接続します。薄くて曲がりやすい紙は台紙に貼ると、カメラに黒枠が入りやすくなります。
2. お客さんはひとり1枚、絵を描いて「完成！ 立体にする」を押します。別のお絵かきアプリで描いたPNGも「PNGを開く」から取り込めます。
3. 最初のひと筆かPNGの読み込みで、空いている最小の番号を確保します。画面に「02番で描いています」と出たら、02番のカードを渡せます。「端末設定」で番号を指定する場合は「設定を保存」で確保します。ほかの端末ではその番号が「描画中」になり、送信後は「使用済み」になります。どちらも選べません。
4. 店頭端末の「作品を開く」で、カメラを使わず立体を指で回して見られます。生成中は「立体化を待ちながら遊ぶ」からクリスマス工房で遊べます。
5. 印刷カードのQRを1枚読んでWebARを開き、カメラを許可します。完成した作品のカードを一緒に映すと、それぞれのQRの上にチャームが現れます。別の枝にカメラを向けるだけで、そこにある作品も見られます。読み取りづらいときは、枝や飾りがQRに重ならないようにして、少し近づいてください。紙のカードが手元にない場合は、店頭端末の「カードにかざす」で同じQRを画面に出せます。

店頭の「立体化を待ちながら遊ぶ」で1回遊び終わると、端末設定を使って、[今回のイベントの得点記録](rankings/itami-christmas-2026.json)に作品番号・ニックネーム・その回の点数・時刻が自動で追加されます。プレイ中に「作品ページに戻る」を押した場合は、その時点の点数を記録します。

再挑戦も1回ずつ記録し、会場ランキングは作品番号ごとの最高点で集計します。同じ名前の参加者も別々に載ります。送信待ちの記録は端末に控え、ゲーム・作品画面・お絵かき画面で自動再送します。ゲームを単独で開いた練習プレイの成績は、そのブラウザに保存されます。

店頭でテンプレートを使って描くと、最初に落とす丸いオーナメントに自分で描いた色や模様が入ります。同じ種類の飾りにもその絵が出ます。

カードは01〜100番で、QRは各番号に1つです。99番は店頭画面で描いたリンゴ、100番はフォルダに直接入れたアヒルの見本です。すでに印刷したカードもそのまま使えます。従来のカードURL（`v/?id=01` など）はWebARを開き、カメラを使わず作品を見るリンクには `&view=3d` を付けます。

予約は1時間で、描画を続けると残り30分を切った時点で延長します。途中でやめるときは「端末設定 → 接続を解除して番号を返す」ですぐに返せます。タブを閉じた場合は最後に予約した期限が来ると空きに戻ります。期限後にほかの端末が確保したカードに送信しようとすると、絵を残したまま別の番号を選び直せます。

## 店頭端末の準備

1. スタッフが `bpm82` でGitHubにサインインし、[Fine-grained personal access token の作成画面](https://github.com/settings/personal-access-tokens/new?name=oekaki-workshop&target_name=bpm82&contents=write)を開きます。
2. 有効期限をイベントに合わせ、「Only select repositories」で `oekaki-webar` を選びます。「Repository permissions」で **Contents** を **Read and write** にして発行します。
3. 店頭の[お絵かき画面](https://bpm82.github.io/oekaki-webar/)を開き、「端末設定」にトークンを入力して「設定を保存」を押します。トークンは同じブラウザに保存されます。次のお客さんのときは、完成した作品の右上にある四角い受付メニューから「新規受付」を押すと、空のお絵かき画面に戻ります。端末の利用を終えるときは「端末設定 → 接続を解除して番号を返す」で、保存したトークンを削除できます。

トークンを入れるのはスタッフが管理する端末だけです。作品を見る人はGitHubへのログイン不要です。入力のPNGと生成したGLBは公開されます。作品に氏名などを入れない運用にしてください。

## フォルダにPNGを置く方法

たとえば02番を作るには、[assets/02](https://github.com/bpm82/oekaki-webar/tree/main/assets/02) に `drawing.png` をアップロードします。店頭のお絵かき画面もこの形式で送信します。管理者が同じフォルダの `drawing.png` を差し替えると、その番号を再変換します。旧形式の `drawings/02.png` に届いた絵も、02番に元絵がなければ自動で移します。

## 変換と公開

- [Drawings to 3D](https://github.com/bpm82/oekaki-webar/actions/workflows/convert.yml) は `main` のPNGを確認し、内容が新しくなった番号だけを `ubuntu-24.04` で処理します。入力画像のSHA-256と処理結果を記録し、色付きメッシュを元絵と同じフォルダに自動コミットします。01番の出力は `assets/01/01.glb` です。旧 `models` ブランチには移行前の履歴があります。
- [Publish workshop](https://github.com/bpm82/oekaki-webar/actions/workflows/pages.yml) は受付時と変換終了時にPagesを更新します。絵とモデルの入力ハッシュが一致したものを公開し、差し替え中は「生成中」と表示します。印刷カードとマーカーは各番号の `marker.svg` と `pattern.patt` を使います。
- 変換できなかった番号は作品ページに表示します。絵を差し替えるか、**Actions → Drawings to 3D → Run workflow** で同じ絵を再試行できます。背景から区別しやすい、色を塗った一つの被写体が向いています。一枚の絵に写っていない裏側はTripoSRが推定します。

以下の2件は、テクスチャ焼き込みを追加する前の実測です。100番の初回実行では、依存関係の準備を含む変換ジョブに2分46秒かかり、14,960面・300,744バイトのGLBができました。[初回の実行ログ](https://github.com/bpm82/oekaki-webar/actions/runs/45619215609)

99番のリンゴは店頭画面から送信し、PNGの受付コミットから完成モデルのPages公開まで1分35秒でした。モデルと依存関係のキャッシュがある状態での1件の実測です。待ち時間は混雑や絵によって変わります。[受付コミット](https://github.com/bpm82/oekaki-webar/commit/a7d0d67ab72074f4a92b934877c90850a4ce3534) ・ [変換](https://github.com/bpm82/oekaki-webar/actions/runs/45622357038) ・ [公開](https://github.com/bpm82/oekaki-webar/actions/runs/45622536634)

## 活用した部品

- 第8回伊丹マルシェの番号別GLB・パターンの対応、マーカートラッキング、材質設定を引き継ぎました。印刷カードは同イベントのQR生成ライブラリと、QR画像を4方向から16×16に縮小する方式を使っています。[WebAR本体](https://github.com/met-achievements/The-8th-ITAMI-Workshop-March-/blob/main/webar-project/index.html) ・ [チケット用マーカー](https://github.com/met-achievements/The-8th-ITAMI-Workshop-March-/blob/main/christmas-snow-globe/ticket-marker.mjs)
- 個人プロジェクトで使っていた、読み込み状態を表示するWebARと、カメラを開く前に指でモデルを回せるビューを取り入れました。[bpm82/webar-project](https://github.com/bpm82/webar-project/blob/ar-stg/index.html) ・ [bpm82/nomark-webar-project](https://github.com/bpm82/nomark-webar-project)
- 画像からの立体化には [TripoSR](https://github.com/VAST-AI-Research/TripoSR) と [公開モデルの重み](https://huggingface.co/stabilityai/TripoSR) を使用しています。カード生成に同梱した Kazuhiko Arase の QR Code Generator はMITライセンスです。複数のQRの読み取りには [ZXing-WASM](https://github.com/Sec-ant/zxing-wasm)、立体の表示には A-Frame 同梱の Three.js と Google の model-viewer を使用しています。
