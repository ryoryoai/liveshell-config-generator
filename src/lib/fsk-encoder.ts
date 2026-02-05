/**
 * LiveShell Local Mode Audio Encoder
 *
 * Source: Wayback `ls-local.cerevo.com` (2025-04-08)
 * - 8N1 framing (MSB first)
 * - 12-bit preamble/postamble
 * - CRC16 (CCITT)
 * - 32 samples/bit
 * - Repeat payload 3 times
 */

export type WiFiEncryptionScheme = 'WPA' | 'WEP_Open' | 'WEP_Shared' | 'None';

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
  wifiStealthMode?: boolean;
  wifiEncryptionScheme?: WiFiEncryptionScheme;

  // 配信設定（RTMPのみ対応）
  streamMode: 'rtmp';
  rtmpUrl?: string;
  streamKey?: string;
  rtmpOneTime?: boolean;
  rtmpWithAuth?: boolean;
  rtmpAuthUserName?: string;
  rtmpAuthPassword?: string;

  // デバイス種別（未指定ならPro）
  device?: 'LiveShell2' | 'LiveShellPro' | 'LiveShellX';
}

const SAMPLE_RATES = {
  LiveShell2: 16000,
  LiveShellPro: 44100,
  LiveShellX: 48000,
} as const;

const PREAMBLE_BITS = 12;
const POSTAMBLE_BITS = 12;
const SAMPLES_PER_BIT = 32;
const REPEAT_COUNT = 3;

const WAVE_INT16_AMPLITUDE = 3276;
const INT16_SCALE = 32768;

const WAVE_TABLE = (() => {
  const wave0 = new Float32Array(SAMPLES_PER_BIT);
  const wave1 = new Float32Array(SAMPLES_PER_BIT);
  for (let i = 0; i < SAMPLES_PER_BIT; i++) {
    const s0 = Math.round(WAVE_INT16_AMPLITUDE * Math.sin(i * Math.PI * 2 / 8));
    const s1 = Math.round(WAVE_INT16_AMPLITUDE * Math.sin(i * Math.PI * 4 / 8));
    wave0[i] = s0 / INT16_SCALE;
    wave1[i] = s1 / INT16_SCALE;
  }
  return [wave0, wave1];
})();

export const FSK_PARAMS = {
  sampleRate: SAMPLE_RATES.LiveShellPro,
  spaceFreq: 5512.5,
  markFreq: 11025,
  baudRate: SAMPLE_RATES.LiveShellPro / SAMPLES_PER_BIT,
  samplesPerBit: SAMPLES_PER_BIT,
  preambleBits: PREAMBLE_BITS,
  postambleBits: POSTAMBLE_BITS,
  repeatCount: REPEAT_COUNT,
  amplitude: WAVE_INT16_AMPLITUDE / INT16_SCALE,
};

export class LiveShellFSKEncoder {
  private audioContext: AudioContext | null = null;

  generateAudio(config: LiveShellConfig): AudioBuffer {
    const sampleRate = SAMPLE_RATES[config.device ?? 'LiveShellPro'];
    const configString = this.buildConfigString(config);
    const samples = this.encodeToSamples(configString);

    this.ensureContext(sampleRate);
    const buffer = this.audioContext!.createBuffer(1, samples.length, sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  }

  async play(buffer: AudioBuffer): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: buffer.sampleRate });
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

  private ensureContext(sampleRate: number): void {
    if (!this.audioContext || this.audioContext.sampleRate !== sampleRate) {
      if (this.audioContext) {
        this.audioContext.close();
      }
      this.audioContext = new AudioContext({ sampleRate });
    }
  }

  private buildConfigString(config: LiveShellConfig): string {
    const networkString = this.buildNetworkString(config);
    if (!networkString) {
      throw new Error('ネットワーク設定が不正です');
    }

    const liveObject = this.buildLiveObject(config);
    if (!liveObject) {
      throw new Error('RTMP設定が不正です');
    }

    return `${networkString}[LOCAL]\nLIVE=${JSON.stringify(liveObject)}\n`;
  }

  private buildNetworkString(config: LiveShellConfig): string | null {
    if (config.connectionType === 'wifi') {
      if (!config.ssid) {
        return null;
      }

      const stealth = config.wifiStealthMode ?? false;
      const scheme = config.wifiEncryptionScheme ?? 'WPA';
      const password = config.password ?? '';

      let out = `[WLAN1]\nESSID=${config.ssid}\n`;

      if (password !== '' && scheme !== 'None') {
        if (stealth && scheme === 'WPA') {
          out += `PSK=${password}\n`;
        } else {
          out += `WEP=${password}\n`;
          if (stealth && scheme === 'WEP_Shared') {
            out += 'MODE=SHARED\n';
          }
        }
      }

      if (
        config.ipMode === 'static' &&
        config.staticIp &&
        config.subnetMask &&
        config.gateway &&
        config.dns
      ) {
        out += `IP=${config.staticIp};${config.gateway};${config.subnetMask}\nDNS=${config.dns}\n`;
      }

      return out;
    }

    if (config.connectionType === 'ethernet') {
      let out = '[ETHER]\n';

      if (
        config.ipMode === 'static' &&
        config.staticIp &&
        config.subnetMask &&
        config.gateway &&
        config.dns
      ) {
        out += `IP=${config.staticIp};${config.gateway};${config.subnetMask}\nDNS=${config.dns}\n`;
      }

      return out;
    }

    return null;
  }

  private buildLiveObject(config: LiveShellConfig): Record<string, unknown> | null {
    if (config.streamMode !== 'rtmp' || !config.rtmpUrl || !config.streamKey) {
      return null;
    }

    const match = config.rtmpUrl.match(
      /^(rtmps?:\/\/[-A-Za-z0-9.@_~!#$&'()*+,:;=?[\]]+)(?:\/([-A-Za-z0-9./@_~!#$&'()*+,:;=?[\]]+))?$/
    );
    if (!match) {
      return null;
    }

    const baseUrl = match[1];
    const app = match.length > 2 ? match[2] : null;

    let url = baseUrl;
    if (app) {
      url += ` app=${app}`;
    }
    url += ` playPath=${config.streamKey}`;
    url += ' flashver=FME/3.0\\\\20(compatible;\\\\20FMSc/1.0)';

    if (config.rtmpWithAuth && config.rtmpAuthUserName && config.rtmpAuthPassword) {
      url += ` pubUser=${config.rtmpAuthUserName} pubPasswd=${config.rtmpAuthPassword}`;
    }

    return {
      type: 0,
      rtmp: {
        onetime: config.rtmpOneTime ?? false,
        url,
      },
    };
  }

  private encodeToSamples(text: string): Float32Array {
    const bytes = new TextEncoder().encode(text);
    const bits = this.buildBits(bytes);
    const baseSamples = this.bitsToSamples(bits);
    const totalSamples = baseSamples.length * REPEAT_COUNT;

    const samples = new Float32Array(totalSamples);
    for (let i = 0; i < REPEAT_COUNT; i++) {
      samples.set(baseSamples, i * baseSamples.length);
    }

    return samples;
  }

  private buildBits(bytes: Uint8Array): number[] {
    const bits: number[] = [];

    for (let i = 0; i < PREAMBLE_BITS; i++) {
      bits.push(1);
    }

    let crc = 0;
    for (let i = 0; i < bytes.length; i++) {
      const value = bytes[i];
      this.pushFramedByte(bits, value);
      crc = this.crc16Update(crc, value);
    }

    this.pushFramedByte(bits, (crc >> 8) & 0xff);
    this.pushFramedByte(bits, crc & 0xff);

    for (let i = 0; i < POSTAMBLE_BITS; i++) {
      bits.push(1);
    }

    return bits;
  }

  private pushFramedByte(bits: number[], value: number): void {
    bits.push(0);
    for (let i = 7; i >= 0; i--) {
      bits.push((value >> i) & 1);
    }
    bits.push(1);
  }

  private bitsToSamples(bits: number[]): Float32Array {
    const samples = new Float32Array(bits.length * SAMPLES_PER_BIT);
    let offset = 0;
    for (const bit of bits) {
      const wave = bit === 1 ? WAVE_TABLE[1] : WAVE_TABLE[0];
      samples.set(wave, offset);
      offset += SAMPLES_PER_BIT;
    }
    return samples;
  }

  private crc16Update(crc: number, value: number): number {
    let c = crc ^ (value << 8);
    for (let i = 0; i < 8; i++) {
      c = (c & 0x8000) !== 0 ? (c << 1) ^ 0x1021 : c << 1;
    }
    return c & 0xffff;
  }

  private audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const samples = buffer.getChannelData(0);
    const dataLength = samples.length * bytesPerSample;
    const bufferLength = 44 + dataLength;

    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, bufferLength - 8, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
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
