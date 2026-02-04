'use client';

import { useState, useRef } from 'react';
import { LiveShellFSKEncoder, LiveShellConfig, PLATFORM_PRESETS } from '@/lib/fsk-encoder';

export default function Home() {
  // 初期プラットフォーム
  const initialPlatform = PLATFORM_PRESETS[0];

  const [config, setConfig] = useState<LiveShellConfig>({
    connectionType: 'ethernet',
    ipMode: 'dhcp',
    streamMode: 'rtmp',
    rtmpUrl: initialPlatform.rtmpUrl,
    streamKey: '',
  });

  const [platform, setPlatform] = useState(initialPlatform.id);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

  const encoderRef = useRef<LiveShellFSKEncoder | null>(null);

  const getEncoder = () => {
    if (!encoderRef.current) {
      encoderRef.current = new LiveShellFSKEncoder();
    }
    return encoderRef.current;
  };

  const handlePlatformChange = (platformId: string) => {
    setPlatform(platformId);
    const preset = PLATFORM_PRESETS.find(p => p.id === platformId);
    if (preset) {
      setConfig(prev => ({
        ...prev,
        rtmpUrl: preset.rtmpUrl,
      }));
    }
  };

  const handleGenerate = () => {
    setIsGenerating(true);
    try {
      const encoder = getEncoder();
      const buffer = encoder.generateAudio(config);
      setAudioBuffer(buffer);
    } catch (error) {
      console.error('Generation error:', error);
      alert('音声生成に失敗しました');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePlay = async () => {
    if (!audioBuffer) return;

    setIsPlaying(true);
    try {
      const encoder = getEncoder();
      await encoder.play(audioBuffer);
    } catch (error) {
      console.error('Play error:', error);
    } finally {
      setIsPlaying(false);
    }
  };

  const handleDownload = () => {
    if (!audioBuffer) return;

    const encoder = getEncoder();
    const filename = `liveshell_${platform}_${Date.now()}.wav`;
    encoder.downloadAsWav(audioBuffer, filename);
  };

  const selectedPreset = PLATFORM_PRESETS.find(p => p.id === platform);

  return (
    <main className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-cerevo-500 mb-2">
          LiveShell Config Generator
        </h1>
        <p className="text-gray-400">
          LiveShell PRO ローカルモード設定音声生成ツール
        </p>
      </div>

      <div className="space-y-6">
        {/* ネットワーク設定 */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">1. ネットワーク設定</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">接続方式</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="connectionType"
                    checked={config.connectionType === 'ethernet'}
                    onChange={() => setConfig(prev => ({ ...prev, connectionType: 'ethernet' }))}
                    className="text-cerevo-500"
                  />
                  <span>Ethernet</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="connectionType"
                    checked={config.connectionType === 'wifi'}
                    onChange={() => setConfig(prev => ({ ...prev, connectionType: 'wifi' }))}
                    className="text-cerevo-500"
                  />
                  <span>Wi-Fi</span>
                </label>
              </div>
            </div>

            {config.connectionType === 'wifi' && (
              <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-gray-700">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">SSID</label>
                  <input
                    type="text"
                    value={config.ssid || ''}
                    onChange={e => setConfig(prev => ({ ...prev, ssid: e.target.value }))}
                    className="input"
                    placeholder="Wi-Fiネットワーク名"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">パスワード</label>
                  <input
                    type="password"
                    value={config.password || ''}
                    onChange={e => setConfig(prev => ({ ...prev, password: e.target.value }))}
                    className="input"
                    placeholder="Wi-Fiパスワード"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-2">IPアドレス</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="ipMode"
                    checked={config.ipMode === 'dhcp'}
                    onChange={() => setConfig(prev => ({ ...prev, ipMode: 'dhcp' }))}
                    className="text-cerevo-500"
                  />
                  <span>DHCP（自動）</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="ipMode"
                    checked={config.ipMode === 'static'}
                    onChange={() => setConfig(prev => ({ ...prev, ipMode: 'static' }))}
                    className="text-cerevo-500"
                  />
                  <span>固定IP</span>
                </label>
              </div>
            </div>

            {config.ipMode === 'static' && (
              <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-gray-700">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">IPアドレス</label>
                  <input
                    type="text"
                    value={config.staticIp || ''}
                    onChange={e => setConfig(prev => ({ ...prev, staticIp: e.target.value }))}
                    className="input"
                    placeholder="192.168.1.100"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">サブネットマスク</label>
                  <input
                    type="text"
                    value={config.subnetMask || ''}
                    onChange={e => setConfig(prev => ({ ...prev, subnetMask: e.target.value }))}
                    className="input"
                    placeholder="255.255.255.0"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">ゲートウェイ</label>
                  <input
                    type="text"
                    value={config.gateway || ''}
                    onChange={e => setConfig(prev => ({ ...prev, gateway: e.target.value }))}
                    className="input"
                    placeholder="192.168.1.1"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">DNS</label>
                  <input
                    type="text"
                    value={config.dns || ''}
                    onChange={e => setConfig(prev => ({ ...prev, dns: e.target.value }))}
                    className="input"
                    placeholder="8.8.8.8"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 配信設定 */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">2. 配信設定</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">プラットフォーム</label>
              <select
                value={platform}
                onChange={e => handlePlatformChange(e.target.value)}
                className="input"
              >
                {PLATFORM_PRESETS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {selectedPreset?.note && (
                <p className="text-sm text-yellow-400 mt-1">{selectedPreset.note}</p>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">RTMP URL</label>
              <input
                type="text"
                value={config.rtmpUrl || ''}
                onChange={e => setConfig(prev => ({ ...prev, rtmpUrl: e.target.value }))}
                className="input"
                placeholder="rtmp://..."
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">ストリームキー</label>
              <input
                type="text"
                value={config.streamKey || ''}
                onChange={e => setConfig(prev => ({ ...prev, streamKey: e.target.value }))}
                className="input"
                placeholder="xxxx-xxxx-xxxx-xxxx"
              />
            </div>
          </div>
        </div>

        {/* 生成 */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">3. 音声生成</h2>

          <div className="space-y-4">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !config.rtmpUrl}
              className="btn btn-primary w-full py-3 text-lg"
            >
              {isGenerating ? '生成中...' : '設定音声を生成'}
            </button>

            {audioBuffer && (
              <div className="flex gap-4">
                <button
                  onClick={handlePlay}
                  disabled={isPlaying}
                  className="btn btn-secondary flex-1"
                >
                  {isPlaying ? '再生中...' : '▶ 再生'}
                </button>
                <button
                  onClick={handleDownload}
                  className="btn btn-secondary flex-1"
                >
                  ⬇ ダウンロード
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 使い方 */}
        <div className="card bg-gray-800/50">
          <h2 className="text-lg font-semibold mb-3">使い方</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-400">
            <li>ネットワーク設定と配信先を入力</li>
            <li>「設定音声を生成」をクリック</li>
            <li>音声をダウンロード（または直接再生）</li>
            <li>PCのヘッドフォン端子 → LiveShell PRO MIC-IN に接続</li>
            <li>PCの音量を<strong className="text-white">100%</strong>に設定</li>
            <li>LiveShell PROをOFFLINEモードにして音声を再生</li>
          </ol>
        </div>

        {/* 注意事項 */}
        <div className="text-center text-sm text-gray-500">
          <p>※ この音声フォーマットは解析に基づく推測です</p>
          <p>動作しない場合は<a href="https://web.archive.org/web/20250408014553/https://ls-local.cerevo.com/" target="_blank" rel="noopener noreferrer" className="text-cerevo-500 hover:underline">Wayback Machine</a>をご利用ください</p>
        </div>
      </div>
    </main>
  );
}
