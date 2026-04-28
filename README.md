# 楽天ポイント履歴一括保存

[Chrome Web Storeで公開中！](https://chromewebstore.google.com/detail/fdancdeohoaopohmjfnbpddgndlkcaip)
[GitHubリポジトリ](https://github.com/kouheisatou/PointHistoryScraper)

## 概要

**楽天PointClub** のポイント履歴をワンクリックで取得して**ローカル保存**し、サイドパネルからダッシュボード・履歴一覧・CSV/Excelエクスポートまで一気通貫で扱えるChrome拡張機能です。
取得した履歴はそのままグラフ化・期間指定エクスポート・X共有まで可能で、月次のポイント運用を見える化できます。

---

## 主な機能

### 取得

- 拡張機能アイコンクリックでサイドパネルを表示
- 「**全期間CSVエクスポート**」ボタンで楽天PointClub履歴を自動巡回取得し、完了後CSVを自動ダウンロード
- 当日すでに取得済みであれば再取得をスキップしてローカル保存済みデータからCSVを生成
- 既に取得済みの履歴に到達した時点で自動停止する**差分取得モード**
- 「**強制的に全期間取得する**」チェックで全ページ再取得（差分停止を無効化）
- 全列一致（`date, service, title, action, point, note`）で重複排除

### ダッシュボード

- 全期間／今年の **獲得・累計チャージ額・合計利用額** をカード表示
- **ポイント利息累計 / 月平均獲得 / 月平均利用** を一覧
- **月別推移**の折れ線グラフ（前後の期間を切替可能）
- **サービス別獲得ポイント** 円グラフ（期間指定可）
- **詳細別利用ポイント** 円グラフ（期間指定可）
- 各カード／グラフを **画像として保存** または **Xで共有**

### 履歴一覧

- **期間指定** （開始日・終了日）で絞り込み
- **年 / サービス / 種別** のショートカットフィルタ
- **日付・ポイント** で昇順／降順ソート
- 期間・フィルタ反映状態のまま **CSV／Excel エクスポート**
- **CSVインポート**（複数ファイル選択可）で過去のバックアップを統合

### データ仕様

- CSVカラム: `date, service, title, action, point, note`
- 文字コード: **UTF-8 (BOM付き)** — Excel・スプレッドシートで文字化けせず開けます
- セル内改行・カンマ・先頭の `=`/`+`/`-`/`@` を安全にエスケープ

---

## 使い方

1. Chrome拡張機能をインストール
2. 拡張機能アイコンをクリックしてサイドパネルを開く
3. 「**全期間CSVエクスポート**」を押す
   - 楽天PointClubが新規タブで開かれ、履歴を自動収集
   - 完了後にCSVが自動ダウンロードされ、新規追加件数がダイアログ表示されます
   - 同日にすでに取得済みの場合はスクレイピングを行わず、ローカルデータからCSVを即生成
4. 「**強制的に全期間取得する**」にチェックを入れると、取得済みデータを無視して全ページ再取得します
5. **ダッシュボード**タブでグラフや集計を確認、**履歴**タブで期間・フィルタ指定エクスポートやCSVインポートが可能

---

## プライバシー

- 取得したデータは **ローカルストレージのみ** に保存されます
- **外部サーバーへの通信は一切ありません**
- 必要な権限は `storage` / `sidePanel` のみ
- 詳細は[プライバシーポリシー](privacy.html)をご覧ください

---

## インストール

### Chrome Web Store

[Chrome Web Store からインストール](https://chromewebstore.google.com/detail/fdancdeohoaopohmjfnbpddgndlkcaip)

### 手動インストール

1. このリポジトリをクローン
2. Chromeの「拡張機能」→「パッケージ化されていない拡張機能を読み込む」から `chrome_extension` フォルダを選択

---

## ファイル構成

```
chrome_extension/
├── manifest.json
├── background.js       # サイドパネル開閉設定
├── content.js          # 楽天履歴ページのスクレイピング
├── sidepanel.html      # サイドパネルUI
├── sidepanel.css
├── sidepanel.js        # ダッシュボード・履歴・エクスポート・インポート
├── xlsx.mini.min.js    # Excel書き出し
├── share.svg / x.svg / icons8-share.svg
└── icon.png
```

---

## クレジット

- 開発: koheisato
- [Chrome Web Storeページ](https://chromewebstore.google.com/detail/fdancdeohoaopohmjfnbpddgndlkcaip)

ご利用ありがとうございます！
