/**
 * Minimal @vercel/og test endpoint
 */
import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'edge',
};

export default async function handler() {
  return new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          fontSize: 64,
          background: 'linear-gradient(to bottom, #000, #333)',
          color: 'white',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
        },
        children: 'Hello from tickIQ!',
      },
    },
    {
      width: 600,
      height: 400,
    }
  );
}
