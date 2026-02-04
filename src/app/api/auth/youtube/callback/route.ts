import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = process.env.NEXT_PUBLIC_URL
  ? `${process.env.NEXT_PUBLIC_URL}/api/auth/youtube/callback`
  : 'http://localhost:3000/api/auth/youtube/callback';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/?error=no_code', request.url)
    );
  }

  try {
    // 認可コードをアクセストークンに交換
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Token exchange error:', tokenData);
      return NextResponse.redirect(
        new URL(`/?error=token_exchange_failed`, request.url)
      );
    }

    const accessToken = tokenData.access_token;

    // YouTube APIでライブ配信情報を取得
    const youtubeResponse = await fetch(
      'https://www.googleapis.com/youtube/v3/liveStreams?part=cdn,snippet&mine=true',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const youtubeData = await youtubeResponse.json();

    if (!youtubeResponse.ok) {
      console.error('YouTube API error:', youtubeData);
      return NextResponse.redirect(
        new URL(`/?error=youtube_api_failed`, request.url)
      );
    }

    // ストリームキーを取得
    let streamKey = '';
    let streamName = '';

    if (youtubeData.items && youtubeData.items.length > 0) {
      const stream = youtubeData.items[0];
      streamKey = stream.cdn?.ingestionInfo?.streamName || '';
      streamName = stream.snippet?.title || 'Default Stream';
    }

    // クライアントにリダイレクト（ストリームキーをURLパラメータで渡す）
    const redirectUrl = new URL('/', request.url);
    if (streamKey) {
      redirectUrl.searchParams.set('streamKey', streamKey);
      redirectUrl.searchParams.set('streamName', streamName);
      redirectUrl.searchParams.set('platform', 'youtube');
    } else {
      redirectUrl.searchParams.set('error', 'no_stream_key');
    }

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(
      new URL('/?error=callback_failed', request.url)
    );
  }
}
