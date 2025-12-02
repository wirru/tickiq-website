import { ImageResponse } from 'next/og';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          fontSize: 64,
          background: 'linear-gradient(to bottom, #000, #333)',
          color: 'white',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        Hello from tickIQ!
      </div>
    ),
    {
      width: 600,
      height: 400,
    }
  );
}
