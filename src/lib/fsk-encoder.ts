/**
 * LiveShell PRO FSK Audio Encoder
 *
 * サンプル音声解析に基づくパラメータ:
 * - スペース周波数: 5512.5 Hz (ビット 0) = sampleRate / 8
 * - マーク周波数: 11025 Hz (ビット 1) = sampleRate / 4
 * - ボーレート: 1225 bps (36 samples/bit)
 * - サンプルレート: 44100 Hz
 * - 振幅: 0.1 (10%)
 */

export interface LiveShellConfig {
  // ネットワーク設定
  connectionType: 'wifi' | 'ethernet';
  ipMode: 'dhcp' | 'static';
  staticIp?: string;
  subnetMask?: string;
  gateway?: string;
  dns?: string;

  // Wi-Fi設定（Wi-Fi選択時のみ）
  ssid?: string;
  password?: string;

  // 配信設定
  streamMode: 'rtmp' | 'rtsp';
  rtmpUrl?: string;
  streamKey?: string;
}

const FSK_CONFIG = {
  sampleRate: 44100,
  // 周波数はサンプルレートの1/8と1/4
  get spaceFreq() { return this.sampleRate / 8; },  // 5512.5 Hz (ビット 0)
  get markFreq() { return this.sampleRate / 4; },   // 11025 Hz (ビット 1)
  get baudRate() { return this.sampleRate / 36; },  // 1225 bps
  get samplesPerBit() { return 36; },
  amplitude: 0.1,  // サンプル音声と同じ振幅
  // プリアンブル（同期用）- サンプル音声に合わせて長めに
  preambleLength: 500,
  // ポストアンブル
  postambleLength: 500,
  // 最小長さ（サンプル音声が約5秒なので）
  minDurationSeconds: 5,
};

export class LiveShellFSKEncoder {
  private audioContext: AudioContext | null = null;

  /**
   * 設定をJSONにシリアライズ
   */
  private serializeConfig(config: LiveShellConfig): string {
    const payload: Record<string, unknown> = {
      net: {
        type: config.connectionType === 'wifi' ? 'wifi' : 'eth',
        ip: config.ipMode,
      },
      stream: {
        mode: config.streamMode,
      },
    };

    // 固定IP設定
    if (config.ipMode === 'static') {
      payload.net = {
        ...payload.net as object,
        addr: config.staticIp,
        mask: config.subnetMask,
        gw: config.gateway,
        dns: config.dns,
      };
    }

    // Wi-Fi設定
    if (config.connectionType === 'wifi') {
      payload.wifi = {
        ssid: config.ssid,
        pass: config.password,
      };
    }

    // RTMP設定
    if (config.streamMode === 'rtmp' && config.rtmpUrl) {
      payload.stream = {
        ...payload.stream as object,
        url: config.rtmpUrl,
        key: config.streamKey || '',
      };
    }

    return JSON.stringify(payload);
  }

  /**
   * 文字列をバイナリに変換（8N1フォーマット）
   */
  private stringToBinary(str: string): string {
    let binary = '';

    // プリアンブル（連続した1）- サンプル音声に合わせる
    for (let i = 0; i < FSK_CONFIG.preambleLength; i++) {
      binary += '1';
    }

    // データを複数回送信（冗長性のため）
    for (let repeat = 0; repeat < 3; repeat++) {
      // 同期バイト（フレーム開始マーカー）
      binary += '01111110'; // 0x7E

      // データ
      for (let i = 0; i < str.length; i++) {
        const charCode = str.charCodeAt(i);
        // 8N1: スタートビット(0) + 8データビット(LSB first) + ストップビット(1)
        binary += '0'; // スタートビット

        // LSB first
        for (let bit = 0; bit < 8; bit++) {
          binary += ((charCode >> bit) & 1).toString();
        }

        binary += '1'; // ストップビット
      }

      // フレーム終了マーカー
      binary += '01111110'; // 0x7E

      // フレーム間ギャップ
      for (let i = 0; i < 50; i++) {
        binary += '1';
      }
    }

    // ポストアンブル（連続した1）
    for (let i = 0; i < FSK_CONFIG.postambleLength; i++) {
      binary += '1';
    }

    // 最小長さを確保
    const minBits = Math.ceil(FSK_CONFIG.minDurationSeconds * FSK_CONFIG.baudRate);
    while (binary.length < minBits) {
      binary += '1';
    }

    return binary;
  }

  /**
   * FSK変調してAudioBufferを生成
   */
  generateAudio(config: LiveShellConfig): AudioBuffer {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: FSK_CONFIG.sampleRate });
    }

    const jsonData = this.serializeConfig(config);
    console.log('Config JSON:', jsonData);
    console.log('JSON length:', jsonData.length, 'chars');

    const binaryData = this.stringToBinary(jsonData);
    console.log('Binary length:', binaryData.length, 'bits');

    const samplesPerBit = FSK_CONFIG.samplesPerBit;
    const totalSamples = binaryData.length * samplesPerBit;
    const duration = totalSamples / FSK_CONFIG.sampleRate;
    console.log('Audio duration:', duration.toFixed(2), 'seconds');

    const buffer = this.audioContext.createBuffer(
      1, // モノラル
      totalSamples,
      FSK_CONFIG.sampleRate
    );

    const channelData = buffer.getChannelData(0);
    let sampleIndex = 0;
    let phase = 0;

    const spaceFreq = FSK_CONFIG.spaceFreq;
    const markFreq = FSK_CONFIG.markFreq;
    const amplitude = FSK_CONFIG.amplitude;
    const sampleRate = FSK_CONFIG.sampleRate;

    for (let i = 0; i < binaryData.length; i++) {
      const freq = binaryData[i] === '1' ? markFreq : spaceFreq;
      const phaseIncrement = (2 * Math.PI * freq) / sampleRate;

      for (let j = 0; j < samplesPerBit; j++) {
        // 位相連続FSK
        channelData[sampleIndex] = amplitude * Math.sin(phase);
        phase += phaseIncrement;
        sampleIndex++;
      }

      // 位相を正規化（オーバーフロー防止）
      if (phase > 2 * Math.PI * 1000) {
        phase = phase % (2 * Math.PI);
      }
    }

    return buffer;
  }

  /**
   * AudioBufferを再生
   */
  async play(buffer: AudioBuffer): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: FSK_CONFIG.sampleRate });
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    return new Promise((resolve) => {
      const source = this.audioContext!.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext!.destination);
      source.onended = () => resolve();
      source.start();
    });
  }

  /**
   * AudioBufferをWAVファイルに変換してダウンロード
   */
  downloadAsWav(buffer: AudioBuffer, filename: string = 'liveshell_config.wav'): void {
    const wavData = this.audioBufferToWav(buffer);
    const blob = new Blob([wavData], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  }

  /**
   * AudioBufferをWAVバイナリに変換
   */
  private audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const samples = buffer.getChannelData(0);
    const dataLength = samples.length * bytesPerSample;
    const bufferLength = 44 + dataLength;

    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    // WAVヘッダー
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, bufferLength - 8, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // オーディオデータ
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }

    return arrayBuffer;
  }

  private writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
}

// プラットフォームプリセット（2025年版）
export const PLATFORM_PRESETS = [
  {
    id: 'youtube',
    name: 'YouTube Live',
    rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
    note: 'YouTube Studioからストリームキーを取得',
  },
  {
    id: 'tiktok',
    name: 'TikTok LIVE',
    rtmpUrl: '',
    note: 'TikTok LIVE Studio設定からRTMP URLとキーを取得（フォロワー1,000人以上必要）',
  },
  {
    id: 'twitch',
    name: 'Twitch',
    rtmpUrl: 'rtmp://live-tyo.twitch.tv/app',
    note: '東京サーバー。他地域: live.twitch.tv/app',
  },
  {
    id: 'kick',
    name: 'Kick',
    rtmpUrl: '',
    note: 'Kick設定ページからRTMP URL（rtmps://...）とキーを取得',
  },
  {
    id: 'twicas',
    name: 'ツイキャス',
    rtmpUrl: 'rtmp://rtmp03.twitcasting.tv/live',
    note: 'ツール配信設定からキーを取得',
  },
  {
    id: 'niconico',
    name: 'ニコニコ生放送',
    rtmpUrl: '',
    note: 'RTMP URLは放送ごとに変わります',
  },
  {
    id: 'custom',
    name: 'カスタム',
    rtmpUrl: '',
  },
];
