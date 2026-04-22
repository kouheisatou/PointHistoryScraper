# 楽天ポイント履歴一括保存

[Chrome Web Storeで公開中！](https://chromewebstore.google.com/detail/fdancdeohoaopohmjfnbpddgndlkcaip)  
[GitHubリポジトリ](https://github.com/kouheisatou/PointHistoryScraper)

## 概要

**楽天PointClub** のポイント履歴を、ワンクリックで取得して**ローカル保存**できるChrome拡張機能です。  
全ページの履歴を自動で巡回し、必要な期間だけ**CSVエクスポート**できます。

---

## 主な機能

- 楽天PointClubのポイント履歴を**local storage**に蓄積
- **全ページ自動巡回**で履歴を漏れなく取得
- **期間指定**でCSVエクスポート可能
- **全列一致（date, service, title, action, point, note）**で重複排除
- **セル内改行やカンマも安全にエスケープ**し、Excelやスプレッドシートでそのまま利用可能
- **外部通信なし・完全ローカル処理**でプライバシーも安心
- シンプルなUIで**ワンクリック操作**

---

## 使い方

1. Chrome拡張機能をインストール
2. 拡張機能アイコンをクリックし、「楽天ポイント履歴 取得開始」ボタンを押す
3. 楽天PointClubの履歴ページが自動で開き、全ページ分の履歴がlocal storageに保存されます
4. popupで開始日・終了日を指定し、「期間指定でCSVエクスポート」を押すとCSVを出力できます

---

## 取得データの仕様

- **CSVカラム**: `date, service, title, action, point, note`
- **note列**はセル内改行やカンマも正しくエスケープ
- 文字コード: Shift-JIS（Excelで文字化けしない）

---

## プライバシー

- 取得したデータは**ローカルでのみ処理・保存**されます
- **外部サーバーへの通信は一切ありません**
- 詳細は[プライバシーポリシー](privacy.html)をご覧ください

---

## インストール

### Chrome Web Store

[Chrome Web Store からインストール](https://chromewebstore.google.com/detail/fdancdeohoaopohmjfnbpddgndlkcaip)

### 手動インストール

1. このリポジトリをクローン
2. Chromeの「拡張機能」→「パッケージ化されていない拡張機能を読み込む」から`chrome_extension`フォルダを選択

---

## ファイル構成

```
chrome_extension/
├── manifest.json
├── content.js
├── popup.html
├── popup.js
├── icon.png
```

---

## 更新履歴

- v1.1.0（2026/04/22）: local storage蓄積、期間指定CSVエクスポート、全列一致重複排除を追加
- v1.0.2（2025/07/06）: セル内改行対応・安定性向上
- v1.0.1: 初回公開

---

## クレジット

- 開発: koheisato  
- [Chrome Web Storeページ](https://chromewebstore.google.com/detail/fdancdeohoaopohmjfnbpddgndlkcaip)

---

ご利用ありがとうございます！

---

参考:  
[Chrome Web Store公式ページ](https://chromewebstore.google.com/detail/fdancdeohoaopohmjfnbpddgndlkcaip) 
