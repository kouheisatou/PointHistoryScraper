# 楽天ポイント履歴一括保存 - ホームページ

このディレクトリには、楽天PointClubのポイント履歴をCSV形式で一括保存するChrome拡張機能の **限界を超えてリッチでモダンな** ホームページが含まれています。

## 🚀 特徴

### デザイン
- **ガラスモルフィズム効果** - 最新のデザイントレンド
- **グラデーション背景** - 美しいカラーパレット
- **3Dトランスフォーム** - 立体的なカードエフェクト
- **パーティクル背景** - インタラクティブな背景アニメーション
- **ダークモード対応** - 切り替え可能なテーマ
- **完全レスポンシブ** - 全デバイス対応

### インタラクティブ機能
- ⚡ パーティクル.js背景アニメーション
- 🎯 スムーズスクロール
- 📊 スクロール進行バー
- 🎭 ナビゲーションバーの自動隠し/表示
- 🃏 カードのチルト効果
- 💧 ボタンのリップル効果
- ⌨️ タイピングエフェクト
- ⏳ ローディングアニメーション
- 🖱️ カスタムマウスカーソル
- 📱 AOS (Animate On Scroll)

### 技術スタック
- **HTML5** - セマンティックマークアップ
- **CSS3** - 最新のCSS機能（Grid, Flexbox, CSS変数など）
- **Vanilla JavaScript** - 高性能なインタラクティブ機能
- **Particles.js** - パーティクル背景効果
- **AOS** - スクロールアニメーション
- **Google Fonts** - Inter フォントファミリー

## 📁 ファイル構成

```
homepage/
├── index.html      # メインHTMLファイル
├── style.css       # 超リッチなCSSスタイル
├── script.js       # インタラクティブ機能
└── README.md       # このファイル
```

## 🛠️ セットアップ

### 1. ローカルサーバーで実行

```bash
# Python 3を使用
python -m http.server 8000

# または Node.js の http-server を使用
npx http-server

# または PHP を使用
php -S localhost:8000
```

### 2. ブラウザでアクセス

```
http://localhost:8000/homepage/
```

## 🎨 カスタマイズ

### カラーパレットの変更

`style.css` の CSS変数を編集してカラーパレットをカスタマイズできます：

```css
:root {
    --primary-color: #6366f1;      /* メインカラー */
    --secondary-color: #f59e0b;    /* セカンダリカラー */
    --accent-color: #10b981;       /* アクセントカラー */
    /* その他の色も変更可能 */
}
```

### アニメーションの調整

`script.js` でアニメーションの設定を変更できます：

```javascript
// パーティクルの数を変更
particles: {
    number: {
        value: 80,  // この値を変更
    }
}

// タイピング速度を変更
setTimeout(typeText, isTag ? 0 : 50);  // 50ms を変更
```

## 🌟 主要セクション

1. **ヒーローセクション** - インパクトのある最初の印象
2. **機能紹介** - 6つの主要機能をカード形式で表示
3. **使い方ガイド** - 3ステップの簡単な説明
4. **プライバシー情報** - セキュリティ重視の設計説明
5. **ダウンロード** - GitHub と Chrome Web Store のリンク
6. **フッター** - 追加情報とリンク

## 📱 レスポンシブブレイクポイント

- **Desktop**: 1200px以上
- **Tablet**: 768px - 1199px
- **Mobile**: 480px - 767px
- **Small Mobile**: 480px以下

## 🎯 パフォーマンス最適化

- **デバウンス処理** - スクロールイベントの最適化
- **Intersection Observer** - 効率的なスクロールアニメーション
- **CSS変数** - 動的テーマ切り替え
- **レイジーローディング** - 必要に応じてリソースを読み込み

## 🔧 ブラウザサポート

- ✅ Chrome 80+
- ✅ Firefox 75+
- ✅ Safari 13+
- ✅ Edge 80+

## 📝 ライセンス

このホームページは楽天ポイント履歴一括保存Chrome拡張機能のプロモーション用途で作成されています。

## 🤝 貢献

バグ報告や機能改善の提案は [GitHub Issues](https://github.com/kouheisatou/PointHistoryScraper/issues) でお願いします。

## 📞 お問い合わせ

- **Email**: satoukouheirenrakuyou@gmail.com
- **GitHub**: https://github.com/kouheisatou/PointHistoryScraper
- **Chrome Web Store**: https://chromewebstore.google.com/detail/fdancdeohoaopohmjfnbpddgndlkcaip

---

**「限界を超えてリッチでモダンな」** ホームページをお楽しみください！🚀 