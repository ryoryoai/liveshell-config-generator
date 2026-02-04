# LiveShell Config Generator

LiveShell PRO ローカルモード設定音声生成ツール

Cerevo Dashboard終了（2025年5月）後も、ローカルモードでLiveShell PROを使用するための設定音声を生成します。

## 機能

- プラットフォームプリセット（YouTube Live, Twitch, ニコニコ生放送）
- ネットワーク設定（Ethernet/Wi-Fi, DHCP/固定IP）
- ブラウザ上で音声生成・再生
- WAVファイルダウンロード

## 技術仕様

実際のLiveShell設定音声を解析して特定したFSKパラメータ:

| パラメータ | 値 |
|-----------|-----|
| スペース周波数 | 1900 Hz |
| マーク周波数 | 2500 Hz |
| ボーレート | 1200 bps |
| サンプルレート | 44100 Hz |

## デプロイ

### Vercel

```bash
npm install
npm run build
# Vercelにデプロイ
```

または GitHub連携で自動デプロイ

### ローカル実行

```bash
npm install
npm run dev
# http://localhost:3000 でアクセス
```

## 注意事項

- この音声フォーマットは解析に基づく推測です
- 動作しない場合は [Wayback Machine](https://web.archive.org/web/20250408014553/https://ls-local.cerevo.com/) をご利用ください
- LiveShell 2 / LiveShell X では動作しない可能性があります

## ライセンス

MIT
